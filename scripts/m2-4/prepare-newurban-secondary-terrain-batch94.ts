// Compare original source geometry and rules before registering accepted Urban artwork.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guides = {
    target: '.artifacts/m2-4/newurban-native-v1',
    donor: '.artifacts/m2-4/urban-native-v2'
};
const targetGuide = read(`${guides.target}/source.json`);
const donorGuide = read(`${guides.donor}/source.json`);
const baseline = read('.local/terrain-newurban-selection.json');
assert.deepEqual(baseline, read(`${root}/baseline-selector.json`));
const acceptedUrban = read('.local/terrain-urban-selection.json');
const acceptedRoot = `.local/terrain-packs/${acceptedUrban.revision}`;
assert.equal(pin(`${acceptedRoot}/manifest.json`).sha256, acceptedUrban.sha256);
const accepted = read(`${acceptedRoot}/manifest.json`);
const screen = read(`${root}/urban-native-comparison-v1.json`);
const candidates = screen.rows.filter((row: any) => row.set !== 47 && !row.geometryDifferences.some(
    (diff: any) => !['member', 'radar', 'nativeOffset', 'terrainType'].includes(diff.key)));
assert.equal(candidates.length, 111);
const records = candidates.map((row: any) => {
    const target = targetGuide.sources.find((source: any) => source.member === row.member);
    const donor = donorGuide.sources.find((source: any) => source.member === row.donorMember);
    const targetFile = `${guides.target}/native/${target.nativeFile}`;
    const donorFile = `${guides.donor}/native/${donor.nativeFile}`;
    assert.equal(pin(targetFile).sha256, target.sha256);
    assert.equal(pin(donorFile).sha256, donor.sha256);
    const a = new TmpFile(VirtualFile.fromBytes(readFileSync(targetFile), target.member));
    const b = new TmpFile(VirtualFile.fromBytes(readFileSync(donorFile), donor.member));
    const group = accepted.groups.find((g: any) => g.members.some((m: any) => m.member === donor.member));
    const definition = group.members.find((m: any) => m.member === donor.member);
    assert(Object.values(definition.sourceHashes).includes(donor.sha256));
    assert.equal(a.images.length, b.images.length);
    const frames = target.images.map((image: any, slot: number) => {
        const tm = nativeTerrainMetadata(a, slot), dm = nativeTerrainMetadata(b, slot);
        const visualKeys = ['subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height',
            'extra', 'hasExtraData', 'hasZData', 'rampType'];
        for (const key of visualKeys) assert.deepEqual((tm as any)[key], (dm as any)[key], `${target.member}/${slot}/${key}`);
        const guideMetadata = Object.fromEntries(Object.entries(image).filter(([key]) =>
            !['nativeOffset', 'size', 'file', 'rgbaSha256'].includes(key)));
        assert.deepEqual(JSON.parse(JSON.stringify(tm)), guideMetadata);
        const depth = (bytes: Uint8Array | undefined) => bytes ? sha(bytes) : null;
        const az = a.images[slot].zData, bz = b.images[slot].zData;
        const differences = az && bz && az.length === bz.length
            ? Array.from(az, (value, index) => Math.abs(value - bz[index])) : [];
        return { subTile: slot, nativePointer: image.nativeOffset,
            targetRgba: pin(`${guides.target}/native/${image.file}`),
            donorRgba: pin(`${guides.donor}/native/${donor.images[slot].file}`),
            targetDepth: depth(a.images[slot].zData), donorDepth: depth(b.images[slot].zData),
            targetExtraPixels: depth(a.images[slot].extraData), donorExtraPixels: depth(b.images[slot].extraData),
            depthDifferentCells: differences.filter(value => value !== 0).length,
            depthMaxDifference: Math.max(0, ...differences),
            indexedPatternExact: sha(a.images[slot].tileData) === sha(b.images[slot].tileData),
            targetTerrainType: tm.terrainType, donorTerrainType: dm.terrainType };
    });
    return { member: target.member, donorMember: donor.member, donorGroup: group.id,
        sourceSha256: target.sha256, donorSha256: donor.sha256, targetOriginal: pin(targetFile),
        donorOriginal: pin(donorFile), targetSet: target.setIndex,
        adaptation: [80, 87, 103].includes(target.setIndex) ? 'ACCEPTED_NEWURBAN_GRASS_AT_EXISTING_HD_MATERIAL_BOUNDARY' : 'EXACT_ACCEPTED_URBAN_RGBA',
        frames, maps: row.maps };
});
writeFileSync(`${root}/source-preparation-v2.json`, JSON.stringify({
    status: 'PASS_111_COMPLETE_SOURCE_GEOMETRIES_WITH_TARGET_OWNED_DEPTH_NOT_SELECTED', baseline,
    acceptedUrban, targetGuide: pin(`${guides.target}/source.json`), donorGuide: pin(`${guides.donor}/source.json`),
    records, sourceMembers: records.length,
    targetRules: 'Original target terrain types, radar colors, headers, all indices and source hashes remain authoritative.',
    policy: 'Same names are only candidates. Original native geometry, ramp type and depth are checked independently. Quantized RGB palette differences do not require redrawing accepted architecture. Four unresolved wide-road slopes remain excluded and missing.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ members: records.length, adaptedMembers: records.filter((r: any) => r.adaptation !== 'EXACT_ACCEPTED_URBAN_RGBA').length,
    activeSlots: records.flatMap((r: any) => r.frames).filter((f: any) => f.nativePointer > 0).length }));
