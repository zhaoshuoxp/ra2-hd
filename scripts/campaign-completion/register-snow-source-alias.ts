import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, selectedPack, sha256 } from '../test-support/resources';

const [mission, id, theater, sourceFamily, member, targetMember, identity, receiptName] = process.argv.slice(2);
assert(/^(sov|all)\d{2}s\.map$/.test(mission) && /^[a-z0-9-]+$/.test(id));
assert(['TEMPERATE', 'URBAN'].includes(theater) && /^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..'), archive = mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix';
const archiveBytes = requiredBytes('assets/ra2/' + archive);
const importReceipt = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString());
const imported = importReceipt.files.find((entry: any) => entry.virtualName === archive);
assert(imported && imported.sha256 === sha256(archiveBytes) && imported.bytes === archiveBytes.length);
const mapFile = parseMix(archiveBytes, archive).openFile(mission), map = { file: mapFile, sha256: sha256(mapFile.getBytes()) };
assert.equal(new IniFile(map.file.readAsString()).getSection('Map')!.getString('Theater').toUpperCase(), 'SNOW');
const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const sourceContract = JSON.parse(fs.readFileSync(path.join(root, `desktop/environment${suffix}-hd-contract.json`), 'utf8'));
const family = sourceContract.families[sourceFamily], native = family.sourceOverrides?.[member] ?? sourceContract.sources[member];
assert.deepEqual(family.members, [member]);
assert(!native.framePalettes || Object.keys(native.framePalettes).length === 0, 'Per-frame palettes require a separate complete compatibility check');
const original = retailMember('ra2', member, native.sha256), destination = retailMember('ra2', targetMember, native.sha256);
assert(Buffer.from(original.file.getBytes()).equals(Buffer.from(destination.file.getBytes())));
const image = new ShpFile(destination.file), palette = retailMember('ra2', 'unitsno.pal');
assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
const originalPalette = retailMember('ra2', native.palette.member, native.palette.sha256).file.getBytes();
const snowPalette = palette.file.getBytes();
for (const frame of image.images.slice(0, native.bodyFrames)) for (const index of frame.imageData) {
    if (!index || index >= 16 && index <= 31) continue;
    for (const channel of [0, 1, 2]) assert.equal(originalPalette[index * 3 + channel], snowPalette[index * 3 + channel]);
}
const selected = selectedPack('environment', theater), binding = selected.manifest.families[sourceFamily];
assert.equal(binding.familyHash, family.familyHash);
const selectedMember = binding.members[0], sourceFile = path.join(selected.directory, selectedMember.path);
const sourceBytes = fs.readFileSync(sourceFile); assert.equal(sha256(sourceBytes), selectedMember.sha256);
const originalManifest = JSON.parse(sourceBytes.toString());
assert.deepEqual(originalManifest.variants.map((variant: any) => variant.density).sort(), [2, 4]);
for (const variant of originalManifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
    const bytes = fs.readFileSync(path.join(path.dirname(sourceFile), String(variant.density), page.id, role + '.png'));
    assert.equal(bytes.length, page[role + 'Bytes']); assert.equal(sha256(bytes), page[role + 'Sha256']);
}
const file = path.join(root, 'desktop/environment-snow-hd-contract.json'), before = fs.readFileSync(file);
const target = JSON.parse(before.toString()), aliasFile = path.join(root, 'desktop/campaign-environment-aliases.json');
const aliases = JSON.parse(fs.readFileSync(aliasFile, 'utf8'));
let record = aliases.records.find((alias: any) => alias.identity === id);
if (record) {
    assert.equal(record.sourceManifestSha256, selectedMember.sha256); assert.equal(record.sourceSha256, destination.sha256);
    assert.equal(record.member, targetMember); assert.equal(record.sourceFamily, sourceFamily);
    const bytes = fs.readFileSync(path.join(root, '.local/campaign', record.manifest.slice('/local-campaign/'.length)));
    assert.equal(sha256(bytes), record.sha256);
    const existing = JSON.parse(bytes.toString());
    assert.deepEqual(existing.logical, originalManifest.logical); assert.deepEqual(existing.variants, originalManifest.variants);
} else {
    assert(!target.families[id] && !target.identities.ra2[identity]);
    const descriptor = { ...native, palette: { member: 'unitsno.pal', archive: palette.source, sha256: palette.sha256, bytes: 768 } };
    const manifest = { ...originalManifest, source: { ...originalManifest.source, member: targetMember, theater: 'SNOW' },
        packId: 'campaign-source-reuse', packRevision: id,
        reuse: { originalTheater: theater, originalFamily: sourceFamily, originalManifestSha256: selectedMember.sha256,
            mode: 'EXACT_USED_PALETTE_AND_COMPLETE_SOURCE_IDENTITY',
            policy: 'Complete accepted independent 2X/4X pages, geometry, ownership, shadow data and all animation states remain byte-identical.' } };
    const folder = path.join(root, '.local/campaign/ra2', mission.slice(0, -4)), name = id + '.json';
    const bytes = Buffer.from(JSON.stringify(manifest) + '\n'); fs.writeFileSync(path.join(folder, name), bytes, { flag: 'wx' });
    const familyHash = sha256(Buffer.from(JSON.stringify({ sourceFamily: family.familyHash, source: descriptor, target: 'SNOW' })));
    if (target.sources[targetMember]) assert.equal(target.sources[targetMember].sha256, descriptor.sha256);
    target.sources[targetMember] = descriptor;
    target.families[id] = { members: [targetMember], identities: [identity], editions: ['ra2'], kinds: family.kinds,
        familyHash, sourceScope: { campaignSources: [] } };
    target.identities.ra2[identity] = id;
    record = { theater: 'SNOW', identity: id, familyHash, member: targetMember, sourceSha256: descriptor.sha256,
        sourceTheater: theater, sourceFamily, sourceManifestSha256: selectedMember.sha256,
        manifest: `/local-campaign/ra2/${mission.slice(0, -4)}/${name}`, sha256: sha256(bytes),
        mode: 'EXACT_USED_PALETTE_AND_COMPLETE_SOURCE_IDENTITY', sourceSamplingDifferences: [] };
    aliases.records.push(record);
    const missionFile = path.join(folder, 'manifest.json'), prepared = JSON.parse(fs.readFileSync(missionFile, 'utf8'));
    assert(!prepared.files.some((entry: any) => entry.name === name));
    prepared.files.push({ name, bytes: bytes.length, sha256: record.sha256, route: record.manifest });
    fs.writeFileSync(missionFile, JSON.stringify(prepared, null, 2) + '\n');
}
const sources = target.families[id].sourceScope.campaignSources;
if (!sources.some((source: any) => source.mission === mission && source.sha256 === map.sha256)) sources.push({ mission, sha256: map.sha256 });
const after = Buffer.from(JSON.stringify(target, null, 2) + '\n'); fs.writeFileSync(file, after);
fs.writeFileSync(aliasFile, JSON.stringify(aliases, null, 2) + '\n');
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName), JSON.stringify({
    status: 'PASS_COMPLETE_SOURCE_PALETTE_GEOMETRY_AND_ACCEPTED_PAYLOAD_IDENTITY_NATIVE_PENDING',
    mission, sourceMapSha256: map.sha256, record, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after),
    addedPngFiles: 0, replacedAcceptedPayloads: 0,
    qualification: 'Whole accepted source-matched family reuse only. Native bindings and runtime/user visual acceptance remain separate.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mission, identity, addedPngFiles: 0, record }));
