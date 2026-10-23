import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { TheaterType } from '../../src/engine/TheaterType';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';

const root = '.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const exported = read(`${root}/export-v2.json`);
const manifest = read(`.local/terrain-packs/${exported.candidate.revision}/manifest.json`);
const files = exported.records.map((row: any) => new TmpFile(VirtualFile.fromBytes(
    readFileSync(row.original.file), row.member)));
const theater = { type: TheaterType.NewUrban, tileSets: {
    readMaxTileNum: () => files.length, getTile: (index: number) => ({ files: [files[index]] })
} };
const map = { tiles: { getAll: () => files.map((_: any, tileNum: number) => ({ tileNum })) } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

function route(selected: any, corrupted?: string) {
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        if (String(url).endsWith('/selection.json')) return Response.json(selected);
        const bytes = new Uint8Array(readFileSync(`.local/terrain-packs/${String(url).split('/').slice(2).join('/')}`));
        if (String(url).endsWith('/' + corrupted)) bytes[0] ^= 1;
        return new Response(bytes);
    }) as any;
}

for (const density of [2, 4] as const) test(`Batch 96 complete source groups publish at ${density}X`, async () => {
    expect(manifest.groups.length).toBeGreaterThan(64);
    expect(manifest.groups.length).toBeLessThanOrEqual(256);
    route(manifest);
    const loaded = await loadTerrainHd(map, theater, { renderer: {
        capabilities: { maxTextureSize: 8192 }, initTexture: () => {}
    } }, true, density, (density === 2 ? 512 : 1280) * 1024 ** 2, () => false);
    const expectedGroups = new Set(exported.records.map((row: any) => row.group));
    expect(loaded.report.groups.length).toBe(expectedGroups.size);
    expect(loaded.report.groups.filter((group: any) => group.status !== 'PUBLISHED')).toEqual([]);
    for (const file of files) {
        expect(file.images.every((image: any) => loaded.bindings.has(image))).toBe(true);
        const expected = exported.records.find((row: any) => row.member === file.filename);
        expect(loaded.bindings.get(file.images[0])?.source.sha256).toBe(expected.sourceSha256);
    }
    loaded.dispose(); loaded.dispose();
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.report.worldChargeBytes).toBe(0);
});

test('A damaged atlas rejects its complete source cohort while valid cohorts remain available', async () => {
    const failed = manifest.groups.find((group: any) => group.id === exported.records[0].group);
    route(manifest, failed.variants.find((v: any) => v.density === 2).file);
    const loaded = await loadTerrainHd(map, theater, { renderer: {
        capabilities: { maxTextureSize: 8192 }, initTexture: () => {}
    } }, true, 2, 512 * 1024 ** 2, () => false);
    expect(loaded.report.groups.find((g: any) => g.id === failed.id)?.reason).toContain('terrain-atlas-hash');
    for (const file of files) {
        const rejected = failed.members.some((member: any) => member.member === file.filename);
        expect(file.images.every((image: any) => loaded.bindings.has(image) === !rejected)).toBe(true);
    }
    loaded.dispose();
});

test('The actual desktop resource entry registers the compact manifest and every atlas route', async () => {
    const events: any[] = [];
    const registered = await registerTerrainResources('.local', (event: any) => events.push(event));
    expect(readFileSync(`.local/terrain-packs/${exported.candidate.revision}/manifest.json`).length).toBeLessThanOrEqual(2 * 1024 ** 2);
    expect(registered.selections.get('/local-terrain/newurban/selection.json')?.revision).toBe(exported.candidate.revision);
    expect(events.filter(event => event.theater === 'NEWURBAN').map(event => event.type)).toEqual(['terrain-registered']);
    for (const group of manifest.groups) for (const variant of group.variants)
        expect(registered.routes.has(`/local-terrain/${manifest.revision}/${variant.file}`)).toBe(true);
});
