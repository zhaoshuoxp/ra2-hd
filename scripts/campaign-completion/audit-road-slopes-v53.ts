import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MapFile } from '../../src/data/MapFile';
import { IniFile } from '../../src/data/IniFile';
import { TmpFile } from '../../src/data/TmpFile';
import { TheaterType } from '../../src/engine/TheaterType';
import { parseMix } from '../../src/offline/retail';
import { originalSkirmishEntries, registerOfficialSkirmish, openOfficialSkirmish } from '../../src/offline/officialSkirmish';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { requiredBytes, retailMember, retailTreeFor, resourceRoot, selectedPack, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]); mkdirSync(output, { recursive: true });
const theaterInfo: Record<number, [string, string, string]> = {
    1: ['TEMPERATE', 'temperat.ini', '.tem'], 2: ['URBAN', 'urban.ini', '.urb'], 4: ['SNOW', 'snow.ini', '.sno'],
};
const indexes = new Map<number, { names: string[]; manifest: any; directory: string }>();
const identities = new Map<string, any>();
function indexFor(type: number) {
    if (indexes.has(type)) return indexes.get(type)!;
    const [theater, name, extension] = theaterInfo[type] ?? [];
    assert(theater, 'Unexpected original RA2 theater: ' + type);
    const ini = new IniFile(retailMember('ra2', name).file), names: string[] = [];
    for (let i = 0; ; i++) {
        const section = ini.getSection('TileSet' + String(i).padStart(4, '0')); if (!section) break;
        for (let n = 1; n <= section.getNumber('TilesInSet'); n++) names.push(section.getString('FileName').toLowerCase() + String(n).padStart(2, '0') + extension);
    }
    const selected = selectedPack('terrain', theater);
    const result = { names, ...selected }; indexes.set(type, result); return result;
}
function inspect(name: string, bytes: Uint8Array, kind: string, archive: string) {
    const map = new MapFile(); IniFile.prototype.fromString.call(map, new TextDecoder().decode(bytes));
    const section = map.getSection('Map')!, [x, y, width, height] = section.getNumberArray('Size');
    map.fullSize = { x, y, width, height }; map.theaterType = section.getEnum('Theater', TheaterType, TheaterType.None, true);
    map.readTiles();
    const index = indexFor(map.theaterType), used = new Map<string, any[]>();
    for (const tile of map.tiles) {
        const member = index.names[tile.tileNum]; assert(member, `${name}: unknown tile ${tile.tileNum}`);
        if (!/^(pr|dr)slpe\d+\./.test(member)) continue;
        const cells = used.get(member) ?? []; cells.push({ tile: [tile.rx, tile.ry], z: tile.z, subTile: tile.subTile }); used.set(member, cells);
        if (!identities.has(member)) {
            const source = retailMember('ra2', member), native = new TmpFile(source.file);
            const group = index.manifest.groups.find((g: any) => g.members.some((m: any) => m.member === member));
            const authored = group?.members.find((m: any) => m.member === member);
            if (!authored) {
                identities.set(member, { member, sourceSha256: source.sha256, archive: source.source,
                    selection: path.basename(index.directory), hd: 'ORIGINAL_FALLBACK',
                    nativeMetadata: native.images.map((_, i) => nativeTerrainMetadata(native, i)) });
                continue;
            }
            assert(Object.values(authored.sourceHashes).includes(source.sha256), 'Terrain source mismatch: ' + member);
            assert.equal(JSON.stringify(authored.images), JSON.stringify(native.images.map((_, i) => nativeTerrainMetadata(native, i))));
            assert.deepEqual(group.variants.map((v: any) => v.density).sort(), [2, 4]);
            identities.set(member, { member, sourceSha256: source.sha256, archive: source.source, group: group.id,
                densityFrames: authored.images.length * 2, selection: path.basename(index.directory), nativeMetadataExact: true });
        }
    }
    return { name, kind, archive, sha256: sha256(bytes), theater: theaterInfo[map.theaterType][0],
        slopes: [...used].map(([member, cells]) => ({ member, cells })) };
}
const campaign = path.join(resourceRoot, 'campaign/ra2');
const archives = ['maps01.mix', 'maps02.mix'].map(name => ({ name, file: parseMix(requiredBytes('assets/ra2/' + name), name) }));
const rows = [];
for (const stem of readdirSync(campaign).filter(name => /^(all|sov|trn)\d\d[tsu]$/.test(name)).sort()) {
    const name = stem + '.map', bytes = readFileSync(path.join(campaign, stem, name));
    const candidates = archives.flatMap(archive => {
        try { return [{ name: archive.name, bytes: archive.file.openFile(name).getBytes() }]; } catch { return []; }
    });
    assert(candidates.length > 0 && candidates.some(candidate => sha256(candidate.bytes) === sha256(bytes)), 'Original campaign source mismatch: ' + name);
    rows.push(inspect(name, bytes, 'campaign', candidates.find(candidate => sha256(candidate.bytes) === sha256(bytes))!.name));
}
assert.equal(rows.length, 26);
const tree = retailTreeFor('ra2'), published = originalSkirmishEntries(tree, 'ra2');
await registerOfficialSkirmish(tree, 'ra2');
for (const entry of published) {
    const bytes = openOfficialSkirmish(entry.runtimeName)!.getBytes();
    assert.equal(sha256(bytes), entry.source.sha256);
    rows.push(inspect(entry.runtimeName, bytes, 'skirmish', entry.source.archive));
}
const report = { status: 'PASS_ALL_ORIGINAL_RA2_MAPS_SOURCE_NATIVE_SLOPE_IDENTITIES', maps: rows,
    identities: [...identities.values()], campaignMaps: 26, skirmishMaps: published.length,
    scope: 'Read-only source/selected-resource audit of all original RA2 campaign and catalogued skirmish maps. This establishes actual slope-family coverage, not mission completion or user visual acceptance.' };
writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, campaigns: 26, skirmish: published.length,
    affected: rows.filter(r => r.slopes.some(s => s.member.startsWith('drslpe'))).map(r => ({ name: r.name, theater: r.theater,
        members: r.slopes.filter(s => s.member.startsWith('drslpe')).map(s => s.member) })) }));
