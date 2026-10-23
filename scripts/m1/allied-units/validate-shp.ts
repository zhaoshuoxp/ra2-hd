import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';
import { resolveSovietUnitMembers } from '../../../src/engine/renderable/builder/loadSovietUnitsHd';
import { disposeHdSprite } from '../../../src/engine/renderable/builder/resolveHdSprite';

const root = process.argv[2], output = process.argv[3];
assert(root && output, 'Usage: validate-shp.ts PACK_ROOT REPORT');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(path.join(root, 'manifest.json'));
const manifest = JSON.parse(manifestBytes.toString());
const reports = [];
const density = Math.max(...manifest.variants.map((v: any) => v.density));
for (const edition of (process.argv.includes('--yr-only') ? ['yr'] : ['ra2', 'yr']) as ('ra2' | 'yr')[]) {
    const archives = new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
        [name, readFileSync(`.local/assets/ra2/${name}`)] as const));
    if (edition === 'yr') for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'])
        archives.set(name, readFileSync(`.local/assets/yr/${name}`));
    const file = resolveMember(editionRetailTree(archives, edition), manifest.source.member).file;
    const image = new ShpFile(file), count = manifest.logical.frames.length;
    assert.equal(hash(Uint8Array.from(file.getBytes())), manifest.source.sha256);
    const source = { member: manifest.source.member, sha256: manifest.source.sha256, theater: 'TEMPERATE',
        canvas: [image.width, image.height], frames: image.images.slice(0, count).map((f, nativeFrame) => ({
            nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
            legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean),
        })) };
    let uploads = 0, disposed = 0;
    const read = async (filename: string, expected: string, bytes: number) => {
        const data = readFileSync(path.join(root, filename));
        assert.equal(hash(data), expected); assert.equal(data.length, bytes);
        const png = PNG.sync.read(data);
        return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    };
    const input = { image, manifest, manifestHash: hash(manifestBytes), source, read };
    const loaded = await resolveSovietUnitMembers([input], density, 256 * 1024 * 1024, 2048, textures => {
        uploads += textures.length;
        textures.forEach(texture => texture.addEventListener('dispose', () => disposed++));
    }, () => false, true);
    assert.equal(loaded.density, density, JSON.stringify(loaded.attempts));
    assert.equal(loaded.members.get(source.member)!.override.frames.length, count);
    let physicalBytes = 0;
    for (const member of loaded.members.values()) for (const page of member.override.pages)
        physicalBytes += page.base.image.data.byteLength + page.data.image.data.byteLength
            + (page.tiles?.map.image.data.byteLength ?? 0);
    assert.equal(physicalBytes, loaded.gpuBytes);
    loaded.members.forEach(member => disposeHdSprite(member.override));
    assert.equal(uploads, disposed);
    const denied = await resolveSovietUnitMembers([input], density, 1, 2048, () => {
        throw Error('Over-budget family must not upload');
    }, () => false, true);
    assert.equal(denied.density, 1); assert.equal(denied.gpuBytes, 0);
    reports.push({ edition, frames: count, physicalBytes, uploads, disposed, budgetFallback: true });
}
writeFileSync(output, JSON.stringify({ status: 'PASS_STAGED_SHP_SOURCE_AND_CPU_RESOLUTION',
    manifestHash: hash(manifestBytes), runtimeActivation: false, reports }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(reports));
