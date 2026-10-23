// Qualify actual sprite geometry independently of source-file transparent margins.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1';
const priorFile = '.artifacts/m2-4/newurban-rock-crates-batch90-20261020/inventory-reconciliation-v1.json';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const prior = read(priorFile), guide = read(guideFile);
const gaps = prior.remainingGaps.filter((group: any) => group.kind === 'building');
const bodyNames = new Set(gaps.map((group: any) => group.member));
const ids = new Set(guide.sources.filter((source: any) => bodyNames.has(source.member))
    .flatMap((source: any) => source.bindings.map((binding: any) => binding.id)));
const sources = guide.sources.filter((source: any) => source.bindings.some((binding: any) => ids.has(binding.id)));
assert.equal(sources.length, 30);
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
const authorities = ['urban', 'desert', 'snow'].map(theater => {
    const file = `desktop/environment-${theater}-hd-contract.json`, contract = read(file);
    const folder = path.join('.local/environment-packs', contract.selectedPack.revision);
    assert.equal(sha(readFileSync(path.join(folder, 'manifest.json'))), contract.selectedPack.sha256);
    return { theater, file, contract, folder, pack: read(path.join(folder, 'manifest.json')) };
});
const iso = { member: 'isoubn.pal', sha256: '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676' };
function origin(shp: ShpFile, slot: number) {
    const image = shp.images[slot];
    // ShpBuilder and HD BatchShpBuilder use the same floor-based native canvas center.
    return [image.x - Math.floor(shp.width / 2), image.y - Math.floor(shp.height / 2)];
}
const rows = sources.map((source: any) => {
    const target = new ShpFile(exact(source.member, source.sha256));
    const count = source.totalFrames / (source.hasShadow ? 2 : 1);
    const linked = !source.bindings.some((binding: any) => binding.role === 'body');
    const candidates: any[] = [];
    for (const authority of authorities) {
        const families = new Set(source.bindings.map((binding: any) =>
            authority.contract.identities[binding.edition]?.[binding.id]).filter(Boolean));
        for (const family of families as Set<string>) {
            const definition = authority.contract.families[family];
            if (definition.sourceScope) continue;
            for (const entry of authority.pack.families[family].members) {
                const descriptor = authority.contract.sources[entry.member];
                if (descriptor.bodyFrames !== count || entry.member.slice(2) !== source.member.slice(2)) continue;
                const donor = new ShpFile(exact(entry.member, descriptor.sha256));
                const slots = Array.from({ length: count }, (_, slot) => {
                    const a = donor.images[slot], b = target.images[slot];
                    assert.equal(sha(b.imageData), source.frames[slot].indexSha256);
                    const ao = origin(donor, slot), bo = origin(target, slot);
                    const left = Math.min(ao[0], bo[0]), top = Math.min(ao[1], bo[1]);
                    const width = Math.max(ao[0] + a.width, bo[0] + b.width) - left;
                    const height = Math.max(ao[1] + a.height, bo[1] + b.height) - top;
                    const pixel = (image: any, o: number[], x: number, y: number) =>
                        x >= o[0] && x < o[0] + image.width && y >= o[1] && y < o[1] + image.height
                            ? image.imageData[(y - o[1]) * image.width + x - o[0]] : 0;
                    const oldContext = descriptor.framePalettes?.[String(slot)] ?? descriptor.palette;
                    const rubble = !linked && count === 4 && slot === 3;
                    const newContext = rubble ? iso : source.palette;
                    const ap = exact(oldContext.member, oldContext.sha256).getBytes();
                    const bp = exact(newContext.member, newContext.sha256).getBytes();
                    const remapA = oldContext.remapable ?? descriptor.remapable;
                    const remapB = rubble ? false : source.remapable;
                    let rgb = 0, owner = 0, alpha = 0, index12 = 0, indices = 0;
                    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
                        const u = pixel(a, ao, x, y), v = pixel(b, bo, x, y);
                        const uo = remapA && u >= 16 && u <= 31, vo = remapB && v >= 16 && v <= 31;
                        if (!!u !== !!v || u && v && !uo && !vo && [0, 1, 2].some(c => ap[u * 3 + c] !== bp[v * 3 + c])) rgb++;
                        if (!!uo !== !!vo || uo && u !== v) owner++;
                        if (!!u !== !!v) alpha++;
                        if ((u === 12) !== (v === 12)) index12++;
                        if (u !== v) indices++;
                    }
                    const sameAnchoredTrim = ao.join() === bo.join() && a.width === b.width && a.height === b.height;
                    return { slot, exactAnchoredBody: remapA === remapB && !rgb && !owner && !alpha && !index12,
                        sameAnchoredTrim, nativeOrigin: [b.x, b.y], donorOrigin: [a.x, a.y],
                        nativeAnchorOffset: bo, donorAnchorOffset: ao,
                        nativeSize: [b.width, b.height], donorSize: [a.width, a.height],
                        nativeCanvas: [target.width, target.height], donorCanvas: [donor.width, donor.height],
                        differingRgb: rgb, differingOwner: owner, differingAlpha: alpha,
                        differingIndex12: index12, differingIndices: indices,
                        nativeIndexSha256: sha(b.imageData), donorIndexSha256: sha(a.imageData),
                        nativePaletteSha256: sha(bp), donorPaletteSha256: sha(ap) };
                });
                const metadata = path.join(authority.folder, entry.path);
                assert.equal(sha(readFileSync(metadata)), entry.sha256);
                candidates.push({ theater: authority.theater, family, member: entry.member,
                    originalSha256: descriptor.sha256, acceptedMetadata: pin(metadata),
                    completeDonorMembers: definition.members, slots,
                    exactAnchoredSlots: slots.filter(slot => slot.exactAnchoredBody).map(slot => slot.slot) });
            }
        }
    }
    return { member: source.member, sourceSha256: source.sha256, linked, bodyCount: count,
        identities: [...new Set(source.bindings.map((binding: any) => binding.id))],
        nativeBindings: source.bindings, candidates };
});
writeFileSync(path.join(root, 'accepted-anchor-donor-audit-v1.json'), JSON.stringify({
    status: 'PASS_READ_ONLY_NATIVE_ANCHOR_DONOR_AUDIT_NOT_FAMILY_COVERAGE',
    originalGuide: pin(guideFile), prior: pin(priorFile),
    anchorImplementation: ['src/engine/renderable/builder/ShpBuilder.ts',
        'src/engine/renderable/builder/BatchShpBuilder.ts'].map(pin),
    acceptedAuthorities: authorities.map(authority => ({ theater: authority.theater,
        contract: pin(authority.file), selectedPack: authority.contract.selectedPack })),
    rows, resourcesChanged: false, qualification: 'Compare rendered original RGB, ownership, alpha, index-12 semantics and native anchor coordinates. Different transparent canvas margins alone are not different geometry. Target Art/Rules, logical canvas, original trims and separate shadows remain authoritative. Export and runtime validation are still required.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(row => ({ member: row.member, linked: row.linked,
    candidates: row.candidates.map(candidate => ({ theater: candidate.theater, exact: candidate.exactAnchoredSlots,
        total: row.bodyCount })) }))));
