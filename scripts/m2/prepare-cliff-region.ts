import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { MapFile } from '../../src/data/MapFile';
import { TileSets } from '../../src/game/theater/TileSets';
import { IniFile } from '../../src/data/IniFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-1/authoring-v8';
mkdirSync(root, { recursive: false });
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const inventory = JSON.parse(readFileSync('.artifacts/m2-1/inventory/inventory.json', 'utf8'));
const tileSets = new TileSets(new IniFile(resolveMember(trees.yr, 'temperatmd.ini').file));
tileSets.loadTileData({ get(name: string) {
    try { return new TmpFile(resolveMember(trees.yr, name).file); } catch { return undefined; }
} }, '.tem');
const map = new MapFile(resolveMember(trees.yr, 'XMP03T4.map').file);
const cells = map.tiles.filter(t => [9, 10, 25, 43].includes(tileSets.getSetNum(t.tileNum)))
    .map(t => {
        const entry = tileSets.getTile(t.tileNum);
        return { tile: [t.rx, t.ry, t.z, t.tileNum, t.subTile], set: tileSets.getSetNum(t.tileNum),
            member: entry.owner.fileName.toLowerCase() + String(entry.index + 1).padStart(2, '0') + '.tem',
            screen: [(t.rx - t.ry - (37 - 71)) * 30, (t.rx + t.ry - (37 + 71)) * 15 - (t.z - 5) * 15] };
    }).filter(t => Math.abs(t.screen[0]) < 520 && t.screen[1] > -400 && t.screen[1] < 220);
const names = new Set(cells.map(t => t.member));
const members = inventory.editions.yr.sets.filter((s: any) => [9, 10, 25, 43].includes(s.index))
    .flatMap((s: any) => s.members.filter((m: any) => names.has(m.member.toLowerCase())).map((m: any) => {
        const resolved = resolveMember(trees.yr, m.member), file = new TmpFile(resolved.file);
        const view = new DataView(file.sourceBytes.buffer, file.sourceBytes.byteOffset, file.sourceBytes.byteLength);
        return { member: file.filename, nativeName: m.member, archive: resolved.source, setIndex: s.index,
            sourceHashes: Object.fromEntries(Object.entries(trees).map(([edition, tree]) => [edition,
                createHash('sha256').update(resolveMember(tree, m.member).file.getBytes()).digest('hex')])),
            images: file.images.map((_, index) => nativeTerrainMetadata(file, index)),
            nativeOffsets: file.images.map((_, index) => view.getInt32(16 + index * 4, true)) };
    }));
writeFileSync(`${root}/region.json`, JSON.stringify({ map: 'XMP03T4.map', center: [37, 71, 5], cells, members }, null, 2));
console.log(JSON.stringify({ cells: cells.length, members: members.map((m: any) => [m.member, m.images.length]) }));
