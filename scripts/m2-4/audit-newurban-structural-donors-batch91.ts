// Distinguish reusable structure from palette-index changes and header registration.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-building-canvas-reuse-batch91-v1';
const proofFile = `${root}/accepted-anchor-donor-audit-v1.json`;
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const proof = read(proofFile), guide = read(guideFile);
assert.deepEqual(pin(guideFile), proof.originalGuide);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned source unavailable: ${name} ${expected}`);
}
const contracts = Object.fromEntries(['urban', 'desert', 'snow'].map(theater =>
    [theater, read(`desktop/environment-${theater}-hd-contract.json`)]));
const iso = { member: 'isoubn.pal', sha256: '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676' };
const rows = proof.rows.map((row: any) => {
    const source = guide.sources.find((source: any) => source.member === row.member && source.sha256 === row.sourceSha256);
    const target = new ShpFile(exact(row.member, row.sourceSha256));
    const candidates = row.candidates.map((candidate: any) => {
        const descriptor = contracts[candidate.theater].sources[candidate.member];
        const original = new ShpFile(exact(candidate.member, candidate.originalSha256));
        const slots = candidate.slots.map((anchor: any) => {
            const slot = anchor.slot, a = original.images[slot], b = target.images[slot];
            const sameTrimSize = a.width === b.width && a.height === b.height;
            if (!sameTrimSize) return { slot, sameTrimSize, structuralReuse: 'REQUIRES_EXPLICIT_REGISTRATION_OR_NEW_ART' };
            const oldContext = descriptor.framePalettes?.[String(slot)] ?? descriptor.palette;
            const rubble = !row.linked && row.bodyCount === 4 && slot === 3;
            const newContext = rubble ? iso : source.palette;
            const ap = exact(oldContext.member, oldContext.sha256).getBytes();
            const bp = exact(newContext.member, newContext.sha256).getBytes();
            const remapA = oldContext.remapable ?? descriptor.remapable;
            const remapB = rubble ? false : source.remapable;
            let alpha = 0, owner = 0, rgb = 0, outsideContactRgb = 0, contact = 0, material = 0;
            const pairs = new Map<string, number>(), mapping = new Map<number, Map<number, number>>();
            for (let i = 0; i < b.imageData.length; i++) {
                const u = a.imageData[i], v = b.imageData[i];
                const uo = remapA && u >= 16 && u <= 31, vo = remapB && v >= 16 && v <= 31;
                if (!!u !== !!v) alpha++;
                if (!!uo !== !!vo || uo && u !== v) owner++;
                if ((u === 12) !== (v === 12)) contact++;
                const changed = !!u !== !!v || u && v && !uo && !vo
                    && [0, 1, 2].some(c => ap[u * 3 + c] !== bp[v * 3 + c]);
                if (changed) {
                    rgb++;
                    if (u !== 12 && v !== 12) outsideContactRgb++;
                }
                if (u !== v) pairs.set(`${u}:${v}`, (pairs.get(`${u}:${v}`) ?? 0) + 1);
                if (u && v && !uo && !vo) {
                    material++;
                    if (!mapping.has(u)) mapping.set(u, new Map());
                    const histogram = mapping.get(u)!;
                    histogram.set(v, (histogram.get(v) ?? 0) + 1);
                }
            }
            const indexMapping = [...mapping].map(([from, histogram]) => ({ from,
                targets: [...histogram].map(([to, count]) => ({ to, count })).sort((a, b) => b.count - a.count) }));
            const dominant = indexMapping.reduce((sum, entry) => sum + entry.targets[0].count, 0);
            const classification = !alpha && !owner && !rgb && !contact
                ? 'EXACT_TRIM_RENDERED_PAYLOAD_WITH_TARGET_NATIVE_HEADER'
                : !alpha && !owner && !outsideContactRgb
                    ? 'ACCEPTED_STRUCTURE_WITH_LOCAL_NATIVE_CONTACT_ADAPTATION'
                    : !alpha && !owner && rubble
                        ? 'ACCEPTED_RUBBLE_STRUCTURE_REQUIRES_EXPLICIT_COLOR_TRANSFER'
                        : 'REQUIRES_EXPLICIT_REGISTRATION_OR_NEW_ART';
            return { slot, sameTrimSize, structuralReuse: classification,
                sameAnchoredTrim: anchor.sameAnchoredTrim, nativeOrigin: [b.x, b.y], donorOrigin: [a.x, a.y],
                differingAlpha: alpha, differingOwner: owner, differingRgb: rgb,
                differingRgbOutsideContact: outsideContactRgb, differingIndex12: contact,
                fixedMaterialPixels: material, dominantOriginalIndexMappingRatio: material ? dominant / material : 1,
                changedIndexPairs: [...pairs].map(([pair, count]) => ({ pair, count })), indexMapping,
                nativeIndexSha256: sha(b.imageData), donorIndexSha256: sha(a.imageData),
                nativePaletteSha256: sha(bp), donorPaletteSha256: sha(ap) };
        });
        return { theater: candidate.theater, member: candidate.member, acceptedMetadata: candidate.acceptedMetadata, slots };
    });
    return { member: row.member, linked: row.linked, candidates };
});
writeFileSync(`${root}/accepted-structural-donor-audit-v1.json`, JSON.stringify({
    status: 'PASS_READ_ONLY_STRUCTURE_COLOR_AND_CONTACT_CLASSIFICATION_NOT_FAMILY_COVERAGE',
    anchorProof: pin(proofFile), originalGuide: pin(guideFile), rows, resourcesChanged: false,
    policy: 'Exact source equality is sufficient, not necessary, for reusing accepted artwork. Keep target source headers, palettes, shadows and gameplay authoritative. Color/contact differences require explicit bounded material adaptation and native checks; they do not justify redrawing unchanged architecture or animation.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.filter((row: any) => ['cnnwy24.shp', 'cntexs06.shp', 'cntexs07.shp',
    'cnoild.shp', 'cnairp.shp', 'cnhosp.shp'].includes(row.member)).map((row: any) => ({ member: row.member,
    candidates: row.candidates.filter((candidate: any) => candidate.theater === 'urban').map((candidate: any) =>
        candidate.slots.map((slot: any) => ({ slot: slot.slot, policy: slot.structuralReuse,
            outsideContact: slot.differingRgbOutsideContact, alpha: slot.differingAlpha,
            mappingRatio: slot.dominantOriginalIndexMappingRatio }))) }))));
