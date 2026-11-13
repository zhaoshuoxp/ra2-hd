import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..'), folder = path.join(root, '.local/campaign/ra2/sov04s');
const targetFile = path.join(root, 'desktop/environment-snow-hd-contract.json');
const target = JSON.parse(fs.readFileSync(targetFile, 'utf8')), records: any[] = [];
const missionSha256 = 'a0a95b26639cc1d4d916dea3a264a18e409bef3d2b84c245e67cd250defc2100';
for (const spec of [
    { theater: 'TEMPERATE', family: 'environment-ctfrmb', member: 'ctfrmb.shp', target: 'cafrmb.shp', identity: 'CAFRMB',
        id: 'campaign-sov04-farm-snow', mode: 'EXACT_USED_PALETTE_AND_COMPLETE_SOURCE_IDENTITY' },
    { theater: 'URBAN', family: 'campaign-sov01-civ1', member: 'civ1.shp', target: 'civ1.shp', identity: 'CIV1',
        id: 'campaign-sov04-civ1-snow', mode: 'ACCEPTED_HD_MATERIAL_REUSE_WITH_ONE_ISOLATED_SOURCE_SAMPLE_DIFFERENCE' },
]) {
    const contract = JSON.parse(fs.readFileSync(path.join(root, `desktop/environment${spec.theater === 'TEMPERATE' ? '' : '-urban'}-hd-contract.json`), 'utf8'));
    const family = contract.families[spec.family], native = family.sourceOverrides?.[spec.member] ?? contract.sources[spec.member];
    assert.deepEqual(family.members, [spec.member]);
    const original = retailMember('ra2', spec.member, native.sha256), destination = retailMember('ra2', spec.target, native.sha256);
    assert(Buffer.from(original.file.getBytes()).equals(Buffer.from(destination.file.getBytes())));
    const image = new ShpFile(destination.file), palette = retailMember('ra2', 'unitsno.pal');
    assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
    const sourcePalette = retailMember('ra2', native.palette.member, native.palette.sha256).file.getBytes(), snowPalette = palette.file.getBytes();
    const differences: any[] = [];
    for (let frame = 0; frame < native.bodyFrames; frame++) {
        const body = image.images[frame];
        for (let i = 0; i < body.imageData.length; i++) {
            const index = body.imageData[i];
            if (!index || index >= 16 && index <= 31) continue;
            if ([0, 1, 2].some(channel => sourcePalette[index * 3 + channel] !== snowPalette[index * 3 + channel])) {
                differences.push({ frame, index, x: body.x + i % body.width, y: body.y + Math.floor(i / body.width) });
            }
        }
    }
    if (spec.identity === 'CAFRMB') assert.deepEqual(differences, []);
    else { assert.equal(differences.length, 1); assert.equal(differences[0].frame, 96); assert.equal(differences[0].index, 254); }
    const selected = selectedPack('environment', spec.theater), binding = selected.manifest.families[spec.family].members[0];
    const bytes = fs.readFileSync(path.join(selected.directory, binding.path)); assert.equal(sha256(bytes), binding.sha256);
    const manifest = JSON.parse(bytes.toString()); assert.deepEqual(manifest.variants.map((variant: any) => variant.density).sort(), [2, 4]);
    for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const bytes = fs.readFileSync(path.join(path.dirname(path.join(selected.directory, binding.path)), String(variant.density), page.id, role + '.png'));
        assert.equal(sha256(bytes), page[role + 'Sha256']); assert.equal(bytes.length, page[role + 'Bytes']);
    }
    const descriptor = { ...native, palette: { member: 'unitsno.pal', archive: palette.source, sha256: palette.sha256, bytes: 768 } };
    manifest.source = { ...manifest.source, member: spec.target, theater: 'SNOW' };
    manifest.packId = 'campaign-source-reuse'; manifest.packRevision = 'sov04-snow-r1';
    manifest.reuse = { originalTheater: spec.theater, originalFamily: spec.family, originalManifestSha256: binding.sha256,
        mode: spec.mode, sourceSamplingDifferences: differences,
        policy: 'Complete accepted independent 2X/4X pages, geometry, ownership and all animation states are retained byte-for-byte. No source sampling grain is reintroduced into accepted HD materials.' };
    const output = Buffer.from(JSON.stringify(manifest) + '\n'), name = spec.id + '.json';
    fs.writeFileSync(path.join(folder, name), output, { flag: 'wx' });
    const familyHash = sha256(Buffer.from(JSON.stringify({ sourceFamily: family.familyHash, source: descriptor, target: 'SNOW', mode: spec.mode })));
    if (target.sources[spec.target]) assert.equal(target.sources[spec.target].sha256, descriptor.sha256);
    target.sources[spec.target] = descriptor;
    target.families[spec.id] = { members: [spec.target], identities: [spec.identity], editions: ['ra2'], kinds: family.kinds,
        familyHash, sourceScope: { campaignSources: [{ mission: 'sov04s.map', sha256: missionSha256 }] } };
    target.identities.ra2[spec.identity] = spec.id;
    records.push({ theater: 'SNOW', identity: spec.id, familyHash, member: spec.target, sourceSha256: descriptor.sha256,
        sourceTheater: spec.theater, sourceFamily: spec.family, sourceManifestSha256: binding.sha256,
        manifest: `/local-campaign/ra2/sov04s/${name}`, sha256: sha256(output), mode: spec.mode, sourceSamplingDifferences: differences });
}
const metadata = { schema: 'campaign-environment-aliases-v1', records };
fs.writeFileSync(path.join(root, 'desktop/campaign-environment-aliases.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(targetFile, JSON.stringify(target, null, 2) + '\n');
const manifestFile = path.join(folder, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
for (const record of records) {
    const name = path.basename(record.manifest), bytes = fs.readFileSync(path.join(folder, name));
    assert(!manifest.files.some((file: any) => file.name === name));
    manifest.files.push({ name, bytes: bytes.length, sha256: record.sha256, route: record.manifest });
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026/sov04-snow-alias-reuse-r1.json'),
    JSON.stringify({ status: 'SOURCE_CHECKED_METADATA_ONLY_REUSE_NATIVE_BINDINGS_PENDING', addedPngFiles: 0,
        modifiedAcceptedPayloads: 0, originalPaletteUnchanged: true, records,
        qualification: 'CAFRMB has identical original indexed source and every used fixed palette color. CIV1 is an explicitly recorded accepted-HD material reuse: the two original palettes differ at one isolated sample in body frame 96, not a new full-family redraw. Native bindings and user runtime review remain separate.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ records, copiedPngFiles: 0 }));
