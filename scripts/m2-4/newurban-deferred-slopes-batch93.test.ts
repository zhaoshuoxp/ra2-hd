import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Engine } from '../../src/engine/Engine';
import { TmpFile } from '../../src/data/TmpFile';
import { TheaterType } from '../../src/engine/TheaterType';
import { loadTerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';

const pointer = JSON.parse(readFileSync('.local/terrain-newurban-selection.json', 'utf8'));
const manifest = JSON.parse(readFileSync(`.local/terrain-packs/${pointer.revision}/manifest.json`, 'utf8'));
const names = ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn'];
const tree = editionRetailTree(new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)])), 'yr');
const files = names.map(name => new TmpFile(resolveMember(tree, name).file));
const originalFetch = globalThis.fetch, originalVfs = Engine.vfs;
afterEach(() => { globalThis.fetch = originalFetch; Engine.vfs = originalVfs; });

for (const density of [2, 4] as const) test(`Unresolved NewUrban slopes retain complete Original at ${density}X`, async () => {
    expect(manifest.deferredSources.members.toSorted()).toEqual(names);
    expect(manifest.groups.flatMap((g: any) => g.members).some((m: any) => names.includes(m.member))).toBe(false);
    const requested: string[] = [];
    Engine.vfs = {} as any;
    globalThis.fetch = (async (url: any) => {
        requested.push(String(url));
        if (!String(url).endsWith('/selection.json')) throw Error('No deferred HD payload may be requested');
        return Response.json(manifest);
    }) as any;
    const theater = { type: TheaterType.NewUrban, tileSets: {
        readMaxTileNum: () => files.length, getTile: (index: number) => ({ files: [files[index]] }),
    } };
    const map = { tiles: { getAll: () => files.map((_, tileNum) => ({ tileNum })) } };
    const loaded = await loadTerrainHd(map, theater, { renderer: { capabilities: { maxTextureSize: 8192 },
        initTexture: () => { throw Error('No deferred texture may publish'); } } }, true, density,
        (density === 2 ? 512 : 1280) * 1024 ** 2, () => false);
    expect(requested).toEqual(['/local-terrain/newurban/selection.json']);
    expect(loaded.bindings.size).toBe(0);
    expect(loaded.textures.length).toBe(0);
    expect(loaded.report.worldChargeBytes).toBe(0);
    loaded.dispose(); loaded.dispose();
    expect(loaded.report.disposed).toBe(true);
});
