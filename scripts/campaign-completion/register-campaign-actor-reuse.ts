import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, selectedPack, sha256 } from '../test-support/resources';

const [mission, theater, nativeReport, receiptName, ...bindings] = process.argv.slice(2);
assert(/^(sov|all)\d{2}[tsu]\.map$/.test(mission) && bindings.length);
assert(['TEMPERATE', 'SNOW', 'URBAN'].includes(theater) && /^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..'), archive = mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix';
const archiveBytes = requiredBytes('assets/ra2/' + archive);
const imported = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString()).files
    .find((entry: any) => entry.virtualName === archive);
assert(imported && imported.sha256 === sha256(archiveBytes) && imported.bytes === archiveBytes.length);
const map = parseMix(archiveBytes, archive).openFile(mission), sourceSha256 = sha256(map.getBytes());
assert.equal(new IniFile(map.readAsString()).getSection('Map')!.getString('Theater').toUpperCase(), theater);
const native = JSON.parse(fs.readFileSync(nativeReport, 'utf8'));
assert.equal(native.status, 'PASS_NATIVE_ORIGINAL_SOURCE_RESOURCE_INVENTORY_NOT_COVERAGE_ACCEPTANCE');
assert.equal(native.world.missionSourceSha256, sourceSha256);
const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const file = path.join(root, `desktop/environment${suffix}-hd-contract.json`), before = fs.readFileSync(file);
const contract = JSON.parse(before.toString()), selected = selectedPack('environment', theater), records = [];
const aliases = JSON.parse(fs.readFileSync(path.join(root, 'desktop/campaign-environment-aliases.json'), 'utf8')).records;
for (const binding of bindings) {
    const [identity, donor = identity] = binding.split(':');
    const familyId = contract.identities.ra2[donor], family = contract.families[familyId];
    assert(family && family.sourceScope && family.members.length === 1 && family.kinds.includes('infantry'), binding);
    assert(!contract.identities.ra2[identity] || contract.identities.ra2[identity] === familyId, identity);
    const member = family.members[0], source = family.sourceOverrides?.[member] ?? contract.sources[member];
    const row = native.rows.find((row: any) => row.name === identity);
    assert.equal(row?.member, member, 'The actual mission image resolver must match the complete donor member');
    const image = new ShpFile(retailMember('ra2', member, source.sha256).file);
    assert.deepEqual([image.width, image.height, image.numImages], [...source.canvas, source.totalFrames]);
    for (const palette of [source.palette, ...Object.values(source.framePalettes ?? {})] as any[]) {
        retailMember('ra2', palette.member, palette.sha256);
    }
    let entry = selected.manifest.families[familyId];
    if (!entry) {
        const alias = aliases.find((record: any) => record.identity === familyId && record.theater === theater);
        assert(alias && alias.sourceTheater === theater && !alias.manifest && alias.familyHash === family.familyHash,
            'Only an unchanged complete alias in the same theater can extend this admission');
        entry = selected.manifest.families[alias.sourceFamily];
        assert.equal(entry?.members[0]?.sha256, alias.sourceManifestSha256);
    }
    assert.equal(entry?.familyHash, family.familyHash);
    const files = [];
    for (const item of entry.members) {
        const filename = path.join(selected.directory, item.path), bytes = fs.readFileSync(filename);
        assert.equal(sha256(bytes), item.sha256); const metadata = JSON.parse(bytes.toString());
        assert.equal(metadata.source.sha256, source.sha256);
        assert.deepEqual(metadata.variants.map((variant: any) => variant.density).sort(), [2, 4]);
        for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const payload = fs.readFileSync(path.join(path.dirname(filename), String(variant.density), page.id, role + '.png'));
            assert.equal(payload.length, page[role + 'Bytes']); assert.equal(sha256(payload), page[role + 'Sha256']);
        }
        files.push({ member: item.member, manifestSha256: item.sha256 });
    }
    const scope = family.sourceScope;
    if ('campaignSourceSha256s' in scope) {
        // Freeze legacy admissions as explicit pairs before adding any mission.
        family.sourceScope = { campaignSources: scope.campaignSourceSha256s
            .map((sha256: string) => ({ mission: 'sov01t.map', sha256 })) };
    }
    const admissions = family.sourceScope.campaignSources; assert(Array.isArray(admissions));
    if (!admissions.some((entry: any) => entry.mission === mission && entry.sha256 === sourceSha256)) {
        admissions.push({ mission, sha256: sourceSha256 });
    }
    if (!family.identities.includes(identity)) family.identities.push(identity);
    contract.identities.ra2[identity] = familyId;
    records.push({ identity, donor, family: familyId, familyHash: family.familyHash, member,
        nativeSourceSha256: source.sha256, palette: source.palette, totalFrames: source.totalFrames, files });
}
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n'); fs.writeFileSync(file, after);
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName), JSON.stringify({
    status: 'PASS_SOURCE_QUALIFIED_COMPLETE_ACCEPTED_ACTOR_ADMISSION_NATIVE_BINDINGS_PENDING',
    mission, sourceSha256, theater, nativeReport, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after),
    records, newPayloadFiles: 0, replacedPayloadFiles: 0,
    qualification: 'Existing complete independent density pages, native shadows, frame order and owner data stay unchanged. Only exact mission/hash pairs gain admission. Native bindings and final runtime/user visual acceptance remain separate.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mission, identities: records.map(row => row.identity), newPayloadFiles: 0 }));
