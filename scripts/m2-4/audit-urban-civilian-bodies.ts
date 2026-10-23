// Compare actual rendered civilian body slots before authoring or reusing any family.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const [prepared, output, contractFile = 'desktop/environment-hd-contract.json'] = process.argv.slice(2);
assert(prepared && output);
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const guideFile = path.join(prepared, 'source.json'), native = read(guideFile);
const accepted = read(contractFile);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
const exactMember = (name: string, expected?: string) => {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const member = resolveMember(tree, name).file;
        if (!expected || sha(member.getBytes()) === expected) return member;
    }
    return undefined;
};
const rows = [];
for (const source of native.sources) {
    const familyNames = [...new Set(source.bindings.map((binding: any) => accepted.identities[binding.edition]?.[binding.id]).filter(Boolean))];
    const donorNames = [...new Set(familyNames.flatMap((family: any) => accepted.families[family].members))]
        .filter((name: any) => name === source.member || name.slice(2) === source.member.slice(2));
    const count = source.totalFrames / (source.hasShadow ? 2 : 1);
    if (donorNames.length !== 1) {
        rows.push({ member: source.member, sourceSha256: source.sha256, donorNames,
            status: 'NO_UNAMBIGUOUS_ACCEPTED_BODY_DONOR', targetBodyFrames: count });
        continue;
    }
    const donorName = donorNames[0] as string, descriptor = accepted.sources[donorName];
    const donorFile = exactMember(donorName, descriptor.sha256);
    assert(donorFile, donorName + ': accepted original source must remain available');
    const bytes = readFileSync(path.join(prepared, 'native', source.nativeFile));
    assert.equal(sha(bytes), source.sha256);
    const target = new ShpFile(VirtualFile.fromBytes(bytes, source.member));
    const donor = new ShpFile(donorFile), slots = [];
    for (let slot = 0; slot < count; slot++) {
        const a = donor.images[slot], b = target.images[slot], frame = source.frames[slot];
        assert.equal(sha(b.imageData), frame.indexSha256);
        const role = descriptor.framePalettes?.[String(slot)];
        const donorPalette = role ?? descriptor.palette;
        const targetPaletteName = role?.role === 'rubble' ? 'isourb.pal' : source.palette.member;
        const oldPalette = exactMember(donorPalette.member, donorPalette.sha256);
        const newPalette = exactMember(targetPaletteName, role?.role === 'rubble' ? undefined : source.palette.sha256);
        assert(oldPalette && newPalette);
        const xPalette = oldPalette.getBytes(), yPalette = newPalette.getBytes();
        const oldOwner = role?.remapable ?? descriptor.remapable;
        const newOwner = role?.role === 'rubble' ? false : source.remapable;
        const geometry = !!a && [donor.width, donor.height, a.x, a.y, a.width, a.height].join(',')
            === [target.width, target.height, b.x, b.y, b.width, b.height].join(',');
        let differences = 0, contactDifferences = 0, ownerDifferences = 0, alphaDifferences = 0, indexDifferences = 0;
        if (geometry) for (let i = 0; i < b.imageData.length; i++) {
            const x = a.imageData[i], y = b.imageData[i];
            if (x !== y) indexDifferences++;
            if (!!x !== !!y) alphaDifferences++;
            const xo = oldOwner && x >= 16 && x <= 31, yo = newOwner && y >= 16 && y <= 31;
            if (!!x !== !!y || (x && y && !xo && !yo && [0, 1, 2].some(c => xPalette[x * 3 + c] !== yPalette[y * 3 + c]))) differences++;
            if ((x === 12) !== (y === 12)) contactDifferences++;
            if (!!xo !== !!yo || xo && x !== y) ownerDifferences++;
        }
        const exact = geometry && oldOwner === newOwner && !differences && !contactDifferences && !ownerDifferences;
        slots.push({ slot, empty: frame.empty, sameGeometry: geometry, differingRenderedPixels: differences,
            differingContactPixels: contactDifferences, differingOwnerPixels: ownerDifferences,
            differingAlphaPixels: alphaDifferences, differingNativeIndices: indexDifferences,
            role: role?.role ?? 'body', donorPaletteSha256: sha(xPalette), targetPaletteSha256: sha(yPalette),
            status: frame.empty ? 'EXACT_NATIVE_EMPTY_REQUIRED' : exact ? 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR' : 'DISTINCT_BODY_REQUIRES_AUTHORING' });
    }
    rows.push({ member: source.member, sourceSha256: source.sha256, donorMember: donorName,
        donorSourceSha256: descriptor.sha256, targetBodyFrames: count, donorBodyFrames: descriptor.bodyFrames,
        slots, status: slots.every(row => row.status !== 'DISTINCT_BODY_REQUIRES_AUTHORING') && count === descriptor.bodyFrames
            ? 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED' : 'DISTINCT_BODY_OR_SLOT_LAYOUT' });
}
const slots = rows.flatMap(row => row.slots ?? []);
writeFileSync(output, JSON.stringify({ status: 'PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE',
    sourceFile: guideFile, sourceSha256: sha(readFileSync(guideFile)), acceptedContract: contractFile,
    acceptedContractSha256: sha(readFileSync(contractFile)), donorSelectedPack: accepted.selectedPack, rows,
    eligibleVisibleSlots: slots.filter(row => row.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR').length,
    distinctVisibleSlots: slots.filter(row => row.status === 'DISTINCT_BODY_REQUIRES_AUTHORING').length,
    allBodyMatchGroups: rows.filter(row => row.status === 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED').length,
    resourcesChanged: false, completeFamilyReuse: 'NOT_ESTABLISHED',
    policy: 'Compare real original geometry, fixed RGB, native owner shades, contact and alpha per slot, including Iso palette for rubble. Every linked member, runtime role and native shadow remains authoritative. No selection or coverage change.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ groups: rows.length, eligible: slots.filter(row => row.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR').length,
    distinct: slots.filter(row => row.status === 'DISTINCT_BODY_REQUIRES_AUTHORING').length,
    allBodyMatchGroups: rows.filter(row => row.status === 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED').length }));
