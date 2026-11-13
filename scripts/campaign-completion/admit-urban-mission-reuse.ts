import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { IniFile } from '../../src/data/IniFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, selectedPack, sha256 } from '../test-support/resources';

const [mission, reportFile, receiptName, ...names] = process.argv.slice(2);
assert(/^(sov|all)\d\d[tsu]\.map$/.test(mission) && /^[a-z0-9-]+\.json$/.test(receiptName) && names.length);
const root = path.resolve(import.meta.dir, '../..'), file = path.join(root, 'desktop/environment-urban-hd-contract.json');
const aliasFile = path.join(root, 'desktop/campaign-environment-aliases.json');
const before = fs.readFileSync(file), contract = JSON.parse(before.toString()), aliases = JSON.parse(fs.readFileSync(aliasFile, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
assert.equal(report.status, 'PASS_NATIVE_ORIGINAL_SOURCE_RESOURCE_INVENTORY_NOT_COVERAGE_ACCEPTANCE');
const map = fs.readFileSync(path.join(root, '.local/campaign/ra2', mission.slice(0, -4), mission));
const sourceSha256 = sha256(map); assert.equal(report.world.missionSourceSha256, sourceSha256);
assert.equal(new IniFile(map.toString()).getSection('Map')!.getString('Theater').toUpperCase(), 'URBAN');
const archive = mission.startsWith('all') ? 'maps01.mix' : 'maps02.mix', archiveBytes = requiredBytes('assets/ra2/' + archive);
const imported = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString()).files
    .find((entry: any) => entry.virtualName === archive);
assert(imported && imported.sha256 === sha256(archiveBytes) && imported.bytes === archiveBytes.length);
assert.equal(sha256(parseMix(archiveBytes, archive).openFile(mission).getBytes()), sourceSha256);
const records = [], folder = path.join(root, '.local/campaign/ra2', mission.slice(0, -4));
const missionManifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
for (const spec of names) {
    const [name, sourceTheater = 'URBAN', requestedFamily, requestedMember] = spec.split(':');
    assert(['TEMPERATE', 'URBAN', 'SNOW'].includes(sourceTheater));
    const donorContract = sourceTheater === 'URBAN' ? contract : JSON.parse(fs.readFileSync(path.join(root,
        `desktop/environment${sourceTheater === 'TEMPERATE' ? '' : '-' + sourceTheater.toLowerCase()}-hd-contract.json`), 'utf8'));
    const selected = selectedPack('environment', sourceTheater);
    const donorId = requestedFamily ?? donorContract.identities.yr[name], donor = donorContract.families[donorId];
    assert(donor && donor.members.length === 1 && donor.editions.includes('yr') && !contract.identities.ra2[name]);
    const identity = 'campaign-' + mission.slice(0, 5) + '-' + name.toLowerCase(), sourceMember = donor.members[0];
    const member = requestedMember ?? sourceMember;
    assert(!contract.families[identity] && !aliases.records.some((entry: any) => entry.identity === identity));
    const originalNative = donor.sourceOverrides?.[sourceMember] ?? donorContract.sources[sourceMember];
    const targetPaletteName = originalNative.palette.member.replace(/(?:tem|sno|urb)\.pal$/, 'urb.pal');
    assert(/^(unit|iso)urb\.pal$/.test(targetPaletteName));
    const targetPalette = retailMember('ra2', targetPaletteName);
    const originalPalette = retailMember('ra2', originalNative.palette.member, originalNative.palette.sha256);
    assert(Buffer.from(targetPalette.file.getBytes()).equals(Buffer.from(originalPalette.file.getBytes())));
    assert(sourceTheater === 'URBAN' || !Object.keys(originalNative.framePalettes ?? {}).length,
        'Cross-theater frame-specific palettes require their own complete equivalence check');
    const native = { ...originalNative, palette: { member: targetPaletteName, archive: targetPalette.source,
        sha256: targetPalette.sha256, bytes: targetPalette.file.getSize() } };
    assert.equal(report.rows.find((row: any) => row.name === name)?.member, member);
    const original = retailMember('ra2', member, native.sha256), image = new ShpFile(original.file);
    assert(Buffer.from(original.file.getBytes()).equals(Buffer.from(retailMember('ra2', sourceMember, native.sha256).file.getBytes())));
    assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
    for (const palette of [native.palette, ...Object.values(native.framePalettes ?? {})] as any[]) {
        retailMember('ra2', palette.member, palette.sha256);
    }
    const chosen = selected.manifest.families[donorId]; assert.equal(chosen.familyHash, donor.familyHash);
    assert.equal(chosen.members.length, 1);
    const binding = chosen.members[0], filename = path.join(selected.directory, binding.path), bytes = fs.readFileSync(filename);
    assert.equal(sha256(bytes), binding.sha256);
    const metadata = JSON.parse(bytes.toString());
    assert.equal(metadata.source.sha256, native.sha256); assert.equal(metadata.source.theater, sourceTheater);
    assert.equal(metadata.logical.frames.length, native.bodyFrames);
    assert.deepEqual(metadata.variants.map((variant: any) => variant.density).sort(), [2, 4]);
    for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const payload = fs.readFileSync(path.join(path.dirname(filename), String(variant.density), page.id, role + '.png'));
        assert.equal(payload.length, page[role + 'Bytes']); assert.equal(sha256(payload), page[role + 'Sha256']);
    }
    let manifest: string | undefined, manifestHash = binding.sha256, familyHash = donor.familyHash;
    if (sourceTheater !== 'URBAN' || member !== sourceMember) {
        metadata.source = { ...metadata.source, theater: 'URBAN', member };
        metadata.packId = 'campaign-source-reuse'; metadata.packRevision = mission.slice(0, -4) + '-urban-r1';
        metadata.reuse = { sourceTheater, sourceFamily: donorId, sourceManifestSha256: binding.sha256,
            policy: 'Exact indexed source, fixed palette and complete native geometry; all accepted independent density pages remain byte-identical.' };
        const name = identity + '-urban.json', output = Buffer.from(JSON.stringify(metadata) + '\n');
        fs.writeFileSync(path.join(folder, name), output, { flag: 'wx' });
        manifest = `/local-campaign/ra2/${mission.slice(0, -4)}/${name}`; manifestHash = sha256(output);
        assert(!missionManifest.files.some((entry: any) => entry.name === name));
        missionManifest.files.push({ name, bytes: output.length, sha256: manifestHash, route: manifest });
        familyHash = sha256(Buffer.from(JSON.stringify({ sourceFamily: donor.familyHash, source: native, target: 'URBAN' })));
    }
    if (contract.sources[member]) assert.equal(contract.sources[member].sha256, native.sha256);
    else contract.sources[member] = native;
    contract.families[identity] = { members: [member], identities: [name], editions: ['ra2'], kinds: donor.kinds,
        familyHash, sourceScope: { campaignSources: [{ mission, sha256: sourceSha256 }] } };
    contract.identities.ra2[name] = identity;
    const alias = { theater: 'URBAN', identity, familyHash, member, sourceSha256: native.sha256,
        sourceTheater, sourceFamily: donorId, sourceManifestSha256: binding.sha256, sha256: manifestHash,
        ...(manifest ? { manifest } : {}),
        mode: 'EXACT_NATIVE_SOURCE_PALETTE_AND_COMPLETE_CONTEXT', sourceSamplingDifferences: [] };
    aliases.records.push(alias); records.push({ name, ...alias, native });
}
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n');
fs.writeFileSync(file, after); fs.writeFileSync(aliasFile, JSON.stringify(aliases, null, 2) + '\n');
fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(missionManifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName), JSON.stringify({
    status: 'PASS_EXACT_SOURCE_COMPLETE_ACCEPTED_URBAN_REUSE_NATIVE_BINDINGS_PENDING', mission, sourceSha256,
    sourceReport: reportFile, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after), records,
    addedPngFiles: 0, replacedPayloadFiles: 0,
    qualification: 'Accepted complete Urban families retain their YR scope, source bytes, independent densities, geometry, ownership and state timing. Only explicit original mission/hash pairs gain RA2 admission; native bindings and user runtime acceptance remain separate.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mission, reusedFamilies: records.map(record => record.name), addedPngFiles: 0 }));
