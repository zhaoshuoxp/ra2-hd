import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MapFile } from '../../src/data/MapFile';
import { IniFile } from '../../src/data/IniFile';
import { TmpFile } from '../../src/data/TmpFile';
import { TheaterType } from '../../src/engine/TheaterType';
import { parseMix } from '../../src/offline/retail';
import { originalSkirmishEntries, registerOfficialSkirmish, openOfficialSkirmish } from '../../src/offline/officialSkirmish';
import officialCatalog from '../../src/offline/officialSkirmishCatalog.json';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { requiredBytes, retailMember, retailTreeFor, resourceRoot, selectedPack, sha256 } from '../test-support/resources';

type Edition = 'ra2' | 'yr';
const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: false });
const settings: Record<number, [string, string, string]> = {
    1: ['TEMPERATE', 'temperat', '.tem'], 2: ['URBAN', 'urban', '.urb'],
    4: ['SNOW', 'snow', '.sno'], 8: ['LUNAR', 'lunar', '.lun'],
    16: ['DESERT', 'desert', '.des'], 32: ['NEWURBAN', 'urbann', '.ubn'],
};
const indexes = new Map<string, any>(), identities = new Map<string, any>();
const originalTiles = new Map<string, any>();

function originalTile(edition: Edition, member: string) {
    const key = `${edition}/${member}`;
    if (!originalTiles.has(key)) {
        try {
            const source = retailMember(edition, member);
            originalTiles.set(key, { edition, member, available: true, sha256: source.sha256 });
        } catch (error) {
            assert(error instanceof Error && error.message.startsWith(`Required archive member missing: ${member}`));
            originalTiles.set(key, { edition, member, available: false });
        }
    }
    return originalTiles.get(key);
}
function indexFor(edition: Edition, type: number) {
    const key = `${edition}/${type}`;
    if (indexes.has(key)) return indexes.get(key)!;
    const [theater, stem, extension] = settings[type] ?? []; assert(theater);
    const original = retailMember(edition, stem + (edition === 'yr' ? 'md' : '') + '.ini');
    const ini = new IniFile(original.file), names: string[] = [];
    for (let i = 0; ; i++) {
        const section = ini.getSection('TileSet' + String(i).padStart(4, '0')); if (!section) break;
        for (let n = 1; n <= section.getNumber('TilesInSet'); n++)
            names.push(section.getString('FileName').toLowerCase() + String(n).padStart(2, '0') + extension);
    }
    const selected = selectedPack('terrain', theater);
    const pointer = JSON.parse(requiredBytes(`terrain${type === 1 ? '' : '-' + theater.toLowerCase()}-selection.json`).toString());
    const result = { names, ...selected, theater, pointer, sourceIni: { member: original.file.filename, sha256: original.sha256 } };
    indexes.set(key, result); return result;
}
function inspect(edition: Edition, name: string, bytes: Uint8Array, kind: string, archive: string) {
    const map = new MapFile(); IniFile.prototype.fromString.call(map, new TextDecoder().decode(bytes));
    const section = map.getSection('Map')!, [x, y, width, height] = section.getNumberArray('Size');
    map.fullSize = { x, y, width, height }; map.theaterType = section.getEnum('Theater', TheaterType, TheaterType.None, true);
    map.readTiles();
    const index = indexFor(edition, map.theaterType), used = new Map<string, any[]>();
    const absent = new Map<string, any[]>();
    for (const tile of map.tiles) {
        const member = index.names[tile.tileNum]; assert(member, `${edition}/${name}: unknown tile ${tile.tileNum}`);
        if (!originalTile(edition, member).available) {
            const cells = absent.get(member) ?? [];
            cells.push({ tile: [tile.rx, tile.ry], z: tile.z, tileNum: tile.tileNum, subTile: tile.subTile });
            absent.set(member, cells);
        }
        if (!/^(?:(?:pr|dr)slpe|slpex|slope|rampx)\d+[a-z]?\./.test(member)) continue;
        const cells = used.get(member) ?? [];
        cells.push({ tile: [tile.rx, tile.ry], z: tile.z, subTile: tile.subTile }); used.set(member, cells);
        const key = `${edition}/${member}`;
        if (!identities.has(key)) {
            const source = retailMember(edition, member), native = new TmpFile(source.file);
            const group = index.manifest.groups.find((g: any) => g.members.some((m: any) => m.member === member));
            // A group needs complete edition-specific pins to publish at runtime.
            const authored = index.manifest.editions.includes(edition)
                && group?.members.every((m: any) => m.sourceHashes[edition])
                ? group.members.find((m: any) => m.member === member) : undefined;
            const metadata = native.images.map((_, i) => nativeTerrainMetadata(native, i));
            if (authored) {
                assert.equal(authored.sourceHashes[edition], source.sha256, `Selected source mismatch: ${key}`);
                assert.equal(JSON.stringify(authored.images), JSON.stringify(metadata), `Selected native geometry mismatch: ${key}`);
                assert.deepEqual(group.variants.map((v: any) => v.density).sort(), [2, 4]);
            }
            identities.set(key, { edition, member, sourceSha256: source.sha256, archive: source.source,
                selection: index.pointer, group: group?.id, hd: authored ? 'SOURCE_AND_METADATA_EXACT' : 'ORIGINAL_FALLBACK',
                roadSlope: /^(?:pr|dr)slpe/.test(member), nativeMetadata: metadata, maps: [] });
        }
        const identity = identities.get(key);
        assert(identity.nativeMetadata[tile.subTile], `Source subtile absent: ${edition}/${name}/${member}:${tile.subTile}`);
        const mapId = `${kind}/${name}`; if (!identity.maps.includes(mapId)) identity.maps.push(mapId);
    }
    return { edition, name, kind, archive, sha256: sha256(bytes), theater: index.theater,
        sourceIni: index.sourceIni, slopes: [...used].map(([member, cells]) => ({ member, cells })),
        absentOriginalTiles: [...absent].map(([member, cells]) => ({ member, cells })) };
}

