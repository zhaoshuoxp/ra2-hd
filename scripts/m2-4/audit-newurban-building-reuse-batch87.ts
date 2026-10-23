// Compare actual original NewUrban states with accepted Urban donors before production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-reuse-batch87-preflight-v1';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const closureFile = '.artifacts/m2-4/desert-final-buildings-batch86-20261020/coverage-and-native-closure-v1.json';
const contractFile = 'desktop/environment-urban-hd-contract.json';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guide = read(guideFile), accepted = read(contractFile), closure = read(closureFile);
assert.equal(guide.theater, 'NEWURBAN');
assert.equal(sha(readFileSync(guide.inventoryFile)), guide.inventorySha256);
const gaps = closure.theaters.find((row: any) => row.theater === 'NEWURBAN').remainingGaps
    .filter((row: any) => row.kind === 'building');
assert.equal(gaps.length, 98);
const ids = new Set(gaps.flatMap((row: any) => row.identities));
const sources = guide.sources.filter((source: any) => source.format === 'shp'
    && source.bindings.some((binding: any) => ids.has(binding.id)));
const nativeRoot = path.join(path.dirname(guideFile), 'native');
const packRoot = path.join('.local/environment-packs', accepted.selectedPack.revision);
assert.equal(sha(readFileSync(path.join(packRoot, 'manifest.json'))), accepted.selectedPack.sha256);
const pack = read(path.join(packRoot, 'manifest.json'));
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
const iso = exactMember('isoubn.pal');
assert(iso);
const isoBytes = iso.getBytes(), isoSha = sha(isoBytes);
assert.equal(isoSha, '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676');
const rows: any[] = [];
for (const source of sources) {
    const familyNames = [...new Set(source.bindings.map((binding: any) => accepted.identities[binding.edition]?.[binding.id])
        .filter(Boolean))] as string[];
    const donorNames = [...new Set(familyNames.flatMap(family => accepted.families[family].members))]
        .filter((name: any) => name === source.member || name.slice(2) === source.member.slice(2)) as string[];
    const count = source.totalFrames / (source.hasShadow ? 2 : 1);
    const header = { member: source.member, sourceSha256: source.sha256, nativeKey: source.key,
        bindings: source.bindings, targetBodyFrames: count, targetPaletteSha256: source.palette.sha256 };
    if (donorNames.length !== 1 || familyNames.some(family => accepted.families[family].sourceScope)) {
        rows.push({ ...header, donorNames, status: 'NO_UNAMBIGUOUS_UNSCOPED_ACCEPTED_DONOR' });
        continue;
    }
    const donorName = donorNames[0], descriptor = accepted.sources[donorName];
    const donorFile = exactMember(donorName, descriptor.sha256);
    assert(donorFile, donorName + ': accepted original source must remain available');
    const bytes = readFileSync(path.join(nativeRoot, source.nativeFile));
    assert.equal(sha(bytes), source.sha256);
    const target = new ShpFile(VirtualFile.fromBytes(bytes, source.member));
    const donor = new ShpFile(donorFile), slots: any[] = [], shadowSlots: any[] = [];
    for (let slot = 0; slot < count; slot++) {
        const a = donor.images[slot], b = target.images[slot], frame = source.frames[slot];
        assert.equal(sha(b.imageData), frame.indexSha256);
        const context = descriptor.framePalettes?.[String(slot)];
        const donorPalette = context ?? descriptor.palette;
        const rubble = context?.role === 'rubble';
        const targetPaletteName = rubble ? 'isoubn.pal' : source.palette.member;
        const oldPalette = exactMember(donorPalette.member, donorPalette.sha256);
        const newPalette = rubble ? iso : exactMember(targetPaletteName, source.palette.sha256);
        assert(oldPalette && newPalette);
        const xPalette = oldPalette.getBytes(), yPalette = newPalette.getBytes();
        const oldOwner = context?.remapable ?? descriptor.remapable;
        const newOwner = rubble ? false : source.remapable;
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
            nativeIndexSha256: frame.indexSha256, donorIndexSha256: a ? sha(a.imageData) : null,
            role: context?.role ?? (source.bindings.every((binding: any) => binding.role !== 'body') ? 'linked' : 'body'),
            donorPaletteSha256: sha(xPalette), targetPaletteSha256: sha(yPalette), paletteSha256: sha(yPalette),
            runtimeUsed: rubble ? ['yes', 'true', '1'].includes(String(source.nativeRules.LeaveRubble).toLowerCase()) : true,
            status: frame.empty ? 'EXACT_NATIVE_EMPTY_REQUIRED' : exact
                ? 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR' : 'DISTINCT_BODY_REQUIRES_AUTHORING' });
        if (source.hasShadow) {
            const targetShadow = target.images[slot + count], original = source.frames[slot + count];
            const donorShadow = descriptor.hasShadow ? donor.images[slot + descriptor.bodyFrames] : undefined;
            assert.equal(sha(targetShadow.imageData), original.indexSha256);
            const same = !!donorShadow && [donor.width, donor.height, donorShadow.x, donorShadow.y,
                donorShadow.width, donorShadow.height].join(',') === [target.width, target.height,
                targetShadow.x, targetShadow.y, targetShadow.width, targetShadow.height].join(',')
                && sha(donorShadow.imageData) === original.indexSha256;
            shadowSlots.push({ slot: slot + count, nativeIndexSha256: original.indexSha256,
                donorIndexSha256: donorShadow ? sha(donorShadow.imageData) : null,
                exactDonor: same, policy: 'Always retain the actual target original shadow, including differences.' });
        }
    }
    const payloads = familyNames.flatMap(family => pack.families[family].members
        .filter((entry: any) => entry.member === donorName)
        .map((entry: any) => ({ family, ...pin(path.join(packRoot, entry.path)) })));
    assert(payloads.length);
    rows.push({ ...header, donorMember: donorName, donorSourceSha256: descriptor.sha256,
        donorBodyFrames: descriptor.bodyFrames, donorFamilies: familyNames, donorPayloads: payloads, slots, shadowSlots,
        exactBodySlots: slots.filter(slot => slot.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR').map(slot => slot.slot),
        distinctBodySlots: slots.filter(slot => slot.status === 'DISTINCT_BODY_REQUIRES_AUTHORING').map(slot => slot.slot),
        status: slots.every(row => row.status !== 'DISTINCT_BODY_REQUIRES_AUTHORING') && count === descriptor.bodyFrames
            ? 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED' : 'DISTINCT_BODY_OR_SLOT_LAYOUT' });
}
const slots = rows.flatMap(row => row.slots ?? []);
const bodies = rows.filter(row => row.bindings.some((binding: any) => binding.role === 'body'));
assert.equal(bodies.length, 98);
const summary = { sourceGroups: rows.length, buildingBodies: bodies.length,
    eligibleVisibleSlots: slots.filter(row => row.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR').length,
    distinctVisibleSlots: slots.filter(row => row.status === 'DISTINCT_BODY_REQUIRES_AUTHORING').length,
    allBodyMatchGroups: bodies.filter(row => row.status === 'ALL_BODY_SLOTS_MATCH_FAMILY_CLOSURE_STILL_REQUIRED').length,
    sourceIdenticalGroups: rows.filter(row => row.sourceSha256 === row.donorSourceSha256).length,
    normalDamagedOccupiedMatch: bodies.filter(row => [0, 1, 2].every(number =>
        row.slots?.[number]?.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR')).length,
    unambiguousDonorMissing: rows.filter(row => !row.slots).length };
mkdirSync(root, { recursive: true });
writeFileSync(path.join(root, 'building-state-audit-v1.json'), JSON.stringify({
    status: 'PASS_READ_ONLY_RENDERED_BODY_COMPARISON_NOT_FAMILY_COVERAGE',
    sourceFile: guideFile, sourceSha256: sha(readFileSync(guideFile)), priorClosure: pin(closureFile),
    acceptedContract: contractFile, acceptedContractSha256: sha(readFileSync(contractFile)),
    donorSelectedPack: accepted.selectedPack, targetRubblePalette: { member: 'isoubn.pal', sha256: isoSha },
    summary, rows, resourcesChanged: false, completeFamilyReuse: 'NOT_ESTABLISHED',
    policy: 'Actual original canvas, offsets, fixed RGB, owner shades, contact, alpha and native shadows are checked per state. NewUrban rubble uses isoubn.pal. Partial body matches do not imply complete-family coverage or acceptance of different states.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary));
