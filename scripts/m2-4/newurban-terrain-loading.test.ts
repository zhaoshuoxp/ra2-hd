import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Engine } from '../../src/engine/Engine';
import { TheaterType } from '../../src/engine/TheaterType';
import { TmpFile } from '../../src/data/TmpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';

const pointer = JSON.parse(readFileSync('.local/terrain-newurban-selection.json', 'utf8'));
const root = `.local/terrain-packs/${pointer.revision}`;
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])), 'ra2');
const expansionTree = editionRetailTree(new Map(GAME_EDITIONS.yr.archives.map(name =>
    [name, readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)])), 'yr');
const groupPrefix = process.env.RA2_NEWURBAN_TERRAIN_GROUP_PREFIX;
const testedGroups = manifest.groups.filter((group: any) => !groupPrefix || group.id.startsWith(groupPrefix));
if (!testedGroups.length) throw new Error('The requested NewUrban group prefix must select actual resource groups');
const members = manifest.groups.flatMap((group: any) => group.members);
const files = members.map((member: any) => {
    const edition = tree.some(owner => owner.mix.containsFile(member.member)) ? 'ra2' : 'yr';
    const resolved = resolveMember(edition === 'ra2' ? tree : expansionTree, member.member);
    const bytes = resolved.file.stream.toUint8Array();
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(member.sourceHashes[edition]);
    return new TmpFile(resolved.file);
});
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

test('NewUrban desktop registration admits the actual selected pack before renderer loading', async () => {
    const events: any[] = [];
    const registered = await registerTerrainResources('.local', event => events.push(event));
    const selected = registered.selections.get('/local-terrain/newurban/selection.json');
    expect(selected).toEqual(manifest);
    expect(events.find(event => event.type === 'terrain-registered' && event.theater === 'NEWURBAN'))
        .toMatchObject({ revision: pointer.revision, sha256: pointer.sha256 });
    expect(events.filter(event => event.type === 'terrain-original' && event.theater === 'NEWURBAN')).toEqual([]);
    for (const group of manifest.groups) for (const variant of group.variants)
        expect(registered.routes.get(`/local-terrain/${pointer.revision}/${variant.file}`))
            .toBe(`${process.cwd()}/${root}/${variant.file}`);
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
