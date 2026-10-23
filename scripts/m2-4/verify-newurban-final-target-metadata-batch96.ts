// Parse target originals independently of authored RGB and atlas declarations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const version = process.argv[2] ?? 'v2';
const exported = read(`${root}/export-${version}.json`);
const manifest = read(`.local/terrain-packs/${exported.candidate.revision}/manifest.json`);
const source = read(`${root}/source-${version}.json`);
const records = exported.records.map((row: any) => {
    const bytes = readFileSync(row.original.file);
    assert.equal(sha(bytes), row.sourceSha256);
    const target = new TmpFile(VirtualFile.fromBytes(bytes, row.member));
    const declaration = manifest.groups.find((g: any) => g.id === row.group).members.find((m: any) => m.member === row.member);
    const guide = source.sources.find((s: any) => s.member === row.member);
    const slots = target.images.map((image, subTile) => {
        const metadata = JSON.parse(JSON.stringify(nativeTerrainMetadata(target, subTile)));
        assert.deepEqual(metadata, declaration.images[subTile]);
        return { subTile, nativePointer: guide.images[subTile].nativeOffset, metadata,
            nativeDepthSha256: image.zData ? sha(image.zData) : null,
            nativeMainIndexSha256: sha(image.tileData), nativeExtraIndexSha256: image.extraData ? sha(image.extraData) : null };
    });
    return { member: row.member, sourceSha256: row.sourceSha256, slots };
});
writeFileSync(`${root}/target-native-metadata-${version}.json`, JSON.stringify({
    status: 'PASS_21_ORIGINAL_TARGET_SOURCES_HEADERS_DEPTH_AND_INDEX_DATA', candidate: exported.candidate, records,
    originalMapOrArchiveModified: false, windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS_TARGET_NATIVE_METADATA', sources: records.length,
    positivePointerSlots: records.flatMap((r: any) => r.slots).filter((s: any) => s.nativePointer > 0).length }));
