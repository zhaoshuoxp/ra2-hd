// Reproject the generated rotor master and reconstruct source-defined steel contours.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
const root = process.cwd(), constructionYardOnly = process.argv.includes('--construction-yard-only');
const revision = constructionYardOnly ? 'rotor-cycle-20261020-v2' : 'mechanical-layers-20261020-v1';
const work = path.resolve('.artifacts/presentation-feedback-20261020');
const sources = JSON.parse(await fs.readFile(path.join(work, 'repair-source.json'))).filter(record => !constructionYardOnly || record.family === 'GACNST');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const master = await fs.readFile('art/presentation-feedback-20261020/fan-master.png');
const session = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/ui/feedback-art-shell.mjs')], cwd: '/private/tmp', timeout: 60000 });
const receipts = [];
try {
    const page = await session.firstWindow();
    for (const record of sources) {
        const manifest = structuredClone(record.hd), directory = path.resolve('.local/hd-packs', manifest.packId, revision);
        await fs.mkdir(directory, { recursive: false });
        const ledger = [];
        for (const variant of manifest.variants) for (const atlas of variant.pages) {
            const base = await fs.readFile(path.join(record.root, atlas.base)), data = await fs.readFile(path.join(record.root, atlas.data));
            const result = await page.evaluate(async ({ record, variant, atlas, base, data, master }) => {
                const image = async value => createImageBitmap(new Blob([Uint8Array.from(atob(value), c => c.charCodeAt(0))], { type: 'image/png' }));
                const old = await image(base), masks = await image(data), rotor = await image(master);
                const canvas = document.createElement('canvas'); canvas.width = old.width; canvas.height = old.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(old, 0, 0);
                const mask = document.createElement('canvas'); mask.width = masks.width; mask.height = masks.height;
                const mctx = mask.getContext('2d'); mctx.drawImage(masks, 0, 0);
                const disk = document.createElement('canvas'); disk.width = rotor.width; disk.height = rotor.height;
                const dctx = disk.getContext('2d'); dctx.drawImage(rotor, 0, 0);
                const rgba = dctx.getImageData(0, 0, disk.width, disk.height).data;
                let left = disk.width, top = disk.height, right = 0, bottom = 0;
                for (let y = 0; y < disk.height; y++) for (let x = 0; x < disk.width; x++) if (rgba[(y * disk.width + x) * 4 + 3] > 16) {
                    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
                }
                const drawRotor = (x, y, rx, ry, phase, count = 6) => {
                    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
                    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.clip();
                    ctx.fillStyle = '#111619'; ctx.fill(); ctx.rotate(phase * Math.PI / (4 * count));
                    ctx.drawImage(rotor, left, top, right - left + 1, bottom - top + 1, -1, -1, 2, 2); ctx.restore();
                };
                const stats = [];
                for (const frame of variant.frames.filter(frame => frame.page === atlas.id)) {
                    const meta = record.hd.logical.frames[frame.nativeFrame], native = record.frames[frame.nativeFrame];
                    if (meta.empty || meta.trimSize[0] < 2 || meta.trimSize[1] < 2) continue;
                    const [x, y, w, h] = frame.sampleRect, density = variant.density;
                    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
                    if (record.family === 'GAWEAP' || record.family === 'GACNST') {
                        ctx.clearRect(x, y, w, h); mctx.clearRect(x, y, w, h); mctx.fillStyle = '#000'; mctx.fillRect(x, y, w, h);
                        ctx.translate(x, y); ctx.scale(density, density); ctx.translate(-meta.trimOrigin[0], -meta.trimOrigin[1]);
                        if (record.family === 'GAWEAP') drawRotor(90, 145.25, 8.3, 3.7, frame.nativeFrame % 6);
                        else { drawRotor(133.2, 120.1, 11.6, 4.6, frame.nativeFrame % 4, 4); drawRotor(160.2, 106.6, 11.2, 4.6, frame.nativeFrame % 4, 4); }
                        stats.push({ frame: frame.nativeFrame, rotors: record.family === 'GACNST' ? 2 : 1 });
                    } else {
                        // Trace the original neutral steel silhouette; ore animation remains authored.
                        const steel = (px, py) => {
                            if (px < 0 || py < 0 || px >= native.width || py >= native.height) return false;
                            const index = native.pixels[py * native.width + px];
                            if (!index || index >= 16 && index < 32) return false;
                            const [r, g, b] = record.palette[index];
                            return Math.max(r, g, b) - Math.min(r, g, b) < 38 && r + g + b > 60;
                        };
                        const edges = new Map();
                        const add = (a, b) => { const key = a.join(','); if (!edges.has(key)) edges.set(key, []); edges.get(key).push(b); };
                        let metalPixels = 0;
                        for (let py = 0; py < native.height; py++) for (let px = 0; px < native.width; px++) if (steel(px, py)) {
                            metalPixels++;
                            if (!steel(px, py - 1)) add([px, py], [px + 1, py]);
                            if (!steel(px + 1, py)) add([px + 1, py], [px + 1, py + 1]);
                            if (!steel(px, py + 1)) add([px + 1, py + 1], [px, py + 1]);
                            if (!steel(px - 1, py)) add([px, py + 1], [px, py]);
                        }
                        ctx.translate(x, y); ctx.scale(density, density);
                        const shade = ctx.createLinearGradient(0, 0, native.width, native.height);
                        shade.addColorStop(0, '#d9e0e4'); shade.addColorStop(.35, '#798791'); shade.addColorStop(.55, '#d5dde0'); shade.addColorStop(1, '#3d464d');
                        ctx.fillStyle = shade; ctx.beginPath();
                        while (edges.size) {
                            const start = [...edges.keys()][0], polygon = [start.split(',').map(Number)]; let key = start;
                            for (let step = 0; step < native.width * native.height * 5; step++) {
                                const list = edges.get(key); if (!list?.length) break;
                                const point = list.pop(); if (!list.length) edges.delete(key); polygon.push(point); key = point.join(','); if (key === start) break;
                            }
                            if (polygon.length < 4) continue;
                            // Round corners by a fraction of a native pixel at 4X sampling.
                            for (let i = 0; i < polygon.length - 1; i++) {
                                const a = polygon[i], b = polygon[(i + 1) % (polygon.length - 1)];
                                const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                                if (!i) ctx.moveTo(mid[0], mid[1]); else ctx.quadraticCurveTo(a[0], a[1], mid[0], mid[1]);
                            }
                            ctx.closePath();
                        }
                        ctx.fill('evenodd'); stats.push({ frame: frame.nativeFrame, retainedSteelSourcePixels: metalPixels });
                    }
                    ctx.restore();
                }
                const png = c => c.toDataURL('image/png').split(',')[1];
                old.close(); masks.close(); rotor.close();
                return { base: png(canvas), data: png(mask), stats };
            }, { record, variant, atlas, base: base.toString('base64'), data: data.toString('base64'), master: master.toString('base64') });
            for (const role of ['base', 'data']) {
                const bytes = Buffer.from(result[role], 'base64');
                await fs.writeFile(path.join(directory, atlas[role]), bytes);
                atlas[role + 'Sha256'] = sha(bytes); atlas[role + 'Bytes'] = bytes.length;
            }
            ledger.push({ density: variant.density, page: atlas.id, frames: result.stats });
        }
        manifest.packRevision = revision;
        manifest.presentationRepair = { sourceMemberManifest: path.relative(root, path.join(record.root, 'manifest.json')),
            generatedFanMasterSha256: sha(master), method: record.family === 'GAREFN' ? 'native-neutral-steel-contours-over-retained-ore-animation' : 'registered-generated-rotor-only-no-duplicate-housing',
            originalLogicalGeometryAndFrameOrderPreserved: true, ledger };
        const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n'); await fs.writeFile(path.join(directory, 'manifest.json'), bytes);
        receipts.push({ key: record.key, member: record.member.member, packId: manifest.packId, revision, manifestSha256: sha(bytes), ledger });
    }
} finally { await session.close(); }
const catalogFile = 'desktop/allied-building-coverage.json', catalog = JSON.parse(await fs.readFile(catalogFile));
for (const key of new Set(receipts.map(row => row.key))) {
    const old = catalog[key], source = '.local/' + old.familyPath, family = JSON.parse(await fs.readFile(source));
    for (const row of receipts.filter(row => row.key === key)) {
        const member = family.members.find(member => member.member === row.member);
        Object.assign(member, { revision, sha256: row.manifestSha256 });
    }
    family.presentationRepair = { date: '2026-10-20', originalFamily: old.familyPath, changedMembers: receipts.filter(row => row.key === key).map(row => row.member) };
    const target = path.join(path.dirname(path.dirname(source)), revision, 'family.json');
    await fs.mkdir(path.dirname(target), { recursive: false });
    const bytes = Buffer.from(JSON.stringify(family, null, 2) + '\n'); await fs.writeFile(target, bytes);
    old.familyPath = target.replace(/^\.local\//, ''); old.familyHash = sha(bytes);
}
await fs.writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
await fs.writeFile(path.join(work, constructionYardOnly ? 'building-repair-v2.json' : 'building-repair.json'), JSON.stringify({ revision, receipts }, null, 2) + '\n');
console.log(JSON.stringify({ revisedMembers: receipts.length, families: new Set(receipts.map(row => row.key)).size }));
