import { activeEdition } from '../../src/editions/activeEdition';
import { retailMember, resourceRoot, selectedPack } from '../test-support/resources';
import { MAX_TERRAIN_HD_GROUPS } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { TheaterType } from '../../src/engine/TheaterType';
import { TmpFile } from '../../src/data/TmpFile';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';

const { directory: root, manifest } = selectedPack('terrain', 'NEWURBAN');
const pointer = JSON.parse(readFileSync(`${resourceRoot}/terrain-newurban-selection.json`, 'utf8'));
const groupPrefix = process.env.RA2_NEWURBAN_TERRAIN_GROUP_PREFIX;
const testedGroups = manifest.groups.filter((group: any) => !groupPrefix || group.id.startsWith(groupPrefix));
if (!testedGroups.length) throw new Error('The requested NewUrban group prefix must select actual resource groups');
const members = manifest.groups.flatMap((group: any) => group.members);
expect(activeEdition).toBe('yr');
const files = members.map((member: any) => new TmpFile(retailMember('yr', member.member, member.sourceHashes.yr).file));
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

test('NewUrban desktop registration admits the actual selected pack before renderer loading', async () => {
    const events: any[] = [];
    const registered = await registerTerrainResources(resourceRoot, event => events.push(event));
    const selected = registered.selections.get('/local-terrain/newurban/selection.json');
    expect(selected).toEqual(manifest);
    expect(manifest.groups.length).toBeGreaterThan(64);
    expect(manifest.groups.length).toBeLessThanOrEqual(MAX_TERRAIN_HD_GROUPS);
    expect(readFileSync(`${root}/manifest.json`).length).toBeLessThanOrEqual(2 * 1024 ** 2);
    expect(events.find(event => event.type === 'terrain-registered' && event.theater === 'NEWURBAN'))
        .toMatchObject({ revision: pointer.revision, sha256: pointer.sha256 });
    expect(events.filter(event => event.type === 'terrain-original' && event.theater === 'NEWURBAN')).toEqual([]);
    for (const group of manifest.groups) for (const variant of group.variants)
        expect(registered.routes.get(`/local-terrain/${pointer.revision}/${variant.file}`))
            .toBe(`${root}/${variant.file}`);
});

function fixture(group: any, fault = 'none') {
    const first = members.findIndex((member: any) => member.member === group.members[0].member);
    const theater = { type: TheaterType.NewUrban, tileSets: { getTile: (index: number) => ({ files: [files[index]] }),
        readMaxTileNum: () => files.length } };
    const requested: string[] = [];
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        const route = String(url); requested.push(route);
        if (route.endsWith('selection.json') && fault === 'foreign')
            return Response.json({ ...manifest, theater: 'SNOW' });
        const file = route.endsWith('selection.json') ? 'manifest.json' : route.split('/').at(-1);
        const bytes = readFileSync(`${root}/${file}`);
        if (fault === 'corrupt' && file?.endsWith('.rgba')) bytes[100] ^= 1;
        return new Response(bytes);
    }) as any;
    return { theater, requested, map: { tiles: { getAll: () => [{ tileNum: first }] } } };
}

for (const group of testedGroups) for (const density of [2, 4] as const) {
    test(`NewUrban ${group.id} ${density}X loads only the encountered complete source family and releases it`, async () => {
        const f = fixture(group);
        const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, density,
            (density === 2 ? 512 : 1280) * 1024 * 1024, () => false);
        expect(loaded.report.groups.filter((g: any) => g.status !== 'PUBLISHED')).toEqual([]);
        expect(f.requested).toEqual(['/local-terrain/newurban/selection.json',
            `/local-terrain/${pointer.revision}/${group.variants.find((v: any) => v.density === density).file}`]);
        expect(loaded.bindings.size).toBe(group.members.reduce((n: number, member: any) => n + member.images.length, 0));
        expect(new Set([...loaded.bindings.values()].map(binding => binding.group))).toEqual(new Set([group.id]));
        expect(loaded.textures.length).toBe(1);
        let disposed = 0;
        loaded.textures[0].addEventListener('dispose', () => disposed++);
        loaded.dispose(); loaded.dispose();
        expect(disposed).toBe(1);
        expect(loaded.bindings.size).toBe(0);
        expect(loaded.report.worldChargeBytes).toBe(0);
    });
}

for (const fault of ['corrupt', 'foreign', 'budget', 'cancelled']) {
    test(`NewUrban terrain ${fault} retains complete Original fallback without leaked allocation`, async () => {
        const f = fixture(testedGroups[0], fault);
        const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, 4,
            fault === 'budget' ? 1 : 1280 * 1024 * 1024, () => fault === 'cancelled');
        expect(loaded.bindings.size).toBe(0);
        expect(loaded.textures.length).toBe(0);
        expect(loaded.report.worldChargeBytes).toBe(0);
        if (fault === 'budget' || fault === 'cancelled') expect(f.requested.length).toBe(1);
    });
}

// Replaces retired batch 94/95/96 export-path tests with current selected source cohorts.
test('a corrupt encountered cohort preserves an independently valid cohort', async () => {
    const failed = testedGroups[0], valid = manifest.groups.find((g: any) => g.id !== failed.id);
    expect(valid).toBeDefined();
    const f = fixture(failed);
    const failedFile = failed.variants.find((v: any) => v.density === 2).file;
    const original = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
        const response = await original(...args);
        if (!String(args[0]).endsWith('/' + failedFile)) return response;
        const bytes = new Uint8Array(await response.arrayBuffer()); bytes[100] ^= 1;
        return new Response(bytes);
    }) as any;
    const map = { tiles: { getAll: () => [failed, valid].map(group => ({
        tileNum: members.findIndex((m: any) => m.member === group.members[0].member),
    })) } };
    const loaded = await loadTerrainHd(map, f.theater, renderer, true, 2, 512 * 1024 ** 2, () => false);
    expect(loaded.report.groups.find((g: any) => g.id === failed.id)?.reason).toContain('terrain-atlas-hash');
    expect(loaded.report.groups.find((g: any) => g.id === valid.id)?.status).toBe('PUBLISHED');
    expect(loaded.bindings.size).toBe(valid.members.reduce((n: number, m: any) => n + m.images.length, 0));
    expect(new Set([...loaded.bindings.values()].map(b => b.group))).toEqual(new Set([valid.id]));
    loaded.dispose(); expect(loaded.report.worldChargeBytes).toBe(0);
});

test('oversized manifest is rejected before any payload or upload', async () => {
    const f = fixture(testedGroups[0]), requested: string[] = [];
    globalThis.fetch = (async (url: any) => {
        requested.push(String(url));
        return Response.json({ ...manifest, groups: Array(MAX_TERRAIN_HD_GROUPS + 1).fill(testedGroups[0]) });
    }) as any;
    const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, 4, 1280 * 1024 ** 2, () => false);
    expect(requested).toEqual(['/local-terrain/newurban/selection.json']);
    expect(loaded.report.groups[0].reason).toContain('terrain-contract');
    expect(loaded.bindings.size).toBe(0); expect(loaded.textures.length).toBe(0);
    expect(loaded.report.worldChargeBytes).toBe(0); loaded.dispose();
});
