import { selectedPack, retailTreeFor } from '../../test-support/resources';
import { beforeAll, afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../../src/engine/Engine';
import { TmpFile } from '../../../src/data/TmpFile';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { loadTerrainHd } from '../../../src/engine/renderable/entity/map/TerrainHd';

let directory: string, manifest: any, group: any, files: TmpFile[], theater: any, nativeImages: number;
beforeAll(() => {
    const override = process.env.RA2_TERRAIN_TEST_ROOT;
    ({ directory, manifest } = override ? { directory: override,
        manifest: JSON.parse(readFileSync(`${override}/manifest.json`, 'utf8')) } : selectedPack('terrain'));
    expect(manifest.schema).toBe('tmp-terrain-hd-v1');
    group = manifest.groups.find((value: any) => value.id === 'm2-3-set23');
    if (!group) throw Error('Selected terrain lacks required slope closure m2-3-set23');
    const tree = retailTreeFor('ra2');
    files = group.members.map((member: any) => new TmpFile(resolveMember(tree, member.member).file));
    theater = { type: 1, tileSets: { getTile: (index: number) => ({ files: [files[index]] }), readMaxTileNum: () => files.length } };
    nativeImages = files.reduce((sum, file) => sum + file.images.length, 0);
});
const map = { tiles: { getAll: () => [{ tileNum: 0 }] } };
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

function serve(corrupt = false) {
    const fetched: string[] = [];
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        const name = String(url) === '/local-terrain/selection.json' ? 'manifest.json' : String(url).split('/').at(-1);
        fetched.push(name);
        const bytes = readFileSync(`${directory}/${name}`);
        if (corrupt && name.endsWith('.rgba')) bytes[100] ^= 1;
        return new Response(bytes);
    }) as any;
    return fetched;
}

for (const density of [2, 4] as const) test(`new terrain closure loads only encountered groups at ${density}X`, async () => {
    const fetched = serve();
    const budget = (density === 2 ? 512 : 1280) * 1024 * 1024;
    const loaded = await loadTerrainHd(map, theater, renderer, true, density, budget, () => false);
    expect(manifest.groups.length).toBeGreaterThan(8);
    expect(fetched).toEqual(['manifest.json', group.variants.find((v: any) => v.density === density).file]);
    expect(loaded.bindings.size).toBe(nativeImages);
    expect(new Set([...loaded.bindings.values()].map(binding => binding.group))).toEqual(new Set([group.id]));
    expect(loaded.textures.length).toBe(1);
    expect(loaded.report.worldChargeBytes).toBeGreaterThan(loaded.report.gpuBytes * 2);
    expect(loaded.report.worldChargeBytes).toBeLessThanOrEqual(budget);
    let released = 0;
    loaded.textures[0].addEventListener('dispose', () => released++);
    loaded.dispose(); loaded.dispose();
    expect(released).toBe(1);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.report.worldChargeBytes).toBe(0);
});

test('corrupt new terrain atlas keeps the whole group native before publication', async () => {
    serve(true);
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 1280 * 1024 * 1024, () => false);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.textures.length).toBe(0);
    expect(loaded.report.groups.find((value: any) => value.id === group.id).reason).toContain('terrain-atlas-hash');
    expect(loaded.report.worldChargeBytes).toBe(0);
});

test('exhausted world capacity rejects the new closure without fetching its atlas', async () => {
    const fetched = serve();
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 0, () => false);
    expect(fetched).toEqual(['manifest.json']);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.report.groups.find((value: any) => value.id === group.id).reason).toContain('terrain-world-budget');
});

test('cancelled terrain loading publishes no group or retained allocation', async () => {
    const fetched = serve();
    let cancelled = false, uploads = 0, releases = 0;
    const cancellationRenderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: (texture: any) => {
        uploads++;
        texture.addEventListener('dispose', () => releases++);
        cancelled = true;
    } } };
    const loaded = await loadTerrainHd(map, theater, cancellationRenderer, true, 4, 1280 * 1024 * 1024, () => cancelled);
    expect(fetched.length).toBe(2);
    expect(uploads).toBe(1);
    expect(releases).toBe(1);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.textures).toHaveLength(0);
    expect(loaded.report.worldChargeBytes).toBe(0);
    loaded.dispose();
    expect(releases).toBe(1);
});
