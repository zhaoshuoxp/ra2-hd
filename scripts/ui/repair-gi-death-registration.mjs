import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
const work = path.resolve(process.argv[2]), revision = process.argv[3] ?? 'presentation-r4-20261021-v3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const contract = JSON.parse(await fs.readFile('desktop/allied-unit-contracts.json'));
const selected = JSON.parse(await fs.readFile(path.join(work, 'base-allied-unit-contracts.json'))).shp.E1;
contract.shp.E1 = selected;
const oldFamily = JSON.parse(await fs.readFile(path.join('.local', selected.familyPath)));
const oldRoot = path.resolve('.local/hd-packs/allied-gi-authored/animation-r9');
const manifestBytes = await fs.readFile(path.join(oldRoot, 'manifest.json')), manifest = JSON.parse(manifestBytes);
assert.equal(sha(manifestBytes), selected.members[0].manifestHash);
const source = JSON.parse(await fs.readFile(path.join(work, 'retail-v2/ra2-gi.shp.json')));
const nativeBodyBounds = frame => {
    const points = frame.pixels.flatMap((index, i) => index && index !== 12 ? [[i % frame.width, Math.floor(i / frame.width)]] : []);
    return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])) + 1, Math.max(...points.map(p => p[1])) + 1];
};
const standing = nativeBodyBounds(source.frames[0]), extent = standing[3] - standing[1];
const corrections = source.frames.slice(134, 149).flatMap(frame => {
    const bounds = nativeBodyBounds(frame), size = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]);
    return size > extent ? [{ frame: frame.frame, scale: extent / size, pivot: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], nativeBodyBounds: bounds }] : [];
});
const root = path.resolve('.local/hd-packs/allied-gi-authored', revision);
await fs.mkdir(root, { recursive: false });
const app = await electron.launch({ args: [path.resolve('scripts/ui/feedback-art-shell.mjs')] });
const report = {    
status: 'RUNNING', revision, baseManifestSha256: sha(manifestBytes), sourceSha256: source.sha256,
    method: 'Bounded affine registration of existing body pixels; original ground pixels, native geometry, timing and unaffected frames remain unchanged.',
    referenceStandingExtent: extent, corrections, variants: []
};
try {
    const page = await app.firstWindow();
    for (const variant of manifest.variants) {
        const changedPages = new Set(corrections.map(c => variant.frames[c.frame].page));
        for (const descriptor of variant.pages) {
            const baseFile = path.join(oldRoot, descriptor.base), dataFile = path.join(oldRoot, descriptor.data);
            if (!changedPages.has(descriptor.id)) {
                await fs.copyFile(baseFile, path.join(root, descriptor.base));
                await fs.copyFile(dataFile, path.join(root, descriptor.data));
                continue;
            }
            const result = await page.evaluate(async ({ base, data, frames, sourceFrames, corrections, density }) => {
                const decode = async bytes => {
                    const image = new Image();
                    image.src = 'data:image/png;base64,' + bytes;
                    await image.decode();
                    const c = document.createElement('canvas');
                    c.width = image.width;
                    c.height = image.height;
                    c.getContext('2d').drawImage(image, 0, 0);
                    return c;
                };
                const b = await decode(base), d = await decode(data), bc = b.getContext('2d'), dc = d.getContext('2d');
                const beforeB = bc.getImageData(0, 0, b.width, b.height).data, beforeD = dc.getImageData(0, 0, d.width, d.height).data;
                const allowed = new Uint8Array(b.width * b.height), proof = [];
                for (const correction of corrections) {
                    const frame = frames[correction.frame], native = sourceFrames[correction.frame], [x, y, w, h] = frame.contentRect;
                    const original = bc.getImageData(x, y, w, h), semantic = dc.getImageData(x, y, w, h);
                    const body = document.createElement('canvas');
                    body.width = w;
                    body.height = h;
                    const map = document.createElement('canvas');
                    map.width = w;
                    map.height = h;
                    const ground = bc.createImageData(w, h), bodyPixels = bc.createImageData(w, h), mapPixels = bc.createImageData(w, h);
                    for (let p = 0; p < original.data.length; p += 4) {
                        const pixel = original.data.subarray(p, p + 4), local = p / 4;
                        const nativeIndex = native.pixels[Math.floor(Math.floor(local / w) / density) * native.width + Math.floor(local % w / density)];
                        const shadow = pixel[3] && nativeIndex === 12 && semantic.data[p] === 0 && Math.max(...pixel.subarray(0, 3)) === 0;
                        if (shadow) ground.data.set(pixel, p);
                        else if (pixel[3]) {                            
bodyPixels.data.set(pixel, p);
                            mapPixels.data.set(semantic.data.subarray(p, p + 4), p);                        
}
                    }
                    body.getContext('2d').putImageData(bodyPixels, 0, 0);
                    map.getContext('2d').putImageData(mapPixels, 0, 0);
                    const px = correction.pivot[0] * density, py = correction.pivot[1] * density, s = correction.scale;
                    bc.clearRect(x, y, w, h);
                    bc.putImageData(ground, x, y);
                    dc.clearRect(x, y, w, h);
                    bc.imageSmoothingEnabled = true;
                    bc.imageSmoothingQuality = 'high';
                    dc.imageSmoothingEnabled = false;
                    bc.drawImage(body, x + px * (1 - s), y + py * (1 - s), w * s, h * s);
                    dc.drawImage(map, x + px * (1 - s), y + py * (1 - s), w * s, h * s);
                    const outB = bc.getImageData(x, y, w, h), outD = dc.getImageData(x, y, w, h);
                    for (let p = 0; p < outD.data.length; p += 4) {
                        if (!outB.data[p + 3]) outD.data[p] = outD.data[p + 1] = outD.data[p + 2] = 0;
                        outD.data[p + 3] = 255;
                    }
                    dc.putImageData(outD, x, y);
                    for (let yy = y; yy < y + h; yy++)for (let xx = x; xx < x + w; xx++)allowed[yy * b.width + xx] = 1;
                    proof.push({ frame: correction.frame, scale: s, rect: [x, y, w, h] });
                }
                const afterB = bc.getImageData(0, 0, b.width, b.height).data, afterD = dc.getImageData(0, 0, d.width, d.height).data;
                let outside = 0;
                for (let i = 0; i < allowed.length; i++)if (!allowed[i]) for (let c = 0; c < 4; c++)if (beforeB[i * 4 + c] !== afterB[i * 4 + c] || beforeD[i * 4 + c] !== afterD[i * 4 + c]) outside++;
                return { base: b.toDataURL('image/png').split(',')[1], data: d.toDataURL('image/png').split(',')[1], outside, proof };
            }, {                
base: (await fs.readFile(baseFile)).toString('base64'), data: (await fs.readFile(dataFile)).toString('base64'),
                frames: variant.frames, sourceFrames: source.frames, corrections: corrections.filter(c => variant.frames[c.frame].page === descriptor.id), density: variant.density            
});
            assert.equal(result.outside, 0, 'Only the affected native frame rectangles may change');
            for (const role of ['base', 'data']) {
                const bytes = Buffer.from(result[role], 'base64');
                await fs.writeFile(path.join(root, descriptor[role]), bytes);
                descriptor[role + 'Sha256'] = sha(bytes);
                descriptor[role + 'Bytes'] = bytes.length;
            }
            report.variants.push({ density: variant.density, page: descriptor.id, outsideChangedChannels: 0, frames: result.proof });
        }
    }
} finally { await app.close(); }
manifest.packRevision = revision;
manifest.correction = { ...report, status: 'SOURCE_REGISTERED_REVIEW_CANDIDATE' };
const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), manifestHash = sha(bytes);
await fs.writeFile(path.join(root, 'manifest.json'), bytes);
const family = { ...oldFamily, members: oldFamily.members.map(m => ({ ...m, revision, sha256: manifestHash })) };
const familyBytes = Buffer.from(JSON.stringify(family, null, 2) + '\n'), familyHash = sha(familyBytes);
const familyRoot = path.resolve('.local/hd-packs/allied-e1-family', revision);
await fs.mkdir(familyRoot, { recursive: false });
await fs.writeFile(path.join(familyRoot, 'family.json'), familyBytes);
selected.familyPath = path.relative(path.resolve('.local'), path.join(familyRoot, 'family.json'));
selected.hash = selected.familyHash = familyHash;
selected.members[0].manifestHash = manifestHash;
await fs.writeFile('desktop/allied-unit-contracts.json', JSON.stringify(contract, null, 2) + '\n');
report.status = 'PASS_ONLY_GI_DEATH_BODY_REGISTRATION_CHANGED';
report.familyPath = selected.familyPath;
report.familyHash = familyHash;
report.manifestHash = manifestHash;
await fs.writeFile(path.join(work, 'gi-death-registration.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, manifestHash, frames: corrections.map(c => c.frame) }));
