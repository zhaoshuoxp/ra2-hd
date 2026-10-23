// Compare original full-canvas pixels before rejecting donors with different trims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1';
const priorFile = '.artifacts/m2-4/newurban-rock-crates-batch90-20261020/inventory-reconciliation-v1.json';
const crossFile = '.artifacts/m2-4/newurban-building-reuse-batch89-v1/accepted-donor-audit-v1.json';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const prior = read(priorFile), cross = read(crossFile), guide = read(guideFile);
assert.deepEqual(pin(guideFile), cross.guide);
const gaps = prior.remainingGaps.filter((group: any) => group.kind === 'building');
assert.equal(gaps.length, 23);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned original unavailable: ${name} ${expected}`);
}
function canvas(shp: ShpFile, slot: number) {
    const image = shp.images[slot], pixels = new Uint8Array(shp.width * shp.height);
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        const cx = image.x + x, cy = image.y + y;
        assert(cx >= 0 && cy >= 0 && cx < shp.width && cy < shp.height);
        pixels[cy * shp.width + cx] = image.imageData[y * image.width + x];
    }
    return pixels;
}
const contracts = Object.fromEntries(['urban', 'desert', 'snow'].map(theater =>
    [theater, read(`desktop/environment-${theater}-hd-contract.json`)]));
const iso = { member: 'isoubn.pal', sha256: '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676' };
const rows = gaps.map((gap: any) => {
    const source = guide.sources.find((source: any) => source.member === gap.member && source.sha256 === gap.sha256);
    assert(source);
    const target = new ShpFile(exact(source.member, source.sha256));
    const oldProof = cross.rows.find((row: any) => row.member === source.member);
    assert(oldProof);
    const candidates = oldProof.candidates.map((candidate: any) => {
        const descriptor = contracts[candidate.theater].sources[candidate.member];
        const donor = new ShpFile(exact(candidate.member, candidate.sourceSha256));
        const sameCanvas = donor.width === target.width && donor.height === target.height;
        const slots = oldProof.candidates.find((row: any) => row === candidate).slots.map((old: any) => {
            if (!sameCanvas) return { slot: old.slot, sameCanvas, exact: false, differingCanvasPixels: null };
            const a = canvas(donor, old.slot), b = canvas(target, old.slot);
            const oldContext = descriptor.framePalettes?.[String(old.slot)] ?? descriptor.palette;
            const newContext = descriptor.bodyFrames === 4 && old.slot === 3 ? iso : source.palette;
            const ap = exact(oldContext.member, oldContext.sha256).getBytes();
            const bp = exact(newContext.member, newContext.sha256).getBytes();
            const ao = oldContext.remapable ?? descriptor.remapable;
            const bo = descriptor.bodyFrames === 4 && old.slot === 3 ? false : source.remapable;
            let rgb = 0, owner = 0, alpha = 0, contact = 0, indices = 0;
            for (let i = 0; i < a.length; i++) {
                const x = a[i], y = b[i], xo = ao && x >= 16 && x <= 31, yo = bo && y >= 16 && y <= 31;
                if (!!x !== !!y || x && y && !xo && !yo && [0, 1, 2].some(c => ap[x * 3 + c] !== bp[y * 3 + c])) rgb++;
                if (!!xo !== !!yo || xo && x !== y) owner++;
                if (!!x !== !!y) alpha++;
                if ((x === 12) !== (y === 12)) contact++;
                if (x !== y) indices++;
            }
            return { slot: old.slot, sameCanvas, exact: ao === bo && !rgb && !owner && !alpha && !contact,
                trimAlreadyEqual: old.sameGeometry, differingRgb: rgb, differingOwner: owner,
                differingAlpha: alpha, differingIndex12: contact, differingIndices: indices,
                nativeCanvasIndexSha256: sha(b), donorCanvasIndexSha256: sha(a),
                nativeOrigin: old.nativeOrigin, donorOrigin: old.donorOrigin,
                nativeSize: old.nativeSize, donorSize: old.donorSize };
        });
        return { theater: candidate.theater, family: candidate.family, member: candidate.member,
            originalSha256: candidate.sourceSha256, acceptedMetadata: candidate.metadata, sameCanvas,
            nativeCanvas: source.canvas, donorCanvas: [donor.width, donor.height], slots,
            exactCanvasSlots: slots.filter((slot: any) => slot.exact).map((slot: any) => slot.slot) };
    });
    const bodyCount = source.totalFrames / (source.hasShadow ? 2 : 1);
    return { member: source.member, identities: gap.identities, sourceSha256: source.sha256,
        maps: gap.maps, bodyCount, nativeRules: source.nativeRules,
        nativeDuplicateStates: Array.from({ length: bodyCount }, (_, slot) => ({ slot,
            sameCanvasAsEarlier: Array.from({ length: slot }, (_, earlier) => earlier).filter(earlier =>
                Buffer.from(canvas(target, slot)).equals(Buffer.from(canvas(target, earlier)))) })), candidates };
});
mkdirSync(root, { recursive: false });
const file = path.join(root, 'accepted-canvas-donor-audit-v1.json');
writeFileSync(file, JSON.stringify({ status: 'PASS_READ_ONLY_FULL_CANVAS_DONOR_AUDIT_NOT_FAMILY_COVERAGE',
    prior: pin(priorFile), originalGuide: pin(guideFile), earlierTrimProof: pin(crossFile), rows,
    resourcesChanged: false, userVisualAcceptance: 'NOT_REQUESTED_PREFLIGHT_ONLY', windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map((row: any) => ({ member: row.member, bodyCount: row.bodyCount,
    duplicateStates: row.nativeDuplicateStates, candidates: row.candidates.map((candidate: any) => ({
        theater: candidate.theater, exactCanvasSlots: candidate.exactCanvasSlots,
        newComparedWithTrimProof: candidate.slots.filter((slot: any) => slot.exact && !slot.trimAlreadyEqual).map((slot: any) => slot.slot)
    })) }))));
