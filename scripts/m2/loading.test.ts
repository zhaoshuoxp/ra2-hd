import { selectedPack, retailTreeFor } from '../test-support/resources';
import { beforeAll, test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';

let directory: string, manifest: any, expectedImages: number, affectedGroup: any, peerImages: number;
let theater: any, map: any;
beforeAll(() => {
    ({ directory, manifest } = selectedPack('terrain'));
    expectedImages = manifest.groups.reduce((sum: number, group: any) => sum
        + group.members.reduce((n: number, member: any) => n + member.images.length, 0), 0);
    affectedGroup = manifest.groups.find((group: any) => group.id === 'elevation-representative');
    if (!affectedGroup) throw Error('Selected terrain lacks elevation-representative');
    peerImages = expectedImages - affectedGroup.members.reduce((n: number, member: any) => n + member.images.length, 0);
    const tree = retailTreeFor('ra2');
    const files = manifest.groups.flatMap((group: any) => group.members.map((member: any) =>
        new TmpFile(resolveMember(tree, member.member).file)));
    theater = { type: 1, tileSets: { getTile: (index: number) => ({ files: [files[index]] }), readMaxTileNum: () => files.length } };
    map = { tiles: { getAll: () => files.map((_: any, tileNum: number) => ({ tileNum })) } };
});
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

function serve(mutate?: (url: string, bytes: Uint8Array) => Uint8Array) {
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        const file = String(url) === '/local-terrain/selection.json' ? 'manifest.json' : String(url).split('/').at(-1);
        let bytes = readFileSync(`${directory}/${file}`);
        if (mutate) bytes = Buffer.from(mutate(String(url), bytes));
        return new Response(bytes, { status: 200, headers: { 'Content-Type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
    }) as any;
}

test('real native closure publishes complete same-density shared terrain groups', async () => {
    serve();
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 1280 * 1024 * 1024, () => false);
    expect(loaded.report.groups.filter(group => group.status === 'PUBLISHED').length).toBe(manifest.groups.length);
    expect(loaded.bindings.size).toBe(expectedImages);
    expect(new Set([...loaded.bindings.values()].map(binding => binding.texture)).size).toBe(manifest.groups.length);
    expect(loaded.report.worldChargeBytes).toBeGreaterThan(loaded.report.gpuBytes * 2);
    loaded.dispose();
});

test('corrupt atlas falls back for its whole dependency group and preserves valid peers', async () => {
    serve((url, bytes) => {
        if (url.endsWith(affectedGroup.variants.find((v: any) => v.density === 4).file)) {
            const damaged = Uint8Array.from(bytes);
            damaged[100] ^= 1;
            return damaged;
        }
        return bytes;
    });
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 1280 * 1024 * 1024, () => false);
    expect(loaded.report.groups.find((g: any) => g.id === affectedGroup.id).status).toBe('ORIGINAL');
    expect(loaded.report.groups.find((g: any) => g.id === affectedGroup.id).reason).toContain('terrain-atlas-hash');
    expect([...loaded.bindings.values()].some(binding => binding.group === affectedGroup.id)).toBe(false);
    expect(loaded.bindings.size).toBe(peerImages);
    loaded.dispose();
});

test('edition source mismatch rejects the entire group before upload', async () => {
    serve((url, bytes) => {
        if (!url.endsWith('selection.json')) return bytes;
        const altered = JSON.parse(new TextDecoder().decode(bytes));
        altered.groups.find((g: any) => g.id === affectedGroup.id).members[1].sourceHashes.ra2 = '0'.repeat(64);
        return new TextEncoder().encode(JSON.stringify(altered));
    });
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 1280 * 1024 * 1024, () => false);
    expect(loaded.report.groups.find((g: any) => g.id === affectedGroup.id).reason).toContain('terrain-source-hash');
    expect(loaded.bindings.size).toBe(peerImages);
    loaded.dispose();
});

test('zero remaining world capacity uses Original without allocating resident terrain', async () => {
    serve();
    const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 0, () => false);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.report.worldChargeBytes).toBe(0);
    expect(loaded.report.groups.every(group => group.reason.includes('terrain-world-budget'))).toBe(true);
});

test('missing optional pack and Original preference retain the native path', async () => {
    Engine.vfs = {} as any;
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as any;
    const absent = await loadTerrainHd(map, theater, renderer, true, 4, 1e9, () => false);
    expect(absent.bindings.size).toBe(0);
    const off = await loadTerrainHd(map, theater, renderer, false, 4, 1e9, () => false);
    expect(off.report.gpuBytes).toBe(0);
});
