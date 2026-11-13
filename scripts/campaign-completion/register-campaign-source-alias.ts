import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources } from '../../desktop/campaign-profile.mjs';

const [mission, targetTheater, id, sourceTheater, sourceFamily, member, identity, receiptName, destinationMember] = process.argv.slice(2);
const targetMember = destinationMember ?? member;
assert(/^(all|sov)\d{2}[tsu]\.map$/.test(mission) && /^[a-z0-9-]+$/.test(id));
assert(['TEMPERATE', 'SNOW', 'URBAN'].includes(targetTheater) && targetTheater !== sourceTheater);
assert(['TEMPERATE', 'SNOW', 'URBAN'].includes(sourceTheater) && /^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..'), resources = path.join(root, '.local');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const suffix = (theater: string) => theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const route = (theater: string) => `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
const archive = mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix';
const archiveBytes = requiredBytes('assets/ra2/' + archive);
const imported = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString()).files
    .find((entry: any) => entry.virtualName === archive);
assert(imported && imported.sha256 === sha256(archiveBytes) && imported.bytes === archiveBytes.length);
const map = parseMix(archiveBytes, archive).openFile(mission), mapHash = sha256(map.getBytes());
assert.equal(new IniFile(map.readAsString()).getSection('Map')!.getString('Theater').toUpperCase(), targetTheater);
const donorContract = read(path.join(root, `desktop/environment${suffix(sourceTheater)}-hd-contract.json`));
const donor = donorContract.families[sourceFamily]; assert.deepEqual(donor.members, [member]);
const original = donor.sourceOverrides?.[member] ?? donorContract.sources[member];
assert(!Object.keys(original.framePalettes ?? {}).length, 'Mixed state palettes require their own complete-source admission');
const native = retailMember('ra2', member, original.sha256), image = new ShpFile(native.file);
const destination = retailMember('ra2', targetMember, original.sha256);
assert(Buffer.from(native.file.getBytes()).equals(Buffer.from(destination.file.getBytes())),
    'A renamed theater member must retain the entire original indexed source and geometry');
assert.deepEqual([image.width, image.height, image.numImages], [...original.canvas, original.totalFrames]);
const paletteMember = targetTheater === 'SNOW' ? 'unitsno.pal' : 'unittem.pal';
const palette = retailMember('ra2', paletteMember);
const previousPalette = retailMember('ra2', original.palette.member, original.palette.sha256).file.getBytes();
const targetPalette = palette.file.getBytes(); let comparedPixels = 0;
for (const frame of image.images.slice(0, original.bodyFrames)) for (const index of frame.imageData) {
    if (!index || original.remapable && index >= 16 && index <= 31) continue;
    for (const channel of [0, 1, 2]) assert.equal(previousPalette[index * 3 + channel], targetPalette[index * 3 + channel],
        'Do not reinterpret a theater-specific color as exact accepted reuse');
    comparedPixels++;
}
const environment = await registerEnvironmentResources(resources, () => {});
const campaign = await validateCampaignResources(path.join(resources, 'campaign'));
const routes = new Map([...environment.routes, ...campaign.routes]);
const selections = new Map([...environment.selections, ...campaign.selections]);
const source = selections.get(route(sourceTheater))?.families[sourceFamily];
assert(source && source.familyHash === donor.familyHash && source.members.length === 1);
const binding = source.members[0], manifestPath = routes.get(binding.manifest); assert(manifestPath);
const manifestBytes = fs.readFileSync(manifestPath); assert.equal(sha256(manifestBytes), binding.sha256);
const manifest = JSON.parse(manifestBytes.toString());
assert.equal(manifest.source.sha256, original.sha256); assert.equal(manifest.source.member, member);
assert.deepEqual(manifest.logical.canvas, original.canvas); assert.equal(manifest.logical.frames.length, original.bodyFrames);
assert.deepEqual(manifest.variants.map((variant: any) => variant.density), [2, 4]);
for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
    const file = routes.get(binding.files[page[role]]); assert(file);
    const bytes = fs.readFileSync(file); assert.equal(bytes.length, page[role + 'Bytes']);
    assert.equal(sha256(bytes), page[role + 'Sha256']);
}
const contractFile = path.join(root, `desktop/environment${suffix(targetTheater)}-hd-contract.json`);
const before = fs.readFileSync(contractFile), target = JSON.parse(before.toString());
const aliasFile = path.join(root, 'desktop/campaign-environment-aliases.json'), aliases = read(aliasFile);
const folder = path.join(resources, 'campaign/ra2', mission.slice(0, -4)), name = id + '.json';
const campaignFile = path.join(folder, 'manifest.json'), prepared = read(campaignFile);
const receipt = path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName);
assert(!fs.existsSync(receipt) && !fs.existsSync(path.join(folder, name)));
assert(!target.families[id] && !target.identities.ra2[identity] && !aliases.records.some((alias: any) => alias.identity === id));
const descriptor = { ...original, archive: destination.source, palette: { member: paletteMember, archive: palette.source,
    sha256: palette.sha256, bytes: 768 } };
