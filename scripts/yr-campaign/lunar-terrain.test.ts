import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { activeEdition } from '../../src/editions/activeEdition';
import { Engine } from '../../src/engine/Engine';
import { theaterName } from '../../src/engine/theaterName';
import { TmpFile } from '../../src/data/TmpFile';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';
import { retailMember } from '../test-support/resources';

const pointer = JSON.parse(readFileSync('.local/terrain-lunar-selection.json', 'utf8'));
const root = `.local/terrain-packs/${pointer.revision}`;
const manifestBytes = readFileSync(`${root}/manifest.json`);
const manifest = JSON.parse(manifestBytes.toString());
const members = manifest.groups.flatMap((group: any) => group.members);
const files = members.map((member: any) => new TmpFile(retailMember('yr', member.member, member.sourceHashes.yr).file));
const theater = { type: 8, tileSets: { getTile: (index: number) => ({ files: [files[index]] }),
    readMaxTileNum: () => files.length } };
const map = { tiles: { getAll: () => files.map((_: unknown, tileNum: number) => ({ tileNum })) } };
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

test('Lunar registration pins a separate YR-only original source closure', async () => {
    expect(theaterName(8)).toBe('LUNAR');
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(pointer.sha256);
    expect(manifest.schema).toBe('tmp-terrain-hd-v1'); expect(manifest.editions).toEqual(['yr']);
    expect(members).toHaveLength(196); expect(manifest.groups).toHaveLength(9);
    expect(members.every((member: any) => Object.keys(member.sourceHashes).join() === 'yr')).toBe(true);
    const registration = await registerTerrainResources('.local');
    expect(registration.selections.get('/local-terrain/lunar/selection.json')).toEqual(manifest);
    for (const group of manifest.groups) for (const variant of group.variants) {
        const file = registration.routes.get(`/local-terrain/${pointer.revision}/${variant.file}`);
        expect(file).toBeDefined();
        expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(variant.sha256);
    }
    for (const theater of ['snow', 'urban', 'newurban', 'desert'])
        expect(registration.selections.has(`/local-terrain/${theater}/selection.json`)).toBe(true);
});

for (const density of [2, 4] as const) test(`Lunar ${density}X validates exact native geometry and releases its complete closure`, async () => {
    const requested: string[] = [];
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        const route = String(url); requested.push(route);
        return new Response(readFileSync(`${root}/${route.endsWith('selection.json') ? 'manifest.json' : route.split('/').at(-1)}`));
    }) as any;
    const loaded = await loadTerrainHd(map, theater, renderer, true, density, (density === 2 ? 512 : 1536) * 1024 * 1024, () => false);
    expect(requested[0]).toBe('/local-terrain/lunar/selection.json');
    if (activeEdition === 'yr') {
        expect(loaded.report.groups.every((group: any) => group.status === 'PUBLISHED')).toBe(true);
        expect(loaded.bindings.size).toBe(338); expect(loaded.textures).toHaveLength(9);
        expect(loaded.report.gpuBytes).toBe(density === 2 ? 14303232 : 55640064);
        expect(loaded.report.worldChargeBytes).toBeLessThan(loaded.report.budget);
    } else {
        expect(loaded.bindings.size).toBe(0); expect(loaded.textures).toHaveLength(0);
        expect(requested).toHaveLength(1); expect(loaded.report.groups[0].reason).toContain('terrain-contract');
    }
    loaded.dispose(); expect(loaded.bindings.size).toBe(0); expect(loaded.report.worldChargeBytes).toBe(0);
});

test('Lunar corruption and budget faults preserve complete native fallback', async () => {
    Engine.vfs = {} as any;
    const group = manifest.groups[0], tileNum = members.findIndex((member: any) => member.member === group.members[0].member);
    for (const fault of ['corrupt', 'missing', 'budget', 'edition']) {
        globalThis.fetch = (async (url: any) => {
            const route = String(url);
            if (route.endsWith('selection.json')) return Response.json({ ...manifest,
                editions: fault === 'edition' ? [] : manifest.editions });
            if (fault === 'missing') return new Response('', { status: 404 });
            const bytes = readFileSync(`${root}/${route.split('/').at(-1)}`);
            if (fault === 'corrupt') bytes[0] ^= 1;
            return new Response(bytes);
        }) as any;
        const loaded = await loadTerrainHd({ tiles: { getAll: () => [{ tileNum }] } }, theater, renderer,
            true, 4, fault === 'budget' ? 1 : 1536 * 1024 * 1024, () => false);
        expect(loaded.bindings.size).toBe(0); expect(loaded.textures).toHaveLength(0);
        expect(loaded.report.worldChargeBytes).toBe(0); loaded.dispose();
    }
});
