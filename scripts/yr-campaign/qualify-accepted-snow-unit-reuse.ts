import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHdResources, hdIdentities } from '../../desktop/hd-profile.mjs';
import { unitHdFamiliesForEdition } from '../../src/engine/renderable/builder/unitHdFamilies';
import { nativeShpSource, retailMember, resourceRoot, sha256 } from '../test-support/resources';

const [sourceFile, inventoryFile, priorAuditFile, output] = process.argv.slice(2);
assert(output);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const pinned = (file: string) => ({ file, sha256: sha256(fs.readFileSync(file)) });
const source = read(sourceFile), inventory = read(inventoryFile), priorAudit = read(priorAuditFile);
const profile = await registerHdResources(resourceRoot), contracts = unitHdFamiliesForEdition('yr');
const temperate = retailMember('yr', 'unittem.pal'), snow = retailMember('yr', 'unitsno.pal');
const families = [];
for (const row of source.cases) {
    const dedicated = row.identity === 'E2', contract = contracts[row.identity];
    assert(dedicated || contract);
    const route = dedicated ? '/local-hd/selection.json'
        : `/local-hd/${contract.selection ?? 'unit-'+row.identity.toLowerCase()}-selection.json`;
    const binding = profile.selections.get(route) as any;
    assert(binding);
    if (dedicated) assert.equal(binding.sha256, hdIdentities.conscript);
    else assert.equal(binding.familyHash, contract.familyHash);
    const member = dedicated ? binding : binding.members.find((r: any) => r.member === row.member);
    assert(member && member.sha256 === row.parent.sha256);
    const manifestFile = profile.routes.get(`/local-hd/${member.sha256}/manifest.json`);
    assert(manifestFile && sha256(fs.readFileSync(manifestFile)) === row.parent.sha256);
    const manifest = read(manifestFile);
    const native = nativeShpSource('yr', row.member, row.sourceSha256, row.bodySlots, manifest.source.theater);
    assert.equal(native.image.numImages, row.totalNativeSlots);
    assert.equal(native.image.numImages, row.bodySlots*2);
    assert.deepEqual(manifest.logical, { canvas: native.source.canvas, frames: native.source.frames });
    const used = new Set<number>(), sensitive: number[] = [];
    for (const [ordinal, image] of native.image.images.slice(0, row.bodySlots).entries()) {
        for (const index of image.imageData) used.add(index);
        if (image.imageData.includes(254)) sensitive.push(ordinal);
    }
    const material = [...used].filter(n => n && (n < 16 || n > 31)).sort((a, b) => a-b);
    const different = material.filter(n => [0, 1, 2].some(channel =>
        temperate.file.getBytes()[n*3+channel] !== snow.file.getBytes()[n*3+channel]));
    assert.deepEqual(different, [254]);
    assert.deepEqual(sensitive, row.affected.map((r: any) => r.nativeFrame));
    const pages = [];
    for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const file = profile.routes.get(member.files[page[role]]);
        assert(file);
        const bytes = fs.readFileSync(file);
        assert.equal(sha256(bytes), page[role+'Sha256']); assert.equal(bytes.length, page[role+'Bytes']);
        pages.push({ density: variant.density, role, ...pinned(file) });
    }
    families.push({ identity: row.identity, sourceSha256: row.sourceSha256, manifest: pinned(manifestFile),
        selection: route, acceptedDensityVariants: manifest.variants.map((v: any) => v.density),
        nativeBodyFrames: row.bodySlots, everyUsedMaterialIndex: material, differentUsedMaterialIndices: different,
        originalPaletteSensitiveFrames: sensitive, unchangedAcceptedPages: pages,
        automaticPaletteIdentityQualified: false, acceptedRgbaArtworkRetained: true });
}
const nativeCases = [];
for (const mission of ['all07smd.map', 'sov02smd.map']) for (const density of [2, 4]) {
    const stem = mission.startsWith('all') ? 'all07' : 'sov02';
    const file = `.artifacts/yr-campaign/accepted-snow-unit-reuse-${stem}-${density}x-r1/report.json`;
    const report = read(file);
    assert.equal(report.status, 'PASS_NATIVE_ACCEPTED_UNIT_REUSE_IN_SNOW_EXACT_MANIFESTS_FROZEN_WORLD_AND_RELEASE');
    assert.equal(report.mission, mission); assert.equal(report.density, density);
    const mapFile = `${resourceRoot}/campaign/yr/${mission.slice(0, -4)}/${mission}`;
    assert.equal(report.sourceTemplate.launch.sourceSha256, sha256(fs.readFileSync(mapFile)));
    assert.deepEqual(report.after, report.before);
    for (const family of families) {
        const native = report.families.find((r: any) => r.identity === family.identity);
        assert(native && native.binding.identity.startsWith(`${family.manifest.sha256}/${family.sourceSha256}/`));
        assert.equal(native.binding.family.density, density);
        assert.equal(native.frames.length, family.nativeBodyFrames);
        for (const frame of native.frames) {
            assert(frame.gpuHd && frame.glError === 0 && !frame.shadowOverride);
            assert.equal(frame.shadowFrame, frame.expectedShadowFrame);
            assert.deepEqual(frame.sample, frame.logical.map((n: number) => n*density));
        }
    }
    assert.equal(report.release.textures, report.release.disposedTextures);
    for (const name of ['unitGpuBytes', 'terrainWorldCharge', 'environmentWorldCharge']) assert.equal(report.release[name], 0);
    nativeCases.push(pinned(file));
}
const contexts = priorAudit.unresolved.map((unresolved: any) => {
    const row = inventory.rows.find((r: any) => r.key === unresolved.key);
    const family = families.find(f => f.identity === row?.id);
    assert(row && family && row.theater === 'SNOW' && row.source.sha256 === family.sourceSha256);
    assert.equal(row.palette.sha256, snow.sha256);
    return { key: row.key, identity: row.id, sourceSha256: family.sourceSha256,
        paletteSha256: snow.sha256, originalUsedMaterialDifference: family.differentUsedMaterialIndices,
        campaignSources: Object.keys(row.usage).map(mission => {
            const map = inventory.maps.find((r: any) => r.mission === mission);
            assert(map && ['all07smd.map', 'sov02smd.map'].includes(mission));
            return { mission, sha256: map.sourceSha256 };
        }), status: 'RETAINED_ACCEPTED_RGBA_ART_NATIVE_SNOW_REUSE_VERIFIED_PALETTE_DIFFERENCE_DOCUMENTED' };
});
assert.equal(contexts.length, 8);
const guard = 'scripts/yr-campaign/qualify-unit-reuse.ts';
assert.equal(sha256(execFileSync('git', ['show', 'HEAD:'+guard])), sha256(fs.readFileSync(guard)));
const report = { schema: 'yr-retained-accepted-unit-snow-reuse-qualification-v1',
    status: 'PASS_ACCEPTED_RESOURCE_IDENTITIES_AND_NATIVE_SNOW_REUSE_WITH_DOCUMENTED_PALETTE_DIFFERENCE',
    source: pinned(sourceFile), inventory: pinned(inventoryFile), priorAutomaticPaletteAudit: pinned(priorAuditFile),
    policy: 'Reuse the existing accepted skirmish RGBA unit artwork unchanged. Compare every actually used original color, including index254, and retain the real indexed-palette difference explicitly. Automatic palette identity is not claimed. Native inspection checks the selected accepted artwork, complete geometry, original shadows and release in both original Snow missions. A palette-audit mismatch alone does not establish a visual defect or justify pose reauthoring.',
    originalPalettes: [{ member: 'unittem.pal', sha256: temperate.sha256 }, { member: 'unitsno.pal', sha256: snow.sha256 }],
    families, contexts, nativeCases, strictGeneralPaletteGuardUnchanged: pinned(guard),
    newArtwork: false, resourceFilesReplaced: 0, runtimeOrSelectionChanges: 0,
    ordinaryActionValidation: 'SEPARATE', userVisualAcceptance: 'EXISTING_ART_RETAINED_NEW_SNOW_CONTEXT_REVIEW_PENDING',
    windows: 'NOT_RUN_ON_THIS_MAC' };
fs.writeFileSync(output, JSON.stringify(report, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, families: families.length, contexts: contexts.length, nativeCases: nativeCases.length, output }));