if (target.sources[targetMember]) assert.deepEqual(target.sources[targetMember], descriptor);
const metadata = { ...manifest, source: { ...manifest.source, member: targetMember, theater: targetTheater },
    packId: 'campaign-source-reuse', packRevision: id,
    reuse: { originalTheater: sourceTheater, originalFamily: sourceFamily, originalManifestSha256: binding.sha256,
        mode: 'EXACT_USED_PALETTE_AND_COMPLETE_SOURCE_IDENTITY',
        policy: 'Retain all accepted independent density pages, frames, pivots, owner data, shadows and accepted authored source corrections byte-for-byte.' } };
const bytes = encode(metadata), manifestRoute = `/local-campaign/ra2/${mission.slice(0, -4)}/${name}`;
const familyHash = sha256(encode({ sourceFamily: donor.familyHash, descriptor, theater: targetTheater, identity }));
target.sources[targetMember] = descriptor;
target.families[id] = { members: [targetMember], identities: [identity], editions: ['ra2'], kinds: donor.kinds,
    familyHash, sourceScope: { campaignSources: [{ mission, sha256: mapHash }] } };
target.identities.ra2[identity] = id;
const record = { theater: targetTheater, identity: id, familyHash, member: targetMember, sourceSha256: native.sha256,
    sourceTheater, sourceFamily, sourceManifestSha256: binding.sha256, manifest: manifestRoute,
    sha256: sha256(bytes), mode: 'EXACT_USED_PALETTE_AND_COMPLETE_SOURCE_IDENTITY', sourceSamplingDifferences: [] };
aliases.records.push(record);
assert(!prepared.files.some((entry: any) => entry.name === name));
prepared.files.push({ name, bytes: bytes.length, sha256: record.sha256, route: manifestRoute });
fs.writeFileSync(path.join(folder, name), bytes, { flag: 'wx' });
fs.writeFileSync(campaignFile, encode(prepared)); fs.writeFileSync(contractFile, encode(target));
fs.writeFileSync(aliasFile, encode(aliases));
fs.writeFileSync(receipt, encode({ status: 'PASS_COMPLETE_SOURCE_PALETTE_AND_IMMUTABLE_PAYLOAD_IDENTITY_NATIVE_PENDING',
    mission, sourceMapSha256: mapHash, comparedBodyPixels: comparedPixels, bodyFrames: original.bodyFrames,
    totalFrames: original.totalFrames, record, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(encode(target)),
    addedPngFiles: 0, replacedAcceptedPayloads: 0,
    qualification: 'Whole accepted family and every independent2X/4X page verified before publication; native bindings and final visual/user acceptance are separate.' }), { flag: 'wx' });
console.log(JSON.stringify({ mission, identity, bodyFrames: original.bodyFrames, addedPngFiles: 0, receipt }));
