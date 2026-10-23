// Verify original target slots and native depth independently of exported atlas data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
const root = '.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const exported = read(`${root}/export-and-preservation-v4.json`);
const manifest = read(`.local/terrain-packs/${exported.candidate.revision}/manifest.json`);
const guide = read(`${root}/source.json`);
const records = exported.records.map((row: any) => {
    const source = guide.sources.find((s: any) => s.member === row.member);
    const targetBytes = readFileSync(row.original.file), donorBytes = readFileSync(row.donorOriginal.file);
    assert.equal(sha(targetBytes), row.sourceSha256);
    assert.equal(sha(donorBytes), row.donorOriginal.sha256);
    const target = new TmpFile(VirtualFile.fromBytes(targetBytes, row.member));
    const donor = new TmpFile(VirtualFile.fromBytes(donorBytes, row.donorMember));
    const member = manifest.groups.find((g: any) => g.id === row.group).members.find((m: any) => m.member === row.member);
    const images = target.images.map((image, slot) => {
        assert.deepEqual(JSON.parse(JSON.stringify(nativeTerrainMetadata(target, slot))), member.images[slot]);
        const depth = (data?: Uint8Array) => data ? sha(data) : null;
        return { subTile: slot, targetPointer: source.images[slot].nativeOffset,
            targetDepthSha256: depth(image.zData), donorDepthSha256: depth(donor.images[slot].zData),
            targetExtraPixelsSha256: depth(image.extraData), targetTilePixelsSha256: depth(image.tileData),
            metadata: nativeTerrainMetadata(target, slot) };
    });
    return { member: row.member, sourceSha256: row.sourceSha256, images };
});
writeFileSync(`${root}/target-native-metadata-v3.json`, JSON.stringify({
    status: 'PASS_ALL_36_TARGET_HEADERS_INDICES_NATIVE_DEPTH_AND_SOURCE_HASHES', candidate: exported.candidate,
    records, originalFilesModified: false,
    policy: 'Target metadata and native depth come from the pinned original TMP. Donor pixels do not replace target headers, terrain/ramp rules, Z arrays, logical extents or source identity.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS_TARGET_NATIVE_METADATA', members: records.length,
    activeSlots: records.flatMap((r: any) => r.images).filter((f: any) => f.targetPointer > 0).length }));
