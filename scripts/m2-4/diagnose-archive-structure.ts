import { readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { registerOfficialSkirmish, openOfficialSkirmish } from '../../src/offline/officialSkirmish';
import catalog from '../../src/offline/officialSkirmishCatalog.json';
import { MapFile } from '../../src/data/MapFile';
import { TileSets } from '../../src/game/theater/TileSets';
import { IniFile } from '../../src/data/IniFile';
import { TmpFile } from '../../src/data/TmpFile';

const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const records: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    await registerOfficialSkirmish(tree, edition);
    const sets = new TileSets(new IniFile(resolveMember(tree, edition === 'yr' ? 'temperatmd.ini' : 'temperat.ini').file));
    const failures: Record<string, string> = {};
    sets.loadTileData({ get(name: string) {
        try { return new TmpFile(resolveMember(tree, name).file); }
        catch (error) { failures[name] = String(error); return undefined; }
    } }, '.tem');
    const entry = sets.getTile(22)!;
    for (const source of catalog.maps.filter(map => map.edition === edition
        && (map.source.sha256.startsWith('beaac8d3ffd2') || map.source.sha256.startsWith('f11a0e453c44') || map.starts === 0))) {
        const map = new MapFile(openOfficialSkirmish(source.runtimeName)!);
        const expected = `${entry.owner.fileName}${String(entry.index + 1).padStart(2, '0')}.tem`;
        records.push({ mapId: source.mapId, source: source.source, fullSize: map.fullSize, localSize: map.localSize,
            starts: map.startingLocations, waypoints: Object.fromEntries(map.getSection('Waypoints')?.entries ?? []),
            missingTile: { number: 22, setName: entry.owner.setName, expectedMember: expected,
                nativeFiles: entry.files.map(file => file.filename), failure: failures[expected],
                referencedTiles: map.tiles.filter(tile => tile.tileNum === 22) } });
    }
}
writeFileSync(process.argv[2], JSON.stringify({ schema: 'm2-4-archive-structure-diagnosis-v1', records,
    policy: 'Read-only imported bytes. No inferred replacement terrain or fabricated starting location.' }, null, 2) + '\n', { flag: 'wx' });
