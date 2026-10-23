import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { TmpFile } from '../../src/data/TmpFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Rules } from '../../src/game/rules/Rules';
import { Art } from '../../src/game/art/Art';
import { TileSets } from '../../src/game/theater/TileSets';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { OreOverlayTypes } from '../../src/game/map/OreOverlayTypes';
import { BridgeOverlayTypes } from '../../src/game/map/BridgeOverlayTypes';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { BuildingAnimArtProps } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { AnimProps } from '../../src/engine/AnimProps';

const root = process.argv[2] ?? '.artifacts/m2-2/source-v1';
mkdirSync(root, { recursive: false });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const save = (name: string, value: unknown) => writeFileSync(`${root}/${name}`, JSON.stringify(value, null, 2) + '\n');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const pointer = JSON.parse(readFileSync('.local/terrain-selection.json', 'utf8'));
const accepted = JSON.parse(readFileSync(`.local/terrain-packs/${pointer.revision}/manifest.json`, 'utf8'));
const acceptedTmp = new Map(accepted.groups.flatMap((group: any) => group.members.map((member: any) =>
    [member.member.toLowerCase(), { group: group.id, sourceHashes: member.sourceHashes }])));
const catalogs = ['allied', 'soviet', 'yuri'].flatMap(name => Object.values(
    JSON.parse(readFileSync(`desktop/${name}-building-coverage.json`, 'utf8'))) as any[]);
const reusedBuildings = new Set(['GAPOWR', 'NAPOWR', ...catalogs.map(c => c.family)]);
const maps: any[] = [], rows = new Map<string, any>();
const issues: any[] = [];