const rows = [];
const yrInventory = JSON.parse(fs.readFileSync('../project-history/yr-campaign-implementation-20261104/source-inventory.json', 'utf8'));
const yrBytes = fs.readFileSync(yrInventory.archive.file);
assert.equal(sha256(yrBytes), yrInventory.archive.sha256);
const archives = {
    ra2: ['maps01.mix', 'maps02.mix'].map(name => ({ name, file: parseMix(requiredBytes('assets/ra2/' + name), name) })),
    yr: [{ name: 'mapsmd03.mix', file: parseMix(yrBytes, 'mapsmd03.mix') }],
};
for (const edition of ['ra2', 'yr'] as const) {
    const campaign = path.join(resourceRoot, 'campaign', edition);
    for (const stem of fs.readdirSync(campaign).filter(name => /^(all|sov|trn)\d\d[tsudl](?:md)?$/.test(name)).sort()) {
        const name = stem + '.map', bytes = fs.readFileSync(path.join(campaign, stem, name));
        const candidates = archives[edition].flatMap(archive => {
            try { return [{ name: archive.name, bytes: archive.file.openFile(name).getBytes() }]; } catch { return []; }
        });
        const original = candidates.find(candidate => sha256(candidate.bytes) === sha256(bytes));
        assert(original, `Original campaign source mismatch: ${edition}/${name}`);
        rows.push(inspect(edition, name, bytes, 'campaign', original.name));
    }
    const tree = retailTreeFor(edition), published = originalSkirmishEntries(tree, edition);
    await registerOfficialSkirmish(tree, edition);
    for (const entry of officialCatalog.maps.filter(entry => entry.edition === edition)) {
        const bytes = openOfficialSkirmish(entry.runtimeName)!.getBytes();
        assert.equal(sha256(bytes), entry.source.sha256);
        rows.push({ ...inspect(edition, entry.runtimeName, bytes, 'skirmish', entry.source.archive),
            publiclyListed: published.some(candidate => candidate.runtimeName === entry.runtimeName),
            catalogMapId: entry.mapId });
    }
}
assert.equal(rows.filter(row => row.kind === 'campaign').length, 40);
const roadIdentities = [...identities.values()].filter(row => row.roadSlope);
const affected = rows.filter(row => row.slopes.some(slope => /^(pr|dr)slpe/.test(slope.member)));
const report = { schema: 'all-original-map-road-slope-source-audit-v2',
    status: 'PASS_ALL_ORIGINAL_CAMPAIGN_AND_ARCHIVED_SKIRMISH_MAP_SOURCE_SLOPE_IDENTITIES',
    maps: rows, identities: [...identities.values()], originalTileSources: [...originalTiles.values()],
    sourceBoundaries: rows.filter(row => row.absentOriginalTiles.length).map(row => ({
        edition: row.edition, name: row.name, kind: row.kind, sha256: row.sha256,
        publiclyListed: 'publiclyListed' in row ? row.publiclyListed : true,
        absentOriginalTiles: row.absentOriginalTiles })),
    affectedRoadMaps: affected.map(row => ({ edition: row.edition,
        kind: row.kind, name: row.name, theater: row.theater,
        members: row.slopes.filter(slope => /^(pr|dr)slpe/.test(slope.member)).map(slope => slope.member) })),
    sourceMapsChanged: 0, selectorsChanged: 0, visualQualification: 'PENDING_SOURCE_MATCHED_NATIVE_CONTACT_INSPECTION',
    scope: 'Every original RA2/YR campaign source and every catalogued archive-native skirmish map, including PKT-published standard maps and archive-only maps, is audited. All referenced original terrain member files are checked for availability. Absent retail tiles remain explicit source boundaries. Slope source identities, placed subtile ordinals and selected native geometry are checked; visible road contacts require independent export and native inspection.' };
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, maps: rows.length, campaign: 40,
    skirmish: rows.filter(row => row.kind === 'skirmish').length, affectedRoadMaps: affected.length,
    roadIdentities: roadIdentities.length, theaters: [...new Set(rows.map(row => row.theater))],
    sourceBoundaries: report.sourceBoundaries.map(row => ({ edition: row.edition, name: row.name,
        publiclyListed: row.publiclyListed, missing: row.absentOriginalTiles.map(tile => tile.member) })),
    missingRoadFamilies: roadIdentities.filter(row => row.hd === 'ORIGINAL_FALLBACK').map(row => `${row.edition}/${row.member}`), output }));
