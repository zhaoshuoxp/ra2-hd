import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { ShpFile } from '../../src/data/ShpFile';
import { TmpFile } from '../../src/data/TmpFile';
import { Rules } from '../../src/game/rules/Rules';
import { Art } from '../../src/game/art/Art';
import { TileSets } from '../../src/game/theater/TileSets';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { activeEdition } from '../../src/editions/activeEdition';
import { BuildingAnimArtProps } from '../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';
import { AnimProps } from '../../src/engine/AnimProps';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { campaignUnitHdDemand } from '../../src/engine/renderable/builder/environmentMapDemand';
import { sovietUnitHdFamilies } from '../../src/engine/renderable/builder/sovietUnitHdFamilies';
import { parseMix } from '../../src/offline/retail';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { retailIni, retailMember, sha256 } from '../test-support/resources';
import { originalAnimationAbsence, originalAnimationAbsences } from './original-animation-absence';

assert.equal(activeEdition, 'yr', 'Use RA2_TEST_EDITION=yr and the browser test preload');
assert.equal(sha256(fs.readFileSync(originalAnimationAbsences.renderer.file)), originalAnimationAbsences.renderer.sha256,
    'Requalify the source absence disposition when the existing missing-image renderer changes');
const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const inventory = read('../project-history/yr-campaign-implementation-20261104/source-inventory.json');
const archive = fs.readFileSync(inventory.archive.file);
assert.equal(sha256(archive), inventory.archive.sha256);
const maps = parseMix(archive, 'mapsmd03.mix');
const settings: Record<string, any> = {
    TEMPERATE: { type: 1, extension: '.tem', newTheaterChar: 'T', ini: 'temperatmd.ini', iso: 'isotem', unit: 'unittem', overlay: 'temperat', lib: 'libtem' },
    URBAN: { type: 2, extension: '.urb', newTheaterChar: 'U', ini: 'urbanmd.ini', iso: 'isourb', unit: 'uniturb', overlay: 'urban', lib: 'liburb' },
    SNOW: { type: 4, extension: '.sno', newTheaterChar: 'A', ini: 'snowmd.ini', iso: 'isosno', unit: 'unitsno', overlay: 'snow', lib: 'libsno' },
    LUNAR: { type: 8, extension: '.lun', newTheaterChar: 'L', ini: 'lunarmd.ini', iso: 'isolun', unit: 'unitlun', overlay: 'lunar', lib: 'liblun' },
    DESERT: { type: 16, extension: '.des', newTheaterChar: 'D', ini: 'desertmd.ini', iso: 'isodes', unit: 'unitdes', overlay: 'desert', lib: 'libdes' },
    NEWURBAN: { type: 32, extension: '.ubn', newTheaterChar: 'N', ini: 'urbannmd.ini', iso: 'isoubn', unit: 'unitubn', overlay: 'urbann', lib: 'libubn' },
};
const sources = new Map<string, any>(), shps = new Map<string, any>();
const get = (name: string) => {
    name = name.toLowerCase();
    if (!sources.has(name)) {
        try {
            const item = retailMember('yr', name);
            sources.set(name, { member: name, archive: item.source, sha256: item.sha256, bytes: item.file.getSize() });
        } catch { sources.set(name, undefined); }
    }
    return sources.get(name);
};
const shp = (name: string) => {
    if (!shps.has(name)) {
        const source = get(name), image = source && new ShpFile(retailMember('yr', name, source.sha256).file);
        shps.set(name, image ? { ...source, canvas: [image.width, image.height], totalFrames: image.numImages,
            empty: image.images.every(frame => !frame.imageData.some(Boolean)) } : { member: name, status: 'ORIGINAL_MEMBER_ABSENT' });
    }
    return shps.get(name);
};
const contracts = new Map<string, any>(), selected = new Map<string, any>(), terrain = new Map<string, any>();
for (const theater of Object.keys(settings)) {
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    const file = `desktop/environment${suffix}-hd-contract.json`, pointer = `.local/environment${suffix}-selection.json`;
    if (fs.existsSync(file) && fs.existsSync(pointer)) {
        const contract = read(file), selection = read(pointer), manifestFile = `.local/environment-packs/${selection.revision}/manifest.json`;
        assert.equal(sha256(fs.readFileSync(manifestFile)), selection.sha256);
        contracts.set(theater, contract); selected.set(theater, read(manifestFile));
    }
    const terrainPointer = `.local/terrain${suffix}-selection.json`;
    if (fs.existsSync(terrainPointer)) {
        const selection = read(terrainPointer), manifestFile = `.local/terrain-packs/${selection.revision}/manifest.json`;
        assert.equal(sha256(fs.readFileSync(manifestFile)), selection.sha256);
        terrain.set(theater, read(manifestFile));
    }
}
const hd = await registerHdResources('.local'), accepted: any[] = [];
const environment = await registerEnvironmentResources('.local');
for (const [route, file] of environment.routes) hd.routes.set(route, file);
for (const [route, selection] of environment.selections) hd.selections.set(route, selection);
const campaign = await validateCampaignResources('.local/campaign');
for (const [route, file] of campaign.routes) hd.routes.set(route, file);
await registerCampaignEnvironmentResources(hd);
await registerCampaignEnvironmentAliases(hd);
for (const theater of Object.keys(settings)) {
    const route = `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
    const merged = hd.selections.get(route);
    if (merged) selected.set(theater, merged);
}
for (const [route, file] of hd.routes) if (route.endsWith('/manifest.json')) {
    const manifest = read(file);
    if (!['/local-hd/', '/local-vxl/', '/local-rhino/'].some(prefix => route.startsWith(prefix))) continue;
    accepted.push({ file, route, sha256: sha256(fs.readFileSync(file)), source: manifest.source,
        sources: manifest.sources, theater: manifest.theater, densities: manifest.variants?.map((v: any) => v.density) ?? [manifest.density] });
}
const rows = new Map<string, any>(), records: any[] = [];
for (const entry of inventory.rows) {
    const original = maps.openFile(entry.filename);
    assert.equal(sha256(original.getBytes()), entry.source.sha256);
    const map = new CampaignMapFile(VirtualFile.fromBytes(original.getBytes(), entry.filename),
        { semanticsVersion: 45, sourceSha256: entry.source.sha256 });
    const definition = new CampaignDefinition('yr', entry.filename, original.readAsString(),
        new IniFile(retailMember('yr', 'aimd.ini').file), { semanticsVersion: 45, sourceSha256: entry.source.sha256 });
    definition.assertValid();
    const theater = entry.theater.toUpperCase(), setting = settings[theater]; assert(setting);
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.mergeWith(map));
    const art = new Art(rules, retailIni('yr', 'art').mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
    const finder = new ImageFinder({ has: (name: string) => !!get(name) } as any, { settings: setting });
    const paletteFor = (native: any) => get(({ 1: setting.iso, 2: setting.unit, 3: setting.overlay, 4: 'anim',
        5: native.customPaletteName === 'lib' ? setting.lib : native.customPaletteName, 6: setting.iso } as any)[native.paletteType] + '.pal');
    const record: any = { mission: entry.filename, sourceSha256: entry.source.sha256, theater, issues: [], dependencyKeys: [] };
    const add = (value: any, count: number, reason: string, values: number[] = []) => {
        const key = sha256(Buffer.from(JSON.stringify([theater, value.kind, value.id, value.source, value.dependencies, value.nativeArt, value.nativeRules])));
        const row = rows.get(key) ?? { key, edition: 'yr', theater, ...value, usage: {} };
        const use = row.usage[entry.filename] ?? { count: 0, reasons: [], values: [] };
        use.count += count; use.reasons = [...new Set([...use.reasons, reason])]; use.values = [...new Set([...use.values, ...values])];
        row.usage[entry.filename] = use; rows.set(key, row); record.dependencyKeys.push(key);
    };
    const object = (id: string, type: ObjectType, count: number, reason: string) => {
        try {
            if (!rules.hasObject(id, type) && type !== ObjectType.Animation) {
                record.issues.push({ id, type, reason, issue: 'ORIGINAL_RULES_IDENTITY_ABSENT' }); return;
            }
            const native: any = art.getObject(id, type), rule: any = native.rules;
            const member = native.isVoxel ? native.imageName.toLowerCase() + '.vxl' : finder.getFilename(native.imageName, native.useTheaterExtension);
            const source = native.isVoxel ? get(member) : shp(member), dependencies: any[] = [];
            if (native.isVoxel) for (const suffix of ['', 'tur', 'barl']) {
                const name = native.imageName.toLowerCase() + suffix + '.vxl';
                if (get(name)) dependencies.push({ role: suffix || 'body', source: get(name), hva: get(name.replace(/\.vxl$/, '.hva')) });
            }
            if (type === ObjectType.Building) {
                if (rule.turret && rule.turretAnimIsVoxel && rule.turretAnim) {
                    const turret = rule.turretAnim.toLowerCase() + '.vxl';
                    const members = [{ role: 'TURRET_VXL', member: turret }];
                    if (turret.includes('tur')) {
                        const barrel = turret.replace('tur', 'barl');
                        if (get(barrel)) members.push({ role: 'BARREL_VXL', member: barrel });
                    }
                    for (const item of members) {
                        dependencies.push({ role: item.role, source: get(item.member) ?? {
                            member: item.member, status: 'ORIGINAL_MEMBER_ABSENT' }, palette: paletteFor(native),
                            remapable: native.remapable, nativeVoxelAttachment: true });
                        if (!native.noHva) {
                            const member = item.member.replace(/\.vxl$/, '.hva');
                            dependencies.push({ role: item.role.replace('_VXL', '_HVA'), source: get(member)
                                ?? { member, status: 'ORIGINAL_MEMBER_ABSENT' }, nativeVoxelAttachment: true });
                        }
                    }
                }
                const animations = new BuildingAnimArtProps(); animations.read(native.art, art);
                for (const [kind, list] of animations.getAll()) for (const animation of list) {
                    const name = finder.getFilename(animation.image, native.useTheaterExtension);
                    dependencies.push({ role: AnimationType[kind], animation: animation.name, source: shp(name), palette: paletteFor(native),
                        remapable: native.remapable, hasShadow: get(name) && new AnimProps(animation.art, new ShpFile(retailMember('yr', name).file)).shadow,
                        nativeArt: Object.fromEntries(animation.art.entries), damagedNativeArt: animation.damagedArt && Object.fromEntries(animation.damagedArt.entries),
                        extraOffset: animation.offset });
                }
                if (native.bibShape) dependencies.push({ role: 'BIB', source: shp(finder.getFilename(native.bibShape, native.useTheaterExtension)), palette: paletteFor(native) });
                for (const name of rules.getIni().getSection(id)?.getArray('DestroyAnim') ?? []) {
                    const animation = art.getAnimation(name), member = finder.getFilename(animation.imageName, animation.useTheaterExtension);
                    const source = shp(member);
                    dependencies.push({ role: 'RULES_DESTROY_ANIMATION', animation: name, source,
                        palette: paletteFor(animation), nativeArt: Object.fromEntries(animation.art.entries),
                        remapable: animation.art.getBool('Remapable', false),
                        hasShadow: source.sha256 && new AnimProps(animation.art, new ShpFile(retailMember('yr', member).file)).shadow,
                        runtimeEvidence: 'DECLARED_ORIGINAL_ANIMATION_REQUIRES_RENDERER_AND_COMPLETE_HD_BINDING_VALIDATION' });
                }
            }
            const contract = contracts.get(theater), family = contract?.identities.yr?.[id], descriptor = contract?.families[family];
            const all = [source, ...dependencies.map(dependency => dependency.source)];
            const familyContains = (identity: string, item: any) => {
                const declared = contract?.families[identity];
                const member = contract?.aliases?.[item?.member] ?? item?.member;
                return item?.sha256 && declared?.members.includes(member)
                    && selected.get(theater)?.families[identity]?.familyHash === declared.familyHash
                    && (declared.sourceOverrides?.[member] ?? contract.sources[member])?.sha256 === item.sha256;
            };
            const turretContains = (item: any) => {
                const attachment = contract?.turretAttachments?.[family];
                const binding = selected.get(theater)?.families[family]?.turrets;
                return item?.sha256 && attachment?.sources[item.member] === item.sha256
                    && attachment.sourceScope.campaignSources.some((source: any) => source.edition === 'yr'
                        && source.mission === entry.filename && source.sha256 === entry.source.sha256)
                    && [2, 4].every(density => binding?.[density]?.sha256 === attachment.variants[density].sha256);
            };
            const absentDeclarations = dependencies.flatMap(dependency => {
                const disposition = originalAnimationAbsence({ edition: 'yr', theater, identity: id,
                    mission: entry.filename, missionSha256: entry.source.sha256, family,
                    bodySha256: source?.sha256, buildup: native.art.getString('Buildup') }, dependency, name => !!get(name));
                return disposition ? [{ dependency, disposition }] : [];
            });
            const exact = descriptor && all.every(item => familyContains(family, item)
                || absentDeclarations.some(record => record.dependency.source === item)
                || dependencies.some(dependency => dependency.source === item && dependency.nativeVoxelAttachment && turretContains(item))
                || dependencies.some(dependency => dependency.source === item && dependency.role === 'RULES_DESTROY_ANIMATION'
                    && familyContains(contract.identities.yr?.[dependency.animation], item)));
            const donors = accepted.filter(candidate => candidate.source?.sha256 === source?.sha256
                || Object.values(candidate.sources ?? {}).some((item: any) => (typeof item === 'string' ? item : item.sha256) === source?.sha256));
            const nativeException = (sovietUnitHdFamilies as any)[id]?.blockedReason;
            const retainedOriginal = nativeException?.startsWith('USER_REQUESTED_ORIGINAL:');
            const invisible = source?.empty || rule.invisibleInGame || type === ObjectType.Overlay && rule.isRubble;
            add({ kind: ObjectType[type].toLowerCase(), id, source, dependencies, palette: paletteFor(native),
                hasShadow: native.hasShadow, remapable: native.remapable, nativeArt: Object.fromEntries(native.art.entries),
                nativeRules: Object.fromEntries(rules.getIni().getSection(id)?.entries ?? []), drawOffset: native.getDrawOffset(),
                decision: invisible || retainedOriginal ? 'INTENTIONAL_NATIVE_EXCEPTION' : exact ? 'ACCEPTED_COMPLETE_SOURCE_FAMILY_REUSE_CANDIDATE'
                    : donors.length ? 'EXISTING_HD_REUSE_REQUIRES_COMPLETE_BINDING_AND_PALETTE_AUDIT' : 'MISSING_AUTHORED_FAMILY',
                ...(retainedOriginal ? { nativeExceptionReason: nativeException } : {}),
                acceptedFamily: exact ? family : undefined, acceptedResources: donors,
                ...(absentDeclarations.length ? { originalMissingAnimationDeclarations: absentDeclarations.map(({ dependency, disposition }) =>
                    ({ role: dependency.role, member: dependency.source.member, disposition,
                        policy: 'Original missing member; existing renderer warning/skip. No authored animation is claimed.' })) } : {}),
                runtimeEvidence: 'SEPARATE_NATIVE_VALIDATION_REQUIRED' }, count, reason);
        } catch (error) { record.issues.push({ id, type, reason, error: String(error) }); }
    };
    const sets = new TileSets(new IniFile(retailMember('yr', setting.ini).file));
    sets.loadTileData({ get: (name: string) => get(name) && new TmpFile(retailMember('yr', name).file) }, setting.extension);
    const tileUsage = new Map<number, any[]>();
    for (const tile of map.tiles) { const use = tileUsage.get(tile.tileNum) ?? []; use.push(tile); tileUsage.set(tile.tileNum, use); }
    for (const [number, tiles] of tileUsage) {
        const group = sets.getTile(number);
        if (!group?.files.length) { record.issues.push({ tileNum: number, issue: 'ORIGINAL_TILE_ABSENT' }); continue; }
        for (const file of group.files) {
            const source = get(file.filename!), donor = terrain.get(theater)?.groups.find((group: any) => group.members.some((m: any) => m.member === source.member && m.sourceHashes.yr === source.sha256));
            add({ kind: 'tmp', id: source.member, source, set: sets.getSetNum(number), setName: group.owner.setName,
                nativeSlots: file.images.length, decision: donor ? 'ACCEPTED_COMPLETE_SOURCE_TERRAIN_REUSE_CANDIDATE' : 'MISSING_AUTHORED_FAMILY',
                acceptedFamily: donor?.id, runtimeEvidence: 'SEPARATE_NATIVE_VALIDATION_REQUIRED' }, tiles.length, 'PLACED_RANDOM_VARIANT', tiles.map(tile => tile.subTile));
        }
        const animation = group.getAnimation();
        if (animation && tiles.some(tile => tile.subTile === animation.subTile)) object(animation.name, ObjectType.Animation, 0, 'PLACED_TILE_ANIMATION');
    }
    for (const list of [map.terrains, map.structures, map.vehicles, map.infantries, map.aircrafts, map.smudges]) {
        const grouped = new Map<string, any>();
        for (const value of list) { const item = grouped.get(value.name) ?? { value, count: 0 }; item.count++; grouped.set(value.name, item); }
        for (const { value, count } of grouped.values()) object(value.name, value.type, count, 'ORIGINAL_PLACEMENT_INCLUDING_SHROUDED_OBJECTS');
    }
    for (const name of campaignUnitHdDemand({ rules, campaign: { definition, launch: { semanticsVersion: 45 } } })) {
        const type = [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft].find(type => rules.hasObject(name, type));
        if (type) object(name, type, 0, 'SOURCE_REINFORCEMENT_AND_AI_TEAM_CLOSURE');
    }
    for (const trigger of definition.triggers.values()) for (const action of trigger.actions) {
        if (action.opcode === 125) object(action.params[1], ObjectType.Building, 0, 'ORIGINAL_CREATE_BUILDING_ACTION');
    }
    for (const overlay of new Set(map.overlays.map(value => value.id))) if (rules.hasOverlayId(overlay)) {
        object(rules.getOverlayName(overlay), ObjectType.Overlay, map.overlays.filter(value => value.id === overlay).length, 'ORIGINAL_OVERLAY');
    }
    for (const [id, rule] of rules.smudgeRules) if (rule.crater || rule.burn) object(id, ObjectType.Smudge, 0, 'NORMAL_EXPLOSION_DECAL');
    for (const collection of [rules.buildingRules, rules.vehicleRules, rules.infantryRules, rules.aircraftRules]) for (const [id, rule] of collection) {
        if (rule.techLevel >= 0 && rule.techLevel <= 10 && rule.owner?.length) object(id, rule.type, 0, 'POTENTIAL_MISSION_PRODUCTION_ROSTER_REQUIRES_HOUSE_TECH_AUDIT');
    }
    record.dependencyKeys = [...new Set(record.dependencyKeys)]; records.push(record);
    console.log(JSON.stringify({ mission: entry.filename, theater, dependencies: record.dependencyKeys.length, issues: record.issues.length }));
}
write('inventory.json', { schema: 'yr-campaign-art-inventory-v1', status: 'ORIGINAL_SOURCE_CLOSURE_AUDITED_NATIVE_AND_VISUAL_VALIDATION_PENDING',
    archive: inventory.archive, maps: records, rows: [...rows.values()], sources: [...sources.values()].filter(Boolean),
    boundaries: ['Potential production is explicitly overinclusive until each house and source technology transition is audited.',
        'Donor presence does not prove complete compatible art, palette, runtime binding or visual acceptance.'] });
write('summary.json', { missions: records.length, rows: rows.size, issues: records.flatMap(record => record.issues).length,
    theaters: Object.fromEntries(Object.keys(settings).map(theater => [theater,
        Object.fromEntries([...new Set([...rows.values()].filter(row => row.theater === theater).map(row => row.decision))]
            .map(decision => [decision, [...rows.values()].filter(row => row.theater === theater && row.decision === decision).length]))])) });