for (const edition of ['yr', 'ra2'] as const) {
    const tree = editionRetailTree(top, edition);
    const resolved = new Map<string, any>();
    const get = (name: string) => {
        const key = name.toLowerCase();
        if (!resolved.has(key)) {
            try {
                const member = resolveMember(tree, key), bytes = Uint8Array.from(member.file.getBytes());
                resolved.set(key, { member: key, archive: member.source, sha256: sha(bytes), bytes: bytes.byteLength });
            } catch { resolved.set(key, undefined); }
        }
        return resolved.get(key);
    };
    const rawIni = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    let rules = new Rules(adaptRetailRules(rawIni).rules);
    const artIni = new IniFile(resolveMember(tree, edition === 'yr' ? 'artmd.ini' : 'art.ini').file);
    let art = new Art(rules, artIni, undefined, undefined);
    const finder = new ImageFinder({ has: (name: string) => !!get(name) } as any,
        { settings: { extension: '.tem', newTheaterChar: 'T' } });
    const sets = new TileSets(new IniFile(resolveMember(tree, edition === 'yr' ? 'temperatmd.ini' : 'temperat.ini').file));
    sets.loadTileData({ get(name: string) {
        if (!get(name)) return undefined;
        return new TmpFile(resolveMember(tree, name).file);
    } }, '.tem');
    const observe = (row: any, map: string, count: number, values?: number[]) => {
        const key = `${edition}:${row.kind}:${row.id}`;
        const existing = rows.get(key) ?? { edition, theater: 'TEMPERATE', ...row, usage: {} };
        existing.usage[map] = { count, values: values && [...new Set(values)].sort((a, b) => a - b) };
        rows.set(key, existing);
    };
    const describeShp = (name: string) => {
        const identity = get(name);
        if (!identity) return { member: name, status: 'NATIVE_MEMBER_NOT_FOUND' };
        const file = new ShpFile(resolveMember(tree, name).file);
        return { ...identity, canvas: [file.width, file.height], frames: file.images.map((frame, slot) => ({
            slot, origin: [frame.x, frame.y], size: [frame.width, frame.height],
            empty: frame.imageData.every(index => index === 0), indexSha256: sha(frame.imageData),
        })) };
    };
    const describeObject = (id: string, type: ObjectType) => {
        const native: any = type === ObjectType.Animation ? art.getAnimation(id) : art.getObject(id, type);
        const rule: any = type === ObjectType.Animation ? native.rules : rules.getObject(id, type);
        const member = finder.getFilename(native.imageName, native.useTheaterExtension);
        const source = native.isVoxel ? get(native.imageName.toLowerCase() + '.vxl') : describeShp(member);
        const dependencies: any[] = [];
        if (type === ObjectType.Building) {
            const animations = new BuildingAnimArtProps();
            animations.read(native.art, art);
            for (const [animationType, entries] of animations.getAll()) {
                for (const animation of entries) {
                    const filename = finder.getFilename(animation.image, native.useTheaterExtension);
                    const source = describeShp(filename);
                    dependencies.push({ role: AnimationType[animationType], animation: animation.name, source,
                        paletteType: native.paletteType, customPalette: native.customPaletteName,
                        palettePolicy: 'Building.createAnimObject uses the parent building palette',
                        hasShadow: get(filename) && new AnimProps(animation.art,
                            new ShpFile(resolveMember(tree, filename).file)).shadow,
                        remapable: native.remapable, drawOffset: native.getDrawOffset(), extraOffset: animation.offset,
                        nativeArt: Object.fromEntries(animation.art.entries),
                        damagedNativeArt: animation.damagedArt && Object.fromEntries(animation.damagedArt.entries) });
                }
            }
            if (native.bibShape) dependencies.push({ role: 'BIB',
                source: describeShp(finder.getFilename(native.bibShape, native.useTheaterExtension)),
                paletteType: native.paletteType, customPalette: native.customPaletteName,
                hasShadow: native.hasShadow, remapable: native.remapable, drawOffset: native.getDrawOffset() });
        }
        const states = type === ObjectType.Terrain ? ['standing', 'native-shadow', 'occlusion',
            ...(rule.immune ? [] : ['damage', 'native-removal']), ...(rule.spawnsTiberium ? ['ore-spawn-animation', 'ore-regrowth'] : [])]
            : type === ObjectType.Building ? ['normal', 'damaged', 'native-destruction', 'native-shadow',
                ...(rule.canBeOccupied ? ['occupied', 'evacuation'] : []), ...(rule.capturable ? ['capture', 'owner-change'] : [])]
            : ['native-actions', 'owner-palette', 'damage', 'native-destruction', 'native-shadow'];
        return { kind: ObjectType[type].toLowerCase(), id, rulesImage: rule.imageName, artImage: native.imageName,
            source, dependencies, nativeArt: Object.fromEntries(native.art.entries),
            nativeRules: Object.fromEntries(rule.ini?.entries ?? rawIni.getSection(id)?.entries ?? []), states,
            paletteType: native.paletteType, customPalette: native.customPaletteName,
            hasShadow: native.hasShadow, remapable: native.remapable, drawOffset: native.getDrawOffset(),
            lightingType: native.lightingType,
            decision: type === ObjectType.Building && reusedBuildings.has(id) ? 'ACCEPTED_HD_REUSED' : 'MISSING_HD_TO_PRODUCE',
            runtimeEvidence: 'PENDING_SELECTED_NATIVE_BINDING_AND_STATE_CHECKS',
        };
    };
    for (const mapName of edition === 'yr' ? ['XMP03T4.map', 'XMP19T4.map'] : ['MP03T4.map']) {
        const identity = get(mapName);
        if (!identity) throw Error(`Missing retail map ${edition}:${mapName}`);
        const map = new MapFile(resolveMember(tree, mapName).file);
        rules = new Rules(adaptRetailRules(rawIni).rules.mergeWith(map));
        art = new Art(rules, artIni.clone().mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
        writeFileSync(`${root}/${edition}-${mapName}`, resolveMember(tree, mapName).file.getBytes());
        const mapRecord: any = { edition, ...identity, fullSize: map.fullSize, localSize: map.localSize,
            starts: map.startingLocations, tiles: map.tiles.length, lighting: map.lighting,
            counts: { terrain: map.terrains.length, structures: map.structures.length, vehicles: map.vehicles.length,
                infantry: map.infantries.length, aircraft: map.aircrafts.length, overlays: map.overlays.length, smudges: map.smudges.length },
            semanticHashes: Object.fromEntries(['tiles', 'terrains', 'structures', 'vehicles', 'infantries',
                'aircrafts', 'overlays', 'smudges', 'waypoints'].map(key =>
                [key, sha(Buffer.from(JSON.stringify((map as any)[key])))])),
            ruleOverrides: Object.fromEntries([...map.sections].filter(([name]) => rawIni.sections.has(name))
                .map(([name, section]) => [name, Object.fromEntries(section.entries)])),
        };
        save(`${edition}-${mapName}-objects.json`, { overlays: map.overlays, structures: map.structures,
            vehicles: map.vehicles, infantries: map.infantries, terrains: map.terrains, waypoints: map.waypoints });
        maps.push(mapRecord);
        const tileUse = new Map<number, any[]>();
        for (const tile of map.tiles) {
            const list = tileUse.get(tile.tileNum) ?? []; list.push(tile); tileUse.set(tile.tileNum, list);
        }
        for (const [tileNum, tiles] of tileUse) {
            const entry = sets.getTile(tileNum);
            if (!entry) { issues.push({ edition, map: mapName, tileNum, issue: 'NATIVE_TILE_ENTRY_MISSING' }); continue; }
            for (const file of entry.files) {
                const id = file.filename!.toLowerCase(), identity = get(id), reuse: any = acceptedTmp.get(id);
                observe({ kind: 'tmp', id, set: sets.getSetNum(tileNum), setName: entry.owner.setName, source: identity,
                    images: file.images.map((_, slot) => ({ slot, ...nativeTerrainMetadata(file, slot) })),
                    decision: reuse?.sourceHashes[edition] === identity.sha256 ? 'ACCEPTED_HD_REUSED' : 'MISSING_HD_TO_PRODUCE',
                    acceptedGroup: reuse?.group, states: ['native-subtiles', 'random-variants', 'lighting', 'depth-occlusion'],
                    runtimeEvidence: reuse ? 'ACCEPTED_M2_1_CLOSURE_REUSED' : 'PENDING' }, mapName, tiles.length, tiles.map(t => t.subTile));
            }
            const animation = entry.getAnimation();
            if (animation) {
                try {
                    const row = describeObject(animation.name, ObjectType.Animation);
                    row.states = ['native-phase-order', 'loop-boundary', 'stationary-contact', 'native-lighting'];
                    observe(row, mapName, tiles.filter(t => t.subTile === animation.subTile).length);
                } catch (error) { issues.push({ edition, map: mapName, animation, issue: String(error) }); }
            }
        }
        for (const objects of [map.terrains, map.structures, map.vehicles, map.infantries, map.aircrafts, map.smudges]) {
            const counted = new Map<string, { object: any; count: number }>();
            for (const object of objects) {
                const row = counted.get(object.name) ?? { object, count: 0 }; row.count++; counted.set(object.name, row);
            }
            for (const { object, count } of counted.values()) observe(describeObject(object.name, object.type), mapName, count);
        }
        const overlays = new Map<number, number[]>();
        for (const overlay of map.overlays) {
            const values = overlays.get(overlay.id) ?? []; values.push(overlay.value); overlays.set(overlay.id, values);
        }
        const closure = new Set(overlays.keys());
        for (const id of [...closure]) {
            // Native harvesting/growth and bridge damage/repair change family IDs and frames.
            if (OreOverlayTypes.isRiparius(id)) for (let i = 102; i <= 127; i++) closure.add(i);
            if (OreOverlayTypes.isCruentus(id)) for (let i = 27; i <= 38; i++) closure.add(i);
            if (BridgeOverlayTypes.isLowBridge(id)) {
                const start = id >= 205 ? 205 : 74;
                for (let i = start; i <= start + 25; i++) closure.add(i);
            }
        }
        for (const id of closure) {
            if (!rules.hasOverlayId(id)) continue;
            const name = rules.getOverlayName(id);
            if (!rules.hasObject(name, ObjectType.Overlay)) {
                observe({ kind: 'overlay-registry-slot', id: name, overlayId: id,
                    decision: 'INTENTIONAL_NATIVE_EXCEPTION', dependencyOnly: !overlays.has(id),
                    states: ['No native rules/art object; not a renderable family member'],
                    runtimeEvidence: 'NATIVE_UNREGISTERED_RANGE_ENDPOINT_REQUIRES_NO_AUTHORED_PIXELS' }, mapName,
                    overlays.get(id)?.length ?? 0);
                continue;
            }
            const row = describeObject(name, ObjectType.Overlay);
            const values = overlays.get(id) ?? [];
            Object.assign(row, { overlayId: id, dependencyOnly: !values.length,
                states: OreOverlayTypes.getOverlayTibType(id) ? ['amount-frames', 'native-harvesting', 'depletion', 'native-growth']
                    : BridgeOverlayTypes.isBridge(id) ? ['height', 'passage', 'damage', 'destruction', 'repair']
                    : ['native-value-frame', 'native-shadow', 'applicable-damage-removal'] });
            observe(row, mapName, values.length, values);
        }
    }
    save(`${edition}-source-identities.json`, [...resolved.values()].filter(Boolean));
}
const allRows = [...rows.values()];
for (const row of allRows.filter(row => row.edition === 'yr' && !row.usage['XMP03T4.map'])) {
    row.controlDecision = row.decision;
    row.decision = 'NOT_USED_BY_PRIMARY_MAP';
}
const primaryRows = allRows.filter(row => row.edition === 'yr' && row.usage['XMP03T4.map']);
const counts = Object.fromEntries(['ACCEPTED_HD_REUSED', 'MISSING_HD_TO_PRODUCE', 'EXISTING_HD_NOT_BINDING',
    'INTENTIONAL_NATIVE_EXCEPTION', 'NOT_USED_BY_PRIMARY_MAP'].map(decision => [decision,
    (decision === 'NOT_USED_BY_PRIMARY_MAP' ? allRows.filter(row => row.edition === 'yr') : primaryRows)
        .filter(row => row.decision === decision).length]));
const mainMap = maps.find(map => map.edition === 'yr' && map.member === 'xmp03t4.map');
const counterpart = maps.find(map => map.edition === 'ra2');
const ledger = { schema: 'm2-2-map-coverage-state-v1', baseline: '7533e13', status: 'INVENTORIED_PRODUCTION_AND_RUNTIME_PENDING',
    primary: mainMap, counterpart, maps, mapIdentity: { byteIdentical: mainMap.sha256 === counterpart.sha256,
        semanticEquality: Object.fromEntries(Object.keys(mainMap.semanticHashes).map(key =>
            [key, mainMap.semanticHashes[key] === counterpart.semanticHashes[key]])),
        boundary: 'Exact retail maps are independently parsed. Matching bytes do not equate edition rules or art resolution.' },
    acceptedTerrain: pointer, counts, issues, rows: allRows,
    exclusions: ['Absent categories are not production scope', 'Control-only rows remain NOT_USED_BY_PRIMARY_MAP',
        'No map, movement, production, AI, geometry, display-scale or budget changes'],
    normalPlayFactionPolicy: 'Reuse accepted M1 catalogs. Resolve any observed Original through source/edition/readiness/budget before authoring.',
    acceptance: 'No new art direction, runtime family or whole-map completion is accepted by inventory.' };
save('ledger.json', ledger);
// The current ledger advances; fresh source roots preserve every earlier snapshot.
writeFileSync('docs/m2-2-map-coverage.json', JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify({ maps: maps.map(map => ({ edition: map.edition, member: map.member, sha256: map.sha256, counts: map.counts })),
    counts, issues, missingByKind: Object.fromEntries([...new Set(primaryRows.map(row => row.kind))].map(kind =>
        [kind, primaryRows.filter(row => row.kind === kind && row.decision === 'MISSING_HD_TO_PRODUCE').length])) }));
