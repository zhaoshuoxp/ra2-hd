import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';
import { resolveMember } from '../../src/offline/retail';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { resolveEnvironmentFamily } from '../../src/engine/renderable/builder/EnvironmentHd';
import { isEnvironmentHdSource } from '../../src/engine/renderable/builder/environmentHdContract';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';
import type { PowerPlantHdEntry } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const terrainPointer = JSON.parse(readFileSync('.local/terrain-snow-selection.json', 'utf8'));
const terrainRoot = `.local/terrain-packs/${terrainPointer.revision}`;
const terrain = JSON.parse(readFileSync(`${terrainRoot}/manifest.json`, 'utf8'));
const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])), 'ra2');
const expansionTree = editionRetailTree(new Map(GAME_EDITIONS.yr.archives.map(name =>
    [name, readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)])), 'yr');
const files = terrain.groups.flatMap((group: any) => group.members)
    .map((member: any) => new TmpFile(resolveMember(
        tree.some(({ mix }) => mix.containsFile(member.member)) ? tree : expansionTree, member.member).file));
const theater = { type: 4, tileSets: { getTile: (index: number) => ({ files: [files[index]] }),
    readMaxTileNum: () => files.length } };
const clearGroup = terrain.groups.find((group: any) => group.members.some((member: any) => member.member === 'clear01.sno'));
const clearIndex = terrain.groups.flatMap((group: any) => group.members)
    .findIndex((member: any) => member.member === 'clear01.sno');
const map = { tiles: { getAll: () => [{ tileNum: clearIndex }] } };
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

for (const density of [2, 4] as const) test(`SNOW ${density}X admits only encountered native closures and releases them`, async () => {
    const requested: string[] = [];
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        const route = String(url); requested.push(route);
        const file = route.endsWith('selection.json') ? 'manifest.json' : route.split('/').at(-1);
        return new Response(readFileSync(`${terrainRoot}/${file}`));
    }) as any;
    const loaded = await loadTerrainHd(map, theater, renderer, true, density, 512 * 1024 * 1024, () => false);
    expect(requested[0]).toBe('/local-terrain/snow/selection.json');
    expect(requested.length).toBe(2);
    expect(loaded.report.groups.map((group: any) => group.id)).toEqual([clearGroup.id]);
    expect(loaded.bindings.size).toBe(8);
    expect(loaded.report.worldChargeBytes).toBeGreaterThan(0);
    loaded.dispose(); expect(loaded.bindings.size).toBe(0); expect(loaded.report.worldChargeBytes).toBe(0);
});

test('SNOW corrupt terrain rejects the complete group and a foreign theater manifest', async () => {
    Engine.vfs = {} as any;
    for (const wrongTheater of [false, true]) {
        globalThis.fetch = (async (url: any) => {
            if (String(url).endsWith('selection.json')) return Response.json({ ...terrain,
                theater: wrongTheater ? 'TEMPERATE' : 'SNOW' });
            const bytes = readFileSync(`${terrainRoot}/${String(url).split('/').at(-1)}`);
            bytes[100] ^= 1; return new Response(bytes);
        }) as any;
        const loaded = await loadTerrainHd(map, theater, renderer, true, 4, 512 * 1024 * 1024, () => false);
        expect(loaded.bindings.size).toBe(0); expect(loaded.report.worldChargeBytes).toBe(0);
        expect(loaded.report.groups.at(-1)?.reason).toContain(wrongTheater ? 'terrain-contract' : 'terrain-atlas-hash');
    }
});

const requestedGroups = process.env.M24_TERRAIN_GROUPS?.split(',');
const productionGroups = terrain.groups.filter((group: any) => requestedGroups
    ? requestedGroups.includes(group.id) : /^m2-4-snow-batch\d+-/.test(group.id));
