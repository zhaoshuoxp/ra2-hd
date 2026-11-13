import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..'), identity = 'campaign-sov09-civa';
const file = path.join(root, 'desktop/environment-urban-hd-contract.json');
const before = fs.readFileSync(file), contract = JSON.parse(before.toString()), donor = contract.families['urban-civa'];
assert(!contract.families[identity] && !contract.identities.ra2.CIVA);
assert.deepEqual(donor.editions, ['yr']); assert.deepEqual(donor.members, ['civa.shp']);
const native = donor.sourceOverrides?.['civa.shp'] ?? contract.sources['civa.shp'];
const source = retailMember('ra2', 'civa.shp', native.sha256), image = new ShpFile(source.file);
assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
const palette = retailMember('ra2', 'uniturb.pal', native.palette.sha256);
assert(Buffer.from(palette.file.getBytes()).equals(Buffer.from(retailMember('ra2', 'unittem.pal').file.getBytes())));
const selected = selectedPack('environment', 'URBAN'), family = selected.manifest.families['urban-civa'];
assert.equal(family.familyHash, donor.familyHash); assert.equal(family.members.length, 1);
const member = family.members[0], filename = path.join(selected.directory, member.path), bytes = fs.readFileSync(filename);
assert.equal(sha256(bytes), member.sha256);
const metadata = JSON.parse(bytes.toString());
assert.equal(metadata.source.theater, 'URBAN'); assert.equal(metadata.source.sha256, source.sha256);
assert.deepEqual(metadata.variants.map((variant: any) => variant.density).sort(), [2, 4]);
for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
    const payload = fs.readFileSync(path.join(path.dirname(filename), String(variant.density), page.id, role + '.png'));
    assert.equal(payload.length, page[role + 'Bytes']); assert.equal(sha256(payload), page[role + 'Sha256']);
}
const mission = 'sov09u.map', sourceSha256 = 'ef2dd5c5280d20f5759c02cebf860111280dc0f091c322f21b42eeae6b53c8b6';
assert.equal(sha256(fs.readFileSync(path.join(root, '.local/campaign/ra2/sov09u', mission))), sourceSha256);
const nativeReport = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/campaign-completion/sov09-resources-2x-v11-r1/report.json'), 'utf8'));
assert.equal(nativeReport.status, 'PASS_NATIVE_ORIGINAL_SOURCE_RESOURCE_INVENTORY_NOT_COVERAGE_ACCEPTANCE');
assert.equal(nativeReport.world.missionSourceSha256, sourceSha256);
assert.equal(nativeReport.rows.find((row: any) => row.name === 'CIVA')?.member, 'civa.shp');
contract.families[identity] = { ...donor, editions: ['ra2'], sourceScope: { campaignSources: [{ mission, sha256: sourceSha256 }] } };
contract.identities.ra2.CIVA = identity;
const aliasesFile = path.join(root, 'desktop/campaign-environment-aliases.json');
const aliases = JSON.parse(fs.readFileSync(aliasesFile, 'utf8'));
assert(!aliases.records.some((record: any) => record.identity === identity));
aliases.records.push({ theater: 'URBAN', identity, familyHash: donor.familyHash, member: 'civa.shp', sourceSha256: native.sha256,
    sourceTheater: 'URBAN', sourceFamily: 'urban-civa', sourceManifestSha256: member.sha256, sha256: member.sha256,
    mode: 'EXACT_NATIVE_SOURCE_PALETTE_AND_COMPLETE_CONTEXT', sourceSamplingDifferences: [] });
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n');
fs.writeFileSync(file, after); fs.writeFileSync(aliasesFile, JSON.stringify(aliases, null, 2) + '\n');
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026/sov09-civa-urban-reuse-r1.json'), JSON.stringify({
    status: 'PASS_EXACT_SOURCE_COMPLETE_ACCEPTED_URBAN_FAMILY_REUSE_NATIVE_BINDINGS_PENDING', mission, sourceSha256,
    identity, donorFamily: 'urban-civa', source: native, sourceManifestSha256: member.sha256,
    contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after), addedPngFiles: 0, replacedPayloadFiles: 0,
    qualification: 'The already accepted Urban YR family is an exact native source/palette/context match. Its complete independent pages, native geometry, ownership and state timing are shared unchanged; the original YR scope is preserved. Only the explicit ninth original source pair gains RA2 admission.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ identity, donor: 'urban-civa', newPngFiles: 0, nativeFrames: native.bodyFrames }));
