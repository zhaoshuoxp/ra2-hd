// Compare original rendered bodies before considering accepted bridge or smudge material reuse.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const [prepared, output] = process.argv.slice(2);
assert(prepared && output);
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sourceFile = path.join(prepared, 'source.json'), native = read(sourceFile);
const smudges = process.argv.includes('--smudges');
const overlays = process.argv.includes('--overlays');
const props = process.argv.includes('--terrain-props');
assert([smudges, overlays, props].filter(Boolean).length <= 1);
assert.equal(native.theater, 'URBAN');
assert.equal(native.sources.length, smudges ? 24 : overlays ? 11 : props ? 25 : 27);
if (overlays) assert.deepEqual(native.sources.map((source: any) => source.member).sort(),
    ['crate.urb', 'wcrate.urb', 'guwall.shp', 'nuwall.shp', 'gusand.shp', 'srock01.urb',
        ...Array.from({ length: 5 }, (_, index) => `trock0${index + 1}.urb`)].sort());
if (smudges) assert(native.sources.every((source: any) =>
    /^(burnt|crater)(0[1-9]|1[0-2])\.urb$/.test(source.member)
    && !source.hasShadow && !source.remapable && source.totalFrames === 2));
const snowDonor = process.argv.includes('--snow-donor');
assert(!snowDonor || props);
const donorTheater = snowDonor ? 'SNOW' : 'TEMPERATE';
const contract = read(snowDonor ? 'desktop/environment-snow-hd-contract.json' : 'desktop/environment-hd-contract.json');
const donorRoot = path.join('.local/environment-packs', contract.selectedPack.revision);
assert.equal(sha(readFileSync(path.join(donorRoot, 'manifest.json'))), contract.selectedPack.sha256);
const archiveNames = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const tree = editionRetailTree(new Map(archiveNames.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
const rows = [];
for (const source of native.sources) {
    let donorName = source.member.replace(/\.urb$/, snowDonor ? '.sno' : '.tem');
    if (overlays) {
        const aliases: Record<string, string[]> = { 'guwall.shp': ['gtwall.shp', 'gawall.shp'],
            'nuwall.shp': ['ntwall.shp', 'nawall.shp'], 'gusand.shp': ['gtsand.shp', 'gasand.shp'] };
        donorName = aliases[source.member]?.find(name => contract.sources[name]) ?? donorName;
    }
    const declaration = contract.sources[donorName];
    if (!declaration && overlays && ['guwall.shp', 'nuwall.shp'].includes(source.member)) {
        assert.equal(sha(readFileSync(path.join(prepared, 'native', source.nativeFile))), source.sha256);
        rows.push({ member: source.member, sourceSha256: source.sha256,
            donorAuthority: 'ACCEPTED_FACTION_BUILDING_PATH_REQUIRES_SEPARATE_AUDIT',
            policy: 'Absence from the environment contract does not imply missing accepted faction artwork.',
            slots: source.frames.slice(0, source.totalFrames / 2).map((frame: any) => ({
                slot: frame.slot, empty: frame.empty, status: frame.empty ? 'EXACT_NATIVE_EMPTY_REQUIRED'
                    : 'DEFERRED_ACCEPTED_FACTION_BINDING_AUDIT' })) });
        continue;
    }
    if (!declaration && props) {
        rows.push({ member: source.member, sourceSha256: source.sha256, donorMember: donorName,
            donorAuthority: `NO_ACCEPTED_${donorTheater}_SOURCE_DECLARATION`,
            policy: 'An original member without accepted artwork remains available; no missing native dependency or runtime failure is inferred.',
            slots: source.frames.slice(0, source.totalFrames / (source.hasShadow ? 2 : 1)).map((frame: any) => ({
                slot: frame.slot, empty: frame.empty, status: frame.empty ? 'EXACT_NATIVE_EMPTY_REQUIRED'
                    : 'NO_ACCEPTED_BODY_DONOR_DECLARED' })) });
        continue;
    }
    assert(declaration, donorName + ': accepted donor required for this comparison');
    const donorFile = resolveMember(tree, donorName).file;
    assert.equal(sha(donorFile.getBytes()), declaration.sha256);
    const targetFile = resolveMember(tree, source.member).file;
    assert.equal(sha(targetFile.getBytes()), source.sha256);
    const donor = new ShpFile(donorFile), target = new ShpFile(targetFile);
    assert.equal(target.numImages, source.totalFrames);
    assert.equal(donor.numImages, declaration.totalFrames);
    const donorPalette = resolveMember(tree, declaration.palette.member).file.getBytes();
    const targetPalette = readFileSync(path.join(prepared, 'native', source.palette.sha256 + '.pal'));
    assert.equal(sha(donorPalette), declaration.palette.sha256);
    assert.equal(sha(targetPalette), source.palette.sha256);
    const body = source.totalFrames / (source.hasShadow ? 2 : 1), slots = [];
    for (let slot = 0; slot < body; slot++) {
        const a = slot < declaration.bodyFrames ? donor.images[slot] : undefined;
        const b = target.images[slot];
        const metadata = source.frames[slot];
        assert.equal(sha(b.imageData), metadata.indexSha256);
        assert.deepEqual([b.x, b.y], metadata.origin);
        assert.deepEqual([b.width, b.height], metadata.size);
        const sameGeometry = Boolean(a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
            && donor.width === target.width && donor.height === target.height);
        let differingPixels = 0, differingContactPixels = 0, differingOwnerPixels = 0;
        if (sameGeometry) for (let i = 0; i < b.imageData.length; i++) {
            const x = a!.imageData[i], y = b.imageData[i];
            if (Boolean(x) !== Boolean(y) || Boolean(x) && [0, 1, 2]
                .some(channel => donorPalette[x * 3 + channel] !== targetPalette[y * 3 + channel])) differingPixels++;
            if ((x === 12) !== (y === 12)) differingContactPixels++;
            const donorOwner = declaration.remapable && x >= 16 && x <= 31;
            const targetOwner = source.remapable && y >= 16 && y <= 31;
            if (donorOwner !== targetOwner || donorOwner && x !== y) differingOwnerPixels++;
        }
        const sameOwnerPolicy = declaration.remapable === source.remapable;
        const exact = sameGeometry && sameOwnerPolicy && !differingPixels && !differingContactPixels && !differingOwnerPixels;
        slots.push({ slot, empty: metadata.empty, sameGeometry, differingPixels, differingContactPixels,
            sameOwnerPolicy, differingOwnerPixels,
            status: metadata.empty ? 'EXACT_NATIVE_EMPTY_REQUIRED' : exact
                ? 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR' : 'DISTINCT_BODY_REQUIRES_AUTHORING' });
    }
    rows.push({ member: source.member, sourceSha256: source.sha256, donorMember: donorName,
        donorSourceSha256: declaration.sha256, targetBodyFrames: body, donorBodyFrames: declaration.bodyFrames,
        slots, policy: 'Target slots, origins, alpha, shadows and family closure remain authoritative.' });
}
const slots = rows.flatMap(row => row.slots);
const result = { status: props ? 'PASS_READ_ONLY_TERRAIN_PROP_BODY_EQUIVALENCE_AUDIT' : overlays ? 'PASS_READ_ONLY_OVERLAY_BODY_EQUIVALENCE_AUDIT'
    : smudges ? 'PASS_READ_ONLY_SMUDGE_BODY_EQUIVALENCE_AUDIT'
    : 'PASS_READ_ONLY_BRIDGE_BODY_EQUIVALENCE_AUDIT', sourceSha256: sha(readFileSync(sourceFile)),
    acceptedDonor: contract.selectedPack, donorTheater, rows,
    eligibleVisibleSlots: slots.filter(row => row.status === 'ELIGIBLE_EXACT_RENDERED_BODY_DONOR').length,
    distinctVisibleSlots: slots.filter(row => row.status === 'DISTINCT_BODY_REQUIRES_AUTHORING').length,
    deferredFactionSlots: slots.filter(row => row.status === 'DEFERRED_ACCEPTED_FACTION_BINDING_AUDIT').length,
    noAcceptedBodyDonorSlots: slots.filter(row => row.status === 'NO_ACCEPTED_BODY_DONOR_DECLARED').length,
    emptySlots: slots.filter(row => row.empty).length,
    completeFamilyReuse: 'NOT_ESTABLISHED', resourcesChanged: false };
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ eligible: result.eligibleVisibleSlots, distinct: result.distinctVisibleSlots, empty: result.emptySlots }));
