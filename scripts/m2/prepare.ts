import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { MapFile } from '../../src/data/MapFile';
import { TileSets } from '../../src/game/theater/TileSets';
import { IniFile } from '../../src/data/IniFile';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const inventory = JSON.parse(readFileSync('.artifacts/m2-1/inventory/inventory.json', 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sets = inventory.editions.yr.sets;
const preview = [
    { id: 'ground', sets: [0, 41, 42] },
    { id: 'road-representative', sets: [20, 36, 40, 47], names: /^(proad(01[a-c]?|02[a-c]?|03|04|05|06|07|08|09)|p_end0[1-4]|prslpe0[1-4]|proadc0[1-4])\.tem$/i },
    { id: 'elevation-representative', sets: [9, 10, 25, 43], names: /^(cliff0[1-4]|slope0[1-4][a-c]?|rmpfx0[1-4][a-c]?|ramp01)\.tem$/i },
];
const groups = preview.map(group => ({ id: group.id, scope: 'REPRESENTATIVE_ONLY', members: sets
    .filter((set: any) => group.sets.includes(set.index))
    .flatMap((set: any) => set.members.filter((member: any) => !group.names || group.names.test(member.member))
        .map((member: any) => {
            const resolved = resolveMember(trees.yr, member.member), file = new TmpFile(resolved.file);
            const sourceHashes = Object.fromEntries(Object.entries(trees).map(([edition, tree]) =>
                [edition, hash(resolveMember(tree, member.member).file.getBytes())]));
            return { member: file.filename, archive: resolved.source, sourceHashes, setIndex: set.index,
                images: file.images.map((_, index) => nativeTerrainMetadata(file, index)), nativeName: member.member };
        })) }));
mkdirSync('.artifacts/m2-1/authoring-v1', { recursive: true });
writeFileSync('.artifacts/m2-1/authoring-v1/export-input.json', JSON.stringify({ groups }, null, 2));
const fullScope = preview.map(group => ({ id: group.id.replace('-representative', ''), sets: group.sets,
    status: 'AWAITING_ART_DIRECTION_APPROVAL', members: sets.filter((set: any) => group.sets.includes(set.index))
        .flatMap((set: any) => set.members.map((m: any) => ({ member: m.member.toLowerCase(), sha256: m.sha256,
            subtiles: m.images.length, archive: m.archive }))) }));
const primary = inventory.editions.yr.maps.find((m: any) => m.member === 'XMP03T4.map');
const secondary = inventory.editions.yr.maps.find((m: any) => m.member === 'XMP19T4.map');
writeFileSync('docs/m2-1-temperate-coverage.json', JSON.stringify({ schema: 'm2-1-coverage-v1',
    primaryMap: primary, secondaryMap: secondary, groups: fullScope,
    representative: groups.map(group => ({ id: group.id, members: group.members.length,
        subtiles: group.members.reduce((n: number, member: any) => n + member.images.length, 0) })),
    originalControls: ['Water animation', 'Shoreline', 'Bridges', 'Trees', 'Ore/gems', 'Civilian buildings',
        'Props', 'Pavement LAT', 'Thick/rough grass', 'Cliff/water boundaries'],
    deferred: ['Other temperate families', 'Snow', 'Urban', 'New Urban', 'Desert', 'Lunar', 'Campaigns', 'Cinematics'],
    exceptions: [],
}, null, 2) + '\n');
const map = new MapFile(resolveMember(trees.yr, 'XMP03T4.map').file);
const tileSets = new TileSets(new IniFile(resolveMember(trees.yr, 'temperatmd.ini').file));
tileSets.loadTileData({ get(name: string) { try { return new TmpFile(resolveMember(trees.yr, name).file); } catch { return undefined; } } }, '.tem');
const neighborhood = map.tiles.filter(tile => Math.hypot(tile.rx - 75, tile.ry - 29) < 18);
console.log(JSON.stringify({ groups: groups.map(g => ({ id: g.id, members: g.members.length,
    images: g.members.reduce((n: number, member: any) => n + member.images.length, 0) })),
    neighborhood: [...new Set(neighborhood.flatMap(tile => tileSets.getTile(tile.tileNum)?.files.map(file => file.filename) ?? []))] }));
