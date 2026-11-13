import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { registerTerrainResources } from '../../desktop/terrain-profile.mjs';
import { activeEdition } from '../../src/editions/activeEdition';
import { retailMember, resourceRoot, selectedPack } from '../test-support/resources';

const pointer = JSON.parse(readFileSync(`${resourceRoot}/terrain-urban-selection.json`, 'utf8'));
const { directory: root, manifest } = selectedPack('terrain', 'URBAN');
const groupPrefix = process.env.RA2_URBAN_TERRAIN_GROUP_PREFIX;
const members = manifest.groups.flatMap((group: any) => group.members);
const sources = new Map<string, ReturnType<typeof retailMember> | undefined>(members.map((member: any) => {
    try { return [member.member, retailMember(activeEdition, member.member, member.sourceHashes[activeEdition])] as const; }
    catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Required archive member missing:')) throw error;
        return [member.member, undefined] as const;
    }
}));
const eligible = (member: any) => Boolean(member.sourceHashes[activeEdition] && sources.get(member.member));
const testedGroups = manifest.groups.filter((group: any) => (!groupPrefix || group.id.startsWith(groupPrefix))
    && group.members.every(eligible));
if (!testedGroups.length) throw new Error('The requested Urban edition and prefix must select source-qualified groups');
const files = members.map((member: any) => {
    const source = sources.get(member.member);
    return source && new TmpFile(source.file);
});
const renderer = { renderer: { capabilities: { maxTextureSize: 8192 }, initTexture: () => {} } };
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

test('Urban desktop registration admits the actual selected pack before renderer loading', async () => {
    const events: any[] = [];
    const registered = await registerTerrainResources(resourceRoot, event => events.push(event));
    const selected = registered.selections.get('/local-terrain/urban/selection.json');
    expect(selected).toEqual(manifest);
    expect(events.find(event => event.type === 'terrain-registered' && event.theater === 'URBAN'))
        .toMatchObject({ revision: pointer.revision, sha256: pointer.sha256 });
    expect(events.filter(event => event.type === 'terrain-original' && event.theater === 'URBAN')).toEqual([]);
    for (const group of manifest.groups) for (const variant of group.variants)
        expect(registered.routes.get(`/local-terrain/${pointer.revision}/${variant.file}`))
            .toBe(`${root}/${variant.file}`);
});

function fixture(group: any, fault = 'none') {
    const first = members.findIndex((member: any) => member.member === group.members[0].member);
    const theater = { type: 2, tileSets: { getTile: (index: number) => ({ files: files[index] ? [files[index]] : [] }),
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
    test(`Urban ${group.id} ${density}X loads only the encountered complete source family and releases it`, async () => {
        const f = fixture(group);
        const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, density,
            (density === 2 ? 512 : 1280) * 1024 * 1024, () => false);
        expect(f.requested).toEqual(['/local-terrain/urban/selection.json',
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
    test(`Urban terrain ${fault} retains complete Original fallback without leaked allocation`, async () => {
        const f = fixture(testedGroups[0], fault);
        const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, 4,
            fault === 'budget' ? 1 : 1280 * 1024 * 1024, () => fault === 'cancelled');
        expect(loaded.bindings.size).toBe(0);
        expect(loaded.textures.length).toBe(0);
        expect(loaded.report.worldChargeBytes).toBe(0);
        if (fault === 'budget' || fault === 'cancelled') expect(f.requested.length).toBe(1);
    });
}

for (const group of manifest.groups.filter((group: any) =>
    group.members.some((member: any) => !eligible(member)))) {
    test(`Urban ${group.id} without ${activeEdition} source qualification retains Original`, async () => {
        const f = fixture(group);
        const loaded = await loadTerrainHd(f.map, f.theater, renderer, true, 4, 1280 * 1024 * 1024, () => false);
        expect(loaded.bindings.size).toBe(0);
        expect(loaded.textures.length).toBe(0);
        expect(loaded.report.worldChargeBytes).toBe(0);
    });
}
