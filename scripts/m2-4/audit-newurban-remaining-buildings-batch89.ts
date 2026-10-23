// Compare remaining original NewUrban states with all accepted theater donors.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-building-reuse-batch89-v1';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const priorFile = '.artifacts/m2-4/newurban-buildings-batch88-20261020/inventory-reconciliation-v1.json';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guide = read(guideFile), prior = read(priorFile);
const gaps = prior.remainingGaps.filter((group: any) => group.kind === 'building');
assert.equal(gaps.length, 35);
const names = new Set(gaps.map((group: any) => group.member));
const sources = guide.sources.filter((source: any) => names.has(source.member));
assert.equal(sources.length, 35);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
const exact = (name: string, expected?: string) => {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (!expected || sha(file.getBytes()) === expected) return file;
    }
    throw new Error(`Pinned original member unavailable: ${name} ${expected}`);
};
const iso = exact('isoubn.pal'), isoSha = sha(iso.getBytes());
assert.equal(isoSha, '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676');
const authorities = ['urban', 'desert', 'snow'].map(theater => {
    const file = `desktop/environment-${theater}-hd-contract.json`, contract = read(file);
    const folder = path.join('.local/environment-packs', contract.selectedPack.revision);
    assert.equal(sha(readFileSync(path.join(folder, 'manifest.json'))), contract.selectedPack.sha256);
    return { theater, file, contract, folder, pack: read(path.join(folder, 'manifest.json')) };
});
const rows: any[] = [];
for (const source of sources) {
    const target = new ShpFile(exact(source.member, source.sha256));
    const count = source.totalFrames / (source.hasShadow ? 2 : 1);
    assert(Number.isInteger(count) && count > 0);
    const candidates: any[] = [];
    for (const authority of authorities) {
        const familyNames = [...new Set(source.bindings.map((binding: any) =>
            authority.contract.identities[binding.edition]?.[binding.id]).filter(Boolean))] as string[];
        for (const family of familyNames) {
            const definition = authority.contract.families[family];
            if (definition.sourceScope) continue;
            const entries = authority.pack.families[family].members;
            for (const entry of entries) {
                const descriptor = authority.contract.sources[entry.member];
                if (descriptor.bodyFrames !== count || entry.member.slice(2) !== source.member.slice(2)) continue;
                const original = new ShpFile(exact(entry.member, descriptor.sha256));
                const slots = [];
                for (let slot = 0; slot < count; slot++) {
                    const a = original.images[slot], b = target.images[slot];
                    assert.equal(sha(b.imageData), source.frames[slot].indexSha256);
                    const context = descriptor.framePalettes?.[String(slot)];
                    const rubble = count === 4 && slot === 3;
                    const oldPalette = exact((context ?? descriptor.palette).member,
                        (context ?? descriptor.palette).sha256).getBytes();
                    const newPalette = rubble ? iso.getBytes() : exact(source.palette.member, source.palette.sha256).getBytes();
                    const oldOwner = context?.remapable ?? descriptor.remapable;
                    const newOwner = rubble ? false : source.remapable;
                    const geometry = [original.width, original.height, a.x, a.y, a.width, a.height].join(',')
                        === [target.width, target.height, b.x, b.y, b.width, b.height].join(',');
                    let rgb = 0, owner = 0, contact = 0, alpha = 0, index = 0;
                    const differences = [];
                    if (geometry) for (let i = 0; i < b.imageData.length; i++) {
                        const x = a.imageData[i], y = b.imageData[i];
                        const xo = oldOwner && x >= 16 && x <= 31, yo = newOwner && y >= 16 && y <= 31;
                        const different = !!x !== !!y || (x && y && !xo && !yo
                            && [0, 1, 2].some(c => oldPalette[x * 3 + c] !== newPalette[y * 3 + c]));
                        if (different) rgb++;
                        if (!!xo !== !!yo || xo && x !== y) owner++;
                        if ((x === 12) !== (y === 12)) contact++;
                        if (!!x !== !!y) alpha++;
                        if (x !== y) {
                            index++;
                            if (differences.length < 40) differences.push({ x: i % b.width, y: Math.floor(i / b.width), from: x, to: y });
                        }
                    }
                    slots.push({ slot, sameGeometry: geometry, differingRgb: rgb, differingOwner: owner,
                        differingContact: contact, differingAlpha: alpha, differingIndices: index, differences,
                        nativeIndexSha256: sha(b.imageData), donorIndexSha256: sha(a.imageData),
                        nativeSize: [b.width, b.height], nativeOrigin: [b.x, b.y],
                        donorSize: [a.width, a.height], donorOrigin: [a.x, a.y],
                        nativePaletteSha256: sha(newPalette), donorPaletteSha256: sha(oldPalette),
                        exact: geometry && oldOwner === newOwner && !rgb && !owner && !contact });
                }
                const metadataFile = path.join(authority.folder, entry.path);
                assert.equal(sha(readFileSync(metadataFile)), entry.sha256);
                candidates.push({ theater: authority.theater, family, member: entry.member,
                    sourceSha256: descriptor.sha256, metadata: pin(metadataFile),
                    completeDonorMembers: definition.members, slots,
                    exactSlots: slots.filter(slot => slot.exact).map(slot => slot.slot) });
            }
        }
    }
    rows.push({ member: source.member, sourceSha256: source.sha256, key: source.key,
        identities: [...new Set(source.bindings.map((binding: any) => binding.id))], candidates });
}
mkdirSync(root, { recursive: false });
writeFileSync(path.join(root, 'accepted-donor-audit-v1.json'), JSON.stringify({
    status: 'PASS_READ_ONLY_35_REMAINING_BUILDING_DONOR_COMPARISON_NOT_FAMILY_COVERAGE',
    guide: pin(guideFile), prior: pin(priorFile),
    acceptedContracts: authorities.map(a => ({ theater: a.theater, contract: pin(a.file), pack: a.contract.selectedPack })),
    rows, resourcesChanged: false, windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(row => ({ member: row.member, candidates: row.candidates.map((c: any) =>
    ({ theater: c.theater, exact: c.exactSlots, linked: c.completeDonorMembers.length })) }))));