if (requestedGroups) expect(productionGroups.map((group: any) => group.id).sort()).toEqual(requestedGroups.sort());
for (const group of productionGroups) for (const density of [2, 4] as const) {
    test(`${group.id} ${density}X publishes its complete native closure and falls back atomically`, async () => {
        const members = terrain.groups.flatMap((value: any) => value.members);
        const first = members.findIndex((member: any) => member.member === group.members[0].member);
        const nativeCount = group.members.reduce((sum: number, member: any) =>
            sum + files[members.findIndex((value: any) => value.member === member.member)].images.length, 0);
        const selectedMap = { tiles: { getAll: () => [{ tileNum: first }] } };
        Engine.vfs = {} as any;
        for (const fault of ['none', 'corrupt', 'budget']) {
            const requested: string[] = [];
            globalThis.fetch = (async (url: any) => {
                const route = String(url); requested.push(route);
                const file = route.endsWith('selection.json') ? 'manifest.json' : route.split('/').at(-1);
                const bytes = readFileSync(`${terrainRoot}/${file}`);
                if (fault === 'corrupt' && file?.endsWith('.rgba')) bytes[100] ^= 1;
                return new Response(bytes);
            }) as any;
            const loaded = await loadTerrainHd(selectedMap, theater, renderer, true, density,
                fault === 'budget' ? 1 : (density === 2 ? 512 : 1280) * 1024 * 1024, () => false);
            expect(requested.length).toBe(fault === 'budget' ? 1 : 2);
            expect(loaded.bindings.size).toBe(fault === 'none' ? nativeCount : 0);
            expect(loaded.textures.length).toBe(fault === 'none' ? 1 : 0);
            if (fault === 'none') expect(new Set([...loaded.bindings.values()].map(binding => binding.group)))
                .toEqual(new Set([group.id]));
            else expect(loaded.report.worldChargeBytes).toBe(0);
            loaded.dispose(); expect(loaded.bindings.size).toBe(0);
            expect(loaded.report.worldChargeBytes).toBe(0);
        }
    });
}

function environmentEntry(): PowerPlantHdEntry {
    const prepared = JSON.parse(readFileSync('.artifacts/m2-4/snow-native-representatives-v1/source.json', 'utf8'));
    const native = prepared.sources.find((source: any) => source.member === 'caeur1.shp');
    const folder = '.local/environment-packs/snow-environment-m2-4-representatives-v1/members/caeur1-shp';
    const bytes = readFileSync(`${folder}/manifest.json`), manifest = JSON.parse(bytes.toString());
    return { image: { filename: native.member }, manifest,
        manifestHash: new Bun.CryptoHasher('sha256').update(bytes).digest('hex'),
        source: { member: native.member, sha256: native.sha256, theater: 'SNOW', canvas: native.canvas,
            frames: native.frames.slice(0, native.frames.length / 2).map((frame: any) => ({ nativeFrame: frame.slot,
                trimOrigin: frame.origin, trimSize: frame.size,
                legacyRenderSize: frame.size.map((size: number) => size + size % 2), empty: frame.empty })) },
        read: async filename => {
            const page = manifest.variants.flatMap((variant: any) => variant.pages.map((page: any) =>
                ({ ...page, density: variant.density }))).find((page: any) => [page.base, page.data].includes(filename));
            const role = page.base === filename ? 'base' : 'data';
            const decoded = execFileSync('python3', ['-c',
                'import sys,struct;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',
                `${folder}/${page.density}/${page.id}/${role}.png`], { maxBuffer: 32 * 1024 * 1024 });
            return { width: decoded.readUInt32LE(0), height: decoded.readUInt32LE(4),
                rgba: new Uint8Array(decoded.subarray(8)) };
        } };
}

test('complete SNOW house states load from actual exports; corrupt, missing or over-budget closure stays Original', async () => {
    const entry = environmentEntry();
    expect(isEnvironmentHdSource(entry.source)).toBe(true);
    expect(isEnvironmentHdSource({ ...entry.source, theater: 'TEMPERATE' })).toBe(false);
    for (const density of [2, 4] as const) {
        const loaded = await resolveEnvironmentFamily('snow-caeur1', [entry], density, 32 * 1024 * 1024, 2048, () => {});
        expect(loaded.attempts).toEqual([]);
        expect(loaded.overrides.size).toBe(1);
        expect(loaded.overrides.get(entry.image)?.frames.length).toBe(4);
        loaded.overrides.forEach(disposeHdSprite);
    }
    for (const [inputs, budget] of [
        [[], 32 * 1024 * 1024], [[{ ...entry, manifest: { ...entry.manifest, logical: {} } }], 32 * 1024 * 1024],
        [[entry], 1], [[{ ...entry, read: async () => { throw Error('missing page'); } }], 32 * 1024 * 1024],
    ] as [PowerPlantHdEntry[], number][]) {
        const loaded = await resolveEnvironmentFamily('snow-caeur1', inputs, 4, budget, 2048, () => {});
        expect(loaded.overrides.size).toBe(0); expect(loaded.worldChargeBytes).toBe(0);
    }
});
