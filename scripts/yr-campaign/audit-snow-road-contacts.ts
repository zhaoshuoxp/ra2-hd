import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { TmpFile } from '../../src/data/TmpFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, resourceRoot, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]);
assert(process.argv[2], 'Provide a new contact-audit output directory');
fs.mkdirSync(output, { recursive: false });
const accepted = { schemaVersion: 1, revision: 'yr-snow-water-cliffs-r3',
    sha256: 'ff193253b7bd1362d0577c31275c5d7f744caa5d20b1998f3b00c8c90e29c453' };
const candidate = JSON.parse(fs.readFileSync('docs/campaign-art/yr-v1/terrain-snow-roads-registration-r7.json', 'utf8')).selectedPack;
function pack(pointer: typeof accepted) {
    const root = path.join(resourceRoot, 'terrain-packs', pointer.revision);
    const bytes = fs.readFileSync(path.join(root, 'manifest.json'));
    assert.equal(sha256(bytes), pointer.sha256);
    const manifest = JSON.parse(bytes.toString());
    assert.equal(manifest.theater, 'SNOW');
    const entries = new Map<string, any>();
    for (const group of manifest.groups) {
        let offset = 0;
        for (const member of group.members) {
            entries.set(member.member, { group, member, offset, pointer });
            offset += member.images.length;
        }
    }
    return entries;
}
const acceptedEntries = pack(accepted), candidateEntries = pack(candidate);
const wanted = new Set(['droads30.sno', 'droadj05.sno', 'droadc01.sno']);
const iniSource = retailMember('yr', 'snowmd.ini');
const ini = new IniFile(iniSource.file), names: string[] = [];
for (let set = 0; ; set++) {
    const section = ini.getSection('TileSet' + String(set).padStart(4, '0'));
    if (!section) break;
    for (let number = 1; number <= section.getNumber('TilesInSet'); number++)
        names.push(section.getString('FileName').toLowerCase() + String(number).padStart(2, '0') + '.sno');
}
const originals = new Map<string, any>();
function original(name: string) {
    if (!originals.has(name)) {
        const file = retailMember('yr', name), native = new TmpFile(file.file);
        originals.set(name, { sha256: file.sha256, archive: file.source,
            images: native.images.map((_, slot) => nativeTerrainMetadata(native, slot)) });
    }
    return originals.get(name);
}
function describe(tile: any) {
    const name = names[tile.tileNum];
    assert(name);
    const source = original(name), metadata = source.images[tile.subTile];
    assert(metadata);
    const selected = acceptedEntries.get(name) ?? candidateEntries.get(name);
    if (selected) {
        assert.equal(selected.member.sourceHashes.yr, source.sha256);
        // Manifest JSON normalizes signed zero in native offsets.
        assert.equal(JSON.stringify(selected.member.images[tile.subTile]), JSON.stringify(metadata));
    }
    return { tile: [tile.rx, tile.ry], z: tile.z, tileNum: tile.tileNum, subTile: tile.subTile,
        member: name, sourceSha256: source.sha256, native: metadata,
        roadMaterial: /^(?:[dp]road[scj]?|[dp]rslpe|rampx)\d+\.sno$/.test(name),
        acceptedRoad: /^(?:[dp]road[scj]?|[dp]rslpe|rampx)\d+\.sno$/.test(name) && acceptedEntries.has(name),
        artwork: selected ? { pack: selected.pointer, group: selected.group.id,
            candidate: !acceptedEntries.has(name), variants: selected.group.variants.map((variant: any) => ({
                density: variant.density, file: variant.file, sha256: variant.sha256,
                size: variant.size, rect: variant.rects[selected.offset + tile.subTile],
            })) } : null,
        localBitmapPosition: [30 * (tile.rx - tile.ry) + metadata.offset[0],
            15 * (tile.rx + tile.ry - tile.z - metadata.height) + metadata.offset[1]],
    };
}
const maps = [];
for (const [mission, expected] of [
    ['sov02smd.map', '139a7f17a17cefc20d12c21e9221d94ff6e1e8894ac09ab716fc9f6975d5a665'],
    ['all07smd.map', '0ec687c320382e4c02cf66eec0153b713e56c4449fab7d29b5a19b61bf10e4f3'],
]) {
    const bytes = fs.readFileSync(path.join(resourceRoot, 'campaign/yr', mission.slice(0, -4), mission));
    assert.equal(sha256(bytes), expected);
    const map = new MapFile();
    IniFile.prototype.fromString.call(map, bytes.toString());
    const [x, y, width, height] = map.getSection('Map')!.getNumberArray('Size');
    map.fullSize = { x, y, width, height }; map.readTiles();
    const tiles = new Map(map.tiles.map(tile => [`${tile.rx},${tile.ry}`, tile]));
    const instances = new Map<string, any>();
    for (const tile of map.tiles) {
        const name = names[tile.tileNum]; if (!wanted.has(name)) continue;
        const metadata = original(name).images[tile.subTile];
        const column = tile.subTile % metadata.grid[0], row = Math.floor(tile.subTile / metadata.grid[0]);
        const anchor = [tile.rx - column, tile.ry - row];
        const key = `${name}/${anchor}/${tile.z}`;
        if (!instances.has(key)) instances.set(key, { member: name, anchor, z: tile.z, cells: [] });
        instances.get(key).cells.push(describe(tile));
    }
    for (const instance of instances.values()) {
        const own = new Set(instance.cells.map((cell: any) => cell.tile.join(',')));
        const nearby = new Map<string, any>();
        for (const cell of instance.cells) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const key = `${cell.tile[0] + dx},${cell.tile[1] + dy}`;
            const tile = tiles.get(key);
            if (tile && !own.has(key)) nearby.set(key, { ...describe(tile),
                sharedEdge: instance.cells.some((source: any) =>
                    Math.abs(source.tile[0] - tile.rx) + Math.abs(source.tile[1] - tile.ry) === 1) });
        }
        instance.adjacentCells = [...nearby.values()];
        instance.roadContacts = instance.adjacentCells.filter((cell: any) => cell.roadMaterial && cell.sharedEdge);
        instance.acceptedFlatRoadContacts = instance.adjacentCells.filter((cell: any) =>
            cell.acceptedRoad && cell.sharedEdge && cell.z === instance.z
            && cell.native.rampType === 0 && !cell.native.hasExtraData);
        assert(instance.roadContacts.length, 'Every new road needs an actual original shared road edge');
    }
    maps.push({ mission, sourceSha256: expected, instances: [...instances.values()] });
}
assert.deepEqual(maps.map(row => row.instances.length), [4, 2]);
const report = { schema: 'yr-source-snow-road-adjacent-material-audit-v1',
    status: 'PASS_ORIGINAL_MAP_ADJACENCY_AND_EXACT_ACCEPTED_DENSITY_TEXTURE_IDENTITIES',
    theaterIni: { member: 'snowmd.ini', sha256: iniSource.sha256 }, accepted, candidate,
    selected: JSON.parse(fs.readFileSync(path.join(resourceRoot, 'terrain-snow-selection.json'), 'utf8')),
    maps, sourceMapsChanged: 0, selectorsChanged: 0, texturePixelsModified: 0,
    qualification: 'Original placement and exact accepted road texture references only. Flat road tile identities are unambiguous. No contact reconstruction, new artwork credit or visual acceptance is claimed.',
};
assert.deepEqual(report.selected, accepted);
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, maps: maps.length,
    instances: maps.map(row => ({ mission: row.mission, roads: row.instances.map(instance => ({
        member: instance.member, anchor: instance.anchor, z: instance.z,
        contacts: instance.roadContacts.map((cell: any) => ({ member: cell.member, tile: cell.tile,
            subTile: cell.subTile, candidate: cell.artwork?.candidate ?? false })),
    })) })), output }));
