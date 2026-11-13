import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => hash(await fs.readFile(file));
const resources = path.join(base, 'resources');
assert.equal(await fs.realpath(resources), resources);
const original = await read(path.join(root, '.artifacts/m3-1/feedback-r6/extracted.json'));
const originalRoot = path.join(original.app, 'Contents/Resources/GameResources');
const oldPointer = await read(path.join(originalRoot, 'environment-urban-selection.json'));
const oldPackRoot = path.join(originalRoot, 'environment-packs', oldPointer.revision);
const oldPack = await read(path.join(oldPackRoot, 'manifest.json'));
const pointer = await read(path.join(resources, 'environment-urban-selection.json'));
const packRoot = path.join(resources, 'environment-packs', pointer.revision);
assert.equal(await sha(path.join(packRoot, 'manifest.json')), pointer.sha256);
const pack = await read(path.join(packRoot, 'manifest.json'));
let retainedMembers = 0, verifiedPages = 0;
for (const [id, family] of Object.entries(oldPack.families)) {
    assert.deepEqual(pack.families[id], family, id);
    for (const member of family.members) {
        assert.equal(await sha(path.join(oldPackRoot, member.path)), member.sha256);
        assert.equal(await sha(path.join(packRoot, member.path)), member.sha256);
        retainedMembers++;
    }
}
const source = await read(path.join(base, 'source/source.json'));
const contract = await read(path.join(root, 'desktop/environment-urban-hd-contract.json'));
const newContract = await read(path.join(base, 'new-shp-contract.json'));
const checked = [];
for (const [id, family] of Object.entries(newContract.families)) {
    assert.deepEqual(contract.families[id], family);
    const binding = pack.families[id]; assert.equal(binding.familyHash, family.familyHash);
    for (const member of binding.members) {
        const file = path.join(packRoot, member.path), manifest = await read(file);
        assert.equal(await sha(file), member.sha256);
        const native = source.sources.find(s => s.member === member.member);
        assert.equal(manifest.source.sha256, native.sha256);
        assert.deepEqual(manifest.logical.canvas, native.canvas);
        assert.equal(manifest.logical.frames.length, native.bodyFrames);
        for (const frame of manifest.logical.frames) {
            const original = native.frames[frame.nativeFrame];
            assert.deepEqual(frame.trimOrigin, original.origin);
            assert.deepEqual(frame.trimSize, original.size);
        }
        assert.deepEqual(manifest.variants.map(v => v.density), [2, 4]);
        for (const variant of manifest.variants) {
            assert.deepEqual(variant.frames.map(f => f.nativeFrame), manifest.logical.frames.map(f => f.nativeFrame));
            for (const page of variant.pages) for (const role of ['base', 'data']) {
                const bytes = await fs.readFile(path.join(path.dirname(file), String(variant.density), page.id, role + '.png'));
                assert.equal(bytes.length, page[role + 'Bytes']); assert.equal(hash(bytes), page[role + 'Sha256']);
                const png = PNG.sync.read(bytes); assert.deepEqual([png.width, png.height], page.size); verifiedPages++;
            }
        }
        checked.push({ identity: native.identity, member: member.member, bodyFrames: native.bodyFrames, densities: [2, 4] });
    }
}
const exports = await read(path.join(base, 'vxl-final/exports.json'));
for (const row of exports.records) {
    const manifest = await read(row.manifest);
    assert.equal(await sha(row.manifest), row.sha256);
    const native = source.sources.find(s => s.identity === row.identity);
    assert.equal(manifest.sources[native.member], native.sha256);
    assert.equal(manifest.sources[native.hva.member], native.hva.sha256);
    for (const part of manifest.parts) {
        assert.deepEqual(part.frames.map(f => f.heading), [0, 45, 90, 135, 180, 225, 270, 315]);
        assert(part.frames.every(f => f.availableAuthoredDensity >= 4));
        for (const file of Object.values(part.files)) {
            const bytes = await fs.readFile(path.join(path.dirname(row.manifest), file.file));
            assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
            const png = PNG.sync.read(bytes); assert.deepEqual([png.width, png.height], part.pageSize); verifiedPages++;
        }
    }
    checked.push({ identity: row.identity, density: row.density, parts: manifest.parts.length, headings: 8 });
}
const recipe = await read(path.join(base, 'authoring-shp-clean-r2/urban-campaign-sov01-new-art-r7-clean-r2/recipe.json'));
assert.equal(recipe.actualSampling.length, 26);
assert(recipe.actualSampling.every(row => row.availableDensity >= 4));
const disposition = await read(path.join(base, 'user-art-disposition-20261024.json'));
for (const row of disposition.retainedByUser) assert.equal(await sha(path.join(base, row.path)), row.sha256);
const mission = path.join(resources, 'campaign/ra2/sov01t/sov01t.map');
assert.equal(await sha(mission), source.missionSha256);
assert.equal(await sha(mission), await sha(path.join(originalRoot, 'campaign/ra2/sov01t/sov01t.map')));
const result = { status: 'PASS_SOURCE_HASHES_COMPLETE_FAMILIES_NATIVE_GEOMETRY_AND_INDEPENDENT_DENSITIES',
    selectedPack: pointer, retainedUrbanMemberManifests: retainedMembers, verifiedNewPngPages: verifiedPages,
    minimumShpAuthoredDensity: Math.min(...recipe.actualSampling.map(row => row.availableDensity)),
    missionSourceSha256: source.missionSha256, retainedUserArtwork: disposition.retainedByUser,
    checked, nativeRendering: 'PENDING', userVisualAcceptance: 'PENDING' };
await fs.writeFile(path.join(base, 'static-check.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, retainedMembers, verifiedPages, checkedFamilies: checked.length }));
