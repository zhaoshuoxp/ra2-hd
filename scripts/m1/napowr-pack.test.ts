import { resourceRoot, nativeShpSource } from '../test-support/resources';
import { test, expect, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { resolvePowerPlantHd, disposePowerPlantHd, aggregatePowerPlantHd } from '../../src/engine/renderable/builder/resolvePowerPlantHd';
import { powerPlantFamilyPaths, hdIdentities } from '../../desktop/hd-profile.mjs';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';

const familyPath = `${resourceRoot}/${powerPlantFamilyPaths.napowr}`;
const local = test;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function entries() {
    const familyBytes = readFileSync(familyPath);
    expect(digest(familyBytes)).toBe(hdIdentities.napowr);
    const family = JSON.parse(familyBytes.toString());
    return family.members.map((entry: any) => {
        const root = `${resourceRoot}/hd-packs/${entry.packId}/${entry.revision}`;
        const bytes = readFileSync(`${root}/manifest.json`);
        expect(digest(bytes)).toBe(entry.sha256);
        const manifest = JSON.parse(bytes.toString());
        const contract = napowrHdFamily.members.find(m => m.member === entry.member)!;
        const { image, source } = nativeShpSource('ra2', contract.member, contract.sha256, contract.frames, 'TEMPERATE');
        expect(manifest.logical.frames).toEqual(source.frames);
        return { image, manifest, manifestHash: entry.sha256, source,
            read: async (filename: string, hash: string, size: number) => {
                const bytes = readFileSync(`${root}/${filename}`);
                if (bytes.length !== size || digest(bytes) !== hash) throw Error('page-integrity');
                const png = PNG.sync.read(bytes);
                return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } };
    });
}
const resolve = (e = entries(), d = 4, max = 2048, upload = (_: THREE.Texture[]) => {}) => resolvePowerPlantHd(e, d, max, upload, 'NAPOWR', 64 * 1024 * 1024, true);
local('actual NAPOWR pages validate all 67 frames, RG8 values, native offsets and release', async () => {
    const e = entries(); let disposed = 0;
    const loaded = await resolve(e, 4, 2048, textures => textures.forEach(t => t.addEventListener('dispose', () => disposed++)));
    expect(loaded.report.density).toBe(4); expect(loaded.report.gpuBytes).toBeGreaterThan(0);
    expect(loaded.report.gpuBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    const aggregate = aggregatePowerPlantHd({ imageIndexes: new Map(e.map((x: any, i: number) => [x.image, [0, 3, 79][i]])) }, loaded, 'NAPOWR')!;
    expect(aggregate.frames.filter(Boolean).length).toBe(67);
    for (let i = 41; i < 79; i++) expect(aggregate.frames[i]).toBeUndefined();
    for (let i = 105; i < 210; i++) expect(aggregate.frames[i]).toBeUndefined();
    let bytes = 0, textures = 0;
    for (const o of loaded.overrides.values()) for (const page of o.pages) {
        expect(page.data.format).toBe(THREE.RGFormat);
        expect(page.base.format).toBe(THREE.RGBAFormat);
        expect(page.base.generateMipmaps).toBe(false);
        const allocations = [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean);
        bytes += allocations.reduce((sum, texture) => sum + texture!.image.data.byteLength, 0);
        textures += allocations.length;
        const data = page.data.image.data;
        expect(data.length).toBe(page.data.image.width * page.data.image.height * 2);
        for (let i = 1; i < data.length; i += 2) if (data[i] > 15) throw Error('invalid RG8 shade');
    }
    expect(bytes).toBe(loaded.report.gpuBytes); disposePowerPlantHd(loaded); expect(disposed).toBe(textures);
}, 30000);
local('complete family fallback handles corrupt, missing, incomplete, size and allocation failures', async () => {
    for (const failure of ['corrupt4', 'frame4', 'maxTexture', 'upload']) {
        const e = entries(); let disposed = 0, uploads = 0;
        const releases = spyOn(THREE.Texture.prototype, 'dispose');
        try {
            if (failure === 'corrupt4') { const read = e[2].read; e[2].read = async (...args: any[]) => { if (args[0].startsWith('4x')) throw Error('corrupt-page'); return read(...args); }; }
            if (failure === 'frame4') e[2].manifest.variants.find((v: any) => v.density === 4).frames.pop();
            const loaded = await resolve(e, 4, failure === 'maxTexture' ? 1 : 2048, textures => {
                textures.forEach(t => t.addEventListener('dispose', () => disposed++));
                if (failure === 'upload' && ++uploads === 1) throw Error('allocation-failure');
            });
            expect(loaded.report.density).toBe(failure === 'maxTexture' ? 1 : 2);
            expect([...loaded.overrides.values()].every(o => o.identity.endsWith('/2'))).toBe(true);
            if (failure !== 'maxTexture') expect(releases.mock.calls.length).toBeGreaterThan(0);
            disposePowerPlantHd(loaded);
        } finally { releases.mockRestore(); }
    }
    for (const failure of ['missing', 'hash', 'urban', 'no-pages']) {
        const e = entries();
        if (failure === 'missing') e.pop();
        if (failure === 'hash') e[0].source.sha256 = '0'.repeat(64);
        if (failure === 'urban') e.forEach((x: any) => x.source.theater = 'URBAN');
        if (failure === 'no-pages') e[2].read = async () => { throw Error('missing-page'); };
        const loaded = await resolve(e); expect(loaded.report.density).toBe(1); expect(loaded.overrides.size).toBe(0);
    }
    const e = entries(); e.forEach((x: any) => x.read = () => { throw Error('disabled read'); });
    expect((await resolve(e, 1)).report.attempts).toEqual([]);
}, 90000);
test('legacy graphics preferences migrate all HD families to enabled', () => {
    const o = new GraphicsOptions().unserialize('1,2,,4k,1,1,1');
    expect([o.rhinoHd.value, o.conscriptHd.value, o.powerPlantHd.value, o.napowrHd.value]).toEqual([true,true,true,true]);
    o.napowrHd.value = true; expect(new GraphicsOptions().unserialize(o.serialize()).napowrHd.value).toBe(true);
});

local('NAPOWR respects an explicit unit reserve before uploading any rejected density', async () => {
    const input = entries();
    const readDensities: string[] = [];
    for (const entry of input) {
        const read = entry.read;
        entry.read = async (...args: any[]) => { readDensities.push(args[0]); return read(...args); };
    }
    const low = await resolve(input, 2);
    const budget = low.report.gpuBytes;
    expect(low.report.density).toBe(2);
    disposePowerPlantHd(low);
    const uploaded: number[] = [];
    const loaded = await resolvePowerPlantHd(input, 4, 2048, textures => {
        uploaded.push(textures.reduce((sum, t) => sum + t.image.data.byteLength, 0));
    }, 'NAPOWR', budget, true);
    expect(loaded.report.density).toBe(2);
    expect(loaded.report.gpuBytes).toBeLessThanOrEqual(budget);
    expect(loaded.report.attempts[0].reason).toBe('combined-hd-memory-limit');
    // Pooled size is known after decoding, but rejected densities never upload.
    expect(uploaded).toEqual([loaded.report.gpuBytes]);
    disposePowerPlantHd(loaded);
});
