// Inventory archive-native map dependencies without altering maps or gameplay.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { IniFile } from '../../../src/data/IniFile';
import { MapFile } from '../../../src/data/MapFile';
import { VirtualFile } from '../../../src/data/vfs/VirtualFile';
import { ShpFile } from '../../../src/data/ShpFile';
import { TmpFile } from '../../../src/data/TmpFile';
import { environmentMemberSource } from '../../../src/engine/renderable/builder/environmentHdContract';
import { Rules } from '../../../src/game/rules/Rules';
import { Art } from '../../../src/game/art/Art';
import { TileSets } from '../../../src/game/theater/TileSets';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { ObjectType } from '../../../src/engine/type/ObjectType';
import { TheaterType } from '../../../src/engine/TheaterType';
import { BuildingAnimArtProps } from '../../../src/engine/renderable/entity/building/BuildingAnimArtProps';
import { AnimationType } from '../../../src/engine/renderable/entity/building/AnimationType';
import { AnimProps } from '../../../src/engine/AnimProps';
import { CsfFile } from '../../../src/data/CsfFile';
import { MixEntry } from '../../../src/data/MixEntry';
import { OreOverlayTypes } from '../../../src/game/map/OreOverlayTypes';
import { OverlayTibType } from '../../../src/engine/type/OverlayTibType';
import { BridgeOverlayTypes } from '../../../src/game/map/BridgeOverlayTypes';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { registerHdResources, unitIdentities, vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';
import { sharedAlliedUnitHdIdentity, unitHdAvailableInEdition } from '../../../src/engine/renderable/builder/sharedAlliedUnitHd';
import { sharedYuriUnitHdIdentity } from '../../../src/engine/renderable/builder/sharedYuriUnitHd';
import { sovietBuildingHdFamilies } from '../../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { unitHdFamiliesForEdition } from '../../../src/engine/renderable/builder/unitHdFamilies';
import officialCatalog from '../../../src/offline/officialSkirmishCatalog.json';
import { applyOfficialLibraryPalettes } from '../../../src/offline/officialSkirmishVisuals';
import { vxlUnitAvailableInTheater, vxlUnitFamilies } from '../../../src/engine/renderable/unitVxl/identities';
import { isGeneratedGroundSmudge } from '../../../src/offline/smudgeDependency';

type Edition = 'ra2' | 'yr';
const output = process.argv[2];
const unified = process.argv.includes('--unified-skirmish');
const scopedMapIds = process.argv.find(arg => arg.startsWith('--map-ids='))?.slice(10).split(',');
if (scopedMapIds && (!scopedMapIds.every(Boolean) || new Set(scopedMapIds).size !== scopedMapIds.length))
    throw Error('Map scope must contain unique nonempty official inventory IDs');
if (!output) throw Error('Usage: bun scripts/m2/official-maps/inventory.ts <new-output-directory>');
mkdirSync(output, { recursive: false });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const hashJson = (data: unknown) => sha(Buffer.from(JSON.stringify(data)));
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file: string, data: unknown) => writeFileSync(`${output}/${file}`, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const archives = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(archives.map(name => [name,
    readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const archivePins = [...top].map(([name, bytes]) => ({ name, bytes: bytes.length, sha256: sha(bytes) }));
const candidateNames = new Set<string>(), globalMetadata = new Map<string, any>();
for (const edition of ['ra2', 'yr'] as Edition[]) {
    const tree = editionRetailTree(top, edition);
    const pkt = new IniFile(resolveMember(tree, edition === 'yr' ? 'missionsmd.pkt' : 'missions.pkt').file);
    for (const value of pkt.getSection('MultiMaps')!.entries.values()) {
        const name = String(Array.isArray(value) ? value[0] : value).toLowerCase();
        candidateNames.add(name);
        globalMetadata.set(name + '.map', Object.fromEntries(pkt.getSection(name)?.entries ?? []));
    }
    const strings = new CsfFile(resolveMember(tree, edition === 'yr' ? 'ra2md.csf' : 'ra2.csf').file);
    for (const label of Object.keys(strings.data)) if (/^desc:/i.test(label)) candidateNames.add(label.slice(5).toLowerCase());
}
for (const name of [...candidateNames]) { candidateNames.add(name.replace(/^x/, '')); candidateNames.add('x' + name); }
const nameCandidatesById = new Map<number, string[]>();
for (const stem of candidateNames) for (const extension of ['.map', '.mpr', '.yrm']) {
    const name = stem + extension, id = MixEntry.hashFilename(name), names = nameCandidatesById.get(id) ?? [];
    nameCandidatesById.set(id, [...names, name]);
}
const settings: Record<number, any> = {
    1: { name: 'TEMPERATE', extension: '.tem', newTheaterChar: 'T', ini: 'temperat', iso: 'isotem', unit: 'unittem', overlay: 'temperat', lib: 'libtem' },
    2: { name: 'URBAN', extension: '.urb', newTheaterChar: 'U', ini: 'urban', iso: 'isourb', unit: 'uniturb', overlay: 'urban', lib: 'liburb' },
    4: { name: 'SNOW', extension: '.sno', newTheaterChar: 'A', ini: 'snow', iso: 'isosno', unit: 'unitsno', overlay: 'snow', lib: 'libsno' },
    8: { name: 'LUNAR', extension: '.lun', newTheaterChar: 'L', ini: 'lunar', iso: 'isolun', unit: 'unitlun', overlay: 'lunar', lib: 'liblun' },
    16: { name: 'DESERT', extension: '.des', newTheaterChar: 'D', ini: 'desert', iso: 'isodes', unit: 'unitdes', overlay: 'desert', lib: 'libdes' },
    32: { name: 'NEWURBAN', extension: '.ubn', newTheaterChar: 'N', ini: 'urbann', iso: 'isoubn', unit: 'unitubn', overlay: 'urbann', lib: 'libubn' },
};
const terrainPointer = readJson('.local/terrain-selection.json');
const terrain = readJson(`.local/terrain-packs/${terrainPointer.revision}/manifest.json`);
const baselineTerrain = readJson('.local/terrain-packs/temperate-m2-2-environment-v9/manifest.json');
const baselineTmpMembers = new Set<string>(baselineTerrain.groups.flatMap((group: any) =>
    group.members.map((member: any) => member.member.toLowerCase())));
const baselineEnvironmentFamilies = new Set<string>(Object.keys(readJson(
    '.local/environment-packs/environment-m2-2-complete-v10/manifest.json').families));
const acceptedTmp = new Map<string, any>(terrain.groups.flatMap((group: any) =>
    group.members.map((member: any) => [member.member.toLowerCase(), { ...member, group: group.id }])));
const environment = readJson('desktop/environment-hd-contract.json');
const environmentPointer = readJson('.local/environment-selection.json');
const environmentPack = readJson(`.local/environment-packs/${environmentPointer.revision}/manifest.json`);
if (sha(readFileSync(`.local/environment-packs/${environmentPointer.revision}/manifest.json`))
    !== environmentPointer.sha256) throw Error('Selected environment manifest hash mismatch');
const publishedEnvironmentFamilies = new Set(Object.keys(environmentPack.families).filter(identity => {
    const declared = environment.families[identity], published = environmentPack.families[identity];
    return declared && declared.familyHash === published.familyHash
        && declared.members.length === published.members.length
        && declared.members.every((name: string) => {
            const member = published.members.find((value: any) => value.member === name);
            if (!member) return false;
            const bytes = readFileSync(`.local/environment-packs/${environmentPointer.revision}/${member.path}`);
            const manifest = JSON.parse(bytes.toString('utf8'));
            const native = environmentMemberSource(environment, identity, name);
            return sha(bytes) === member.sha256 && manifest.source.sha256 === native?.sha256
                && manifest.logical.frames.length === native?.bodyFrames
                && manifest.variants.map((value: any) => value.density).join(',') === '2,4';
        });
}));
const theaterResources = new Map<string, any>([['TEMPERATE', {
    terrainPointer, acceptedTmp, environmentPointer, environment, publishedEnvironmentFamilies,
}]]);
if (unified) for (const setting of Object.values(settings)) {
    if (setting.name === 'TEMPERATE') continue;
    const name = setting.name.toLowerCase();
    const terrainPath = `.local/terrain-${name}-selection.json`;
    const environmentPath = `.local/environment-${name}-selection.json`;
    const contractPath = `desktop/environment-${name}-hd-contract.json`;
    const hasTerrain = existsSync(terrainPath);
    const hasEnvironment = [environmentPath, contractPath].every(existsSync);
    if (!hasTerrain && !hasEnvironment) continue;
    const terrainPointer = hasTerrain ? readJson(terrainPath) : null;
    const environmentPointer = hasEnvironment ? readJson(environmentPath) : null;
    const selectedManifest = (category: string, pointer: any) => {
        if (!pointer) return;
        const path = `.local/${category}/${pointer.revision}/manifest.json`;
        const bytes = readFileSync(path);
        if (sha(bytes) !== pointer.sha256) throw Error(`Selected ${setting.name} manifest hash mismatch`);
        return JSON.parse(bytes.toString('utf8'));
    };
    const terrain = selectedManifest('terrain-packs', terrainPointer);
    const pack = selectedManifest('environment-packs', environmentPointer);
    const environment = hasEnvironment ? readJson(contractPath) : undefined;
    if (terrain && terrain.theater !== setting.name
        || pack && (pack.theater !== setting.name || environment.theater !== setting.name))
        throw Error(`Selected ${setting.name} contract theater mismatch`);
    const publishedEnvironmentFamilies = new Set(Object.keys(pack?.families ?? {}).filter(identity => {
        const declared = environment.families[identity], published = pack.families[identity];
        return declared?.familyHash === published.familyHash
            && declared.members.length === published.members.length
            && declared.members.every((name: string) => {
                const member = published.members.find((value: any) => value.member === name);
                if (!member) return false;
                const bytes = readFileSync(`.local/environment-packs/${environmentPointer.revision}/${member.path}`);
                const manifest = JSON.parse(bytes.toString('utf8'));
                const native = environmentMemberSource(environment, identity, name);
                return sha(bytes) === member.sha256 && manifest.source.sha256 === native?.sha256
                    && manifest.logical.frames.length === native?.bodyFrames
                    && manifest.variants.map((value: any) => value.density).join(',') === '2,4';
            });
    }));
    theaterResources.set(setting.name, { terrainPointer, environmentPointer, environment,
        publishedEnvironmentFamilies, acceptedTmp: new Map((terrain?.groups ?? []).flatMap((group: any) =>
            group.members.map((member: any) => [member.member.toLowerCase(), { ...member, group: group.id }]))) });
}
const buildingCatalogs = ['allied', 'soviet', 'yuri'].flatMap(name => Object.values(
    readJson(`desktop/${name}-building-coverage.json`))) as any[];
const events: any[] = [];
process.env.RA2_UI_RESOURCE_ROOT = '.local';
const registered = await registerHdResources('.local', (event: any) => events.push(event));
const boundIdentities = new Map<string, string[]>();
for (const [route, selection] of registered.selections as Map<string, any>) {
    if (!route.startsWith('/local-hd/')) continue;
    const key = route.split('/').at(-1)!.replace('-selection.json', '');
    const identity = selection.rulesIdentity ?? buildingCatalogs.find(c => c.selection === key)?.family
        ?? (route === '/local-hd/selection.json' ? 'E2' : undefined)
        ?? ({ 'power-plant': 'GAPOWR', 'soviet-power-plant': 'NAPOWR', selection: 'E2' } as any)[key]
        ?? key.toUpperCase();
    for (const member of selection.members ?? (selection.member ? [selection] : [])) {
        const values = boundIdentities.get(member.sha256) ?? [];
        boundIdentities.set(member.sha256, [...new Set([...values, identity])]);
    }
}
const accepted = new Map<string, any[]>();
for (const [route, file] of registered.routes) {
    const rhino = unified && route === '/local-rhino/manifest.json';
    if (!route.endsWith('/manifest.json') || !/\/local-(hd|vxl)\//.test(route) && !rhino) continue;
    const manifest = readJson(file);
    const sources = manifest.source ? [manifest.source] : Object.entries(manifest.sources ?? {})
        .map(([member, value]) => typeof value === 'string' ? { member, sha256: value } : value);
    for (const source of sources as any[]) {
        const member = source.member?.toLowerCase();
        const hash = source.sha256;
        if (!member || !hash) continue;
        const key = `${member}:${hash}`;
        const entries = accepted.get(key) ?? [];
        entries.push({ file, route, manifestHash: sha(readFileSync(file)), theater: manifest.theater ?? source.theater,
            rulesIdentities: rhino ? ['HTNK']
                : manifest.rulesIdentities ?? boundIdentities.get(sha(readFileSync(file))) ?? [manifest.identity],
            densities: manifest.variants?.map((v: any) => v.density) ?? [manifest.density] });
        accepted.set(key, entries);
    }
}
const rows = new Map<string, any>(), maps: any[] = [], catalogs: any[] = [], archivedMaps: any[] = [];
const issues: any[] = [], sourcePins = new Map<string, any>();
function observe(row: any, mapId: string, count: number, reason: string, values?: number[]) {
    // Include resolved source and art/rules policy: a map override cannot borrow another contract by name.
    const key = hashJson([row.edition, row.theater, row.kind, row.id, row.source, row.dependencies,
        row.nativeArt, row.nativeRules]);
    const previous = rows.get(key) ?? { key, ...row, usage: {} };
    const use = previous.usage[mapId] ?? { count: 0, reasons: [], values: [] };
    use.count += count;
    use.reasons = [...new Set([...use.reasons, reason])];
    use.values = [...new Set([...use.values, ...(values ?? [])])].sort((a, b) => a - b);
    previous.usage[mapId] = use;
    rows.set(key, previous);
    return key;
}

for (const edition of ['ra2', 'yr'] as Edition[]) {
    const tree = editionRetailTree(top, edition);
    const resolved = new Map<string, any>(), shps = new Map<string, any>(), tileSets = new Map<number, TileSets>();
    const theaterFailures = new Map<number, any[]>();
    const get = (name: string): any => {
        const key = name.toLowerCase();
        if (!resolved.has(key)) {
            try {
                const member = resolveMember(tree, key), bytes = member.file.getBytes();
                const identity = { member: key, archive: member.source, sha256: sha(bytes), bytes: bytes.length };
                resolved.set(key, identity);
                sourcePins.set(`${edition}:${key}:${identity.sha256}`, { edition, ...identity });
            } catch { resolved.set(key, undefined); }
        }
        return resolved.get(key);
    };
    const describeShp = (name: string) => {
        if (shps.has(name)) return shps.get(name);
        const source = get(name);
        if (!source) return { member: name, status: 'NATIVE_MEMBER_NOT_FOUND' };
        const file = new ShpFile(resolveMember(tree, name).file);
        const value = { ...source, canvas: [file.width, file.height], totalFrames: file.images.length,
            empty: file.images.every(image => image.imageData.every(index => index === 0)) };
        shps.set(name, value);
        return value;
    };
    const rawRules = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const rawArt = new IniFile(resolveMember(tree, edition === 'yr' ? 'artmd.ini' : 'art.ini').file);
    get(edition === 'yr' ? 'rulesmd.ini' : 'rules.ini'); get(edition === 'yr' ? 'artmd.ini' : 'art.ini');
    const catalogName = edition === 'yr' ? 'missionsmd.pkt' : 'missions.pkt';
    const catalog = new IniFile(resolveMember(tree, catalogName).file);
    const catalogSource = get(catalogName);
    const declarations: any[] = [...catalog.getSection('MultiMaps')!.entries].map(([index, value]) => {
        const name = String(Array.isArray(value) ? value[0] : value);
        return { index, name, member: name.toLowerCase() + '.map',
            metadata: Object.fromEntries(catalog.getSection(name)?.entries ?? []) };
    });
    catalogs.push({ edition, ...catalogSource, declaredEntries: declarations.length });
    const catalogDeclarations = [...declarations];
    const knownIds = new Set<number>();
    for (const declaration of declarations) knownIds.add(MixEntry.hashFilename(declaration.member));
    const catalogSelectedHashes = new Set(declarations.map(d => get(d.member)?.sha256).filter(Boolean));
    const archiveHashes = new Set<string>();
    // Read archive entries directly to retain unlisted maps and precedence variants.
    // MIX stores IDs, so unresolved filenames remain explicit instead of guessed.
    for (const container of tree) for (const entry of container.mix.getEntries()) {
        if (entry.length < 64 || entry.length > 8 * 1024 * 1024) continue;
        const mix = container.mix as any;
        const file = VirtualFile.factory(mix.stream, `id-${entry.hash.toString(16)}.map`,
            mix.dataStart + entry.offset, entry.length);
        const bytes = file.getBytes();
        const prefix = Buffer.from(bytes.subarray(0, 8192)).toString('latin1');
        if (!['[', ';'].includes(prefix.trimStart()[0])) continue;
        const text = Buffer.from(bytes).toString('latin1');
        if (!/\[Map\]/i.test(text) || !/\[IsoMapPack5\]/i.test(text)) continue;
        const ini = new IniFile(file);
        const aliases = nameCandidatesById.get(entry.hash) ?? [];
        const archiveRecord: any = { edition, archive: container.path, memberId: entry.hash, bytes: bytes.length,
            sha256: sha(bytes), catalogNames: catalogDeclarations.filter(d => MixEntry.hashFilename(d.member) === entry.hash).map(d => d.member),
            verifiedNameCandidates: aliases,
            classification: knownIds.has(entry.hash) ? 'CATALOG_MEMBER_OR_PRECEDENCE_VERSION'
                : ini.getSection('Basic')?.getBool('MultiplayerOnly') ? 'UNCATALOGED_MULTIPLAYER_MAP_REQUIRES_IDENTITY_RESOLUTION'
                    : 'CAMPAIGN_OR_UNCLASSIFIED_MAP_EXCLUDED_FROM_PRODUCTION',
            theater: ini.getSection('Map')?.getString('Theater'),
            basic: Object.fromEntries(ini.getSection('Basic')?.entries ?? []) };
        archivedMaps.push(archiveRecord);
        if (catalogSelectedHashes.has(archiveRecord.sha256) || archiveHashes.has(archiveRecord.sha256)) continue;
        archiveHashes.add(archiveRecord.sha256);
        const member = aliases.length === 1 ? aliases[0] : `id-${entry.hash.toString(16)}.map`;
        const metadata = aliases.map(name => globalMetadata.get(name)).find(Boolean) ?? {};
        declarations.push({ index: null, name: member, member, metadata, rawFile: file,
            rawSource: { member, archive: container.path, memberId: entry.hash, sha256: archiveRecord.sha256, bytes: bytes.length },
            origin: knownIds.has(entry.hash) ? 'ALTERNATE_ARCHIVE_VERSION' : 'ARCHIVE_ONLY_NATIVE_MAP',
            nativeOfficial: ini.getSection('Basic')?.getBool('Official') ?? false,
            nativeMultiplayer: ini.getSection('Basic')?.getBool('MultiplayerOnly') ?? false,
            verifiedNameCandidates: aliases });
    }
    for (const declaration of declarations) {
        const mapId = `${edition}:${declaration.member}${declaration.rawSource ? '@' + declaration.rawSource.sha256.slice(0, 12) : ''}`;
        if (scopedMapIds && !scopedMapIds.includes(mapId)) continue;
        const source = declaration.rawSource ?? get(declaration.member);
        const mode = String(declaration.metadata.GameMode ?? 'standard').toLowerCase();
        const classification = /campaign|cooperative/.test(mode) ? 'OFFICIAL_COOPERATIVE_CAMPAIGN_EXCLUDED'
            : declaration.rawSource && !declaration.nativeMultiplayer ? 'ARCHIVE_CAMPAIGN_OR_UNCLASSIFIED_EXCLUDED'
            : declaration.rawSource && !declaration.nativeOfficial ? 'ARCHIVE_CUSTOM_OR_UNCLASSIFIED_EXCLUDED' : 'OFFICIAL_SKIRMISH';
        const { rawFile, ...declared } = declaration;
        const record: any = { mapId, edition, catalogIndex: declaration.index, catalogSource, declaration: declared,
            catalogVisibility: declaration.rawSource ? 'ARCHIVE_ONLY_NOT_IN_SELECTED_NATIVE_CATALOG' : 'SELECTED_NATIVE_CATALOG',
            classification, source, gameplayStatus: 'STRUCTURAL_CHECK_PENDING', dependencyKeys: [], issues: [] };
        maps.push(record);
        if (!source) {
            record.gameplayStatus = 'BLOCKED_MISSING_ALLOWLISTED_ARCHIVE_MAP';
            record.issues.push('Catalog declaration retained in denominator; source archive member unavailable');
            continue;
        }
        try {
            const map = new MapFile(rawFile ?? resolveMember(tree, declaration.member).file);
            const setting = settings[map.theaterType];
            Object.assign(record, { theater: setting?.name ?? TheaterType[map.theaterType], fullSize: map.fullSize,
                localSize: map.localSize, starts: map.startingLocations.length, iniFormat: map.iniFormat,
                counts: Object.fromEntries(['tiles', 'terrains', 'structures', 'vehicles', 'infantries', 'aircrafts', 'overlays', 'smudges']
                    .map(key => [key, (map as any)[key].length])),
                ruleOverrides: Object.fromEntries([...map.sections].filter(([name]) => rawRules.sections.has(name))
                    .map(([name, section]) => [name, Object.fromEntries(section.entries)])),
                geometryHash: hashJson([map.fullSize, map.localSize, map.tiles]),
                placementHash: hashJson(['terrains', 'structures', 'vehicles', 'infantries', 'aircrafts', 'overlays', 'smudges']
                    .map(key => (map as any)[key].map((entry: any) => JSON.stringify(entry)).sort())) });
            if (classification !== 'OFFICIAL_SKIRMISH') { record.gameplayStatus = 'EXCLUDED_FROM_PRODUCTION'; continue; }
            if (!setting || edition === 'ra2' && ![1, 2, 4].includes(map.theaterType)) {
                record.gameplayStatus = 'BLOCKED_UNSUPPORTED_THEATER'; continue;
            }
            const rules = new Rules(adaptRetailRules(rawRules.clone()).rules.mergeWith(map));
            const art = new Art(rules, rawArt.clone().mergeWith(map.artOverrides ?? new IniFile()), map, undefined);
            const finder = new ImageFinder({ has: (name: string) => !!get(name) } as any, { settings: setting });
            if (unified) {
                const entry = officialCatalog.maps.find(entry => entry.edition === edition
                    && entry.source.sha256 === source.sha256);
                const adaptation = await applyOfficialLibraryPalettes(entry,
                    { type: map.theaterType, settings: { libPaletteName: setting.lib + '.pal' } }, art,
                    { findByObjectArt: native => ({ filename: finder.getFilename(native.imageName, native.useTheaterExtension) }) },
                    name => Uint8Array.from(resolveMember(tree, name).file.getBytes()));
                if (adaptation.status !== 'NOT_APPLICABLE') record.officialVisualAdaptation = adaptation;
            }
            const paletteFor = (native: any) => {
                const names: Record<number, string> = { 1: setting.iso, 2: setting.unit, 3: setting.overlay,
                    4: 'anim', 5: native.customPaletteName === 'lib' ? setting.lib : native.customPaletteName, 6: setting.iso };
                return get((names[native.paletteType] ?? setting.iso) + '.pal');
            };
            const describeObject = (id: string, type: ObjectType): any => {
                if (!rules.hasObject(id, type) && type !== ObjectType.Animation)
                    return { edition, theater: setting.name, kind: ObjectType[type].toLowerCase(), id,
                        decision: 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY', issue: 'NATIVE_RULES_MISSING' };
                const native: any = art.getObject(id, type), rule: any = native.rules;
                const member = native.isVoxel ? native.imageName.toLowerCase() + '.vxl'
                    : finder.getFilename(native.imageName, native.useTheaterExtension);
                const source = native.isVoxel ? get(member) : describeShp(member);
                const dependencies: any[] = [];
                if (native.isVoxel) {
                    dependencies.push({ role: 'HVA', source: get(member.replace(/\.vxl$/, '.hva')) });
                    dependencies.push({ role: 'VPL', source: get('voxels.vpl') });
                    for (const suffix of ['tur', 'barl']) {
                        const name = native.imageName.toLowerCase() + suffix + '.vxl';
                        if (get(name)) dependencies.push({ role: suffix.toUpperCase(), source: get(name),
                            hva: get(name.replace(/\.vxl$/, '.hva')) });
                    }
                }
                if (type === ObjectType.Building) {
                    const animations = new BuildingAnimArtProps(); animations.read(native.art, art);
                    for (const [animationType, entries] of animations.getAll()) for (const animation of entries) {
                        const name = finder.getFilename(animation.image, native.useTheaterExtension);
                        dependencies.push({ role: AnimationType[animationType], animation: animation.name,
                            source: describeShp(name), palette: paletteFor(native), remapable: native.remapable,
                            hasShadow: get(name) && new AnimProps(animation.art, new ShpFile(resolveMember(tree, name).file)).shadow,
                            nativeArt: Object.fromEntries(animation.art.entries),
                            damagedNativeArt: animation.damagedArt && Object.fromEntries(animation.damagedArt.entries),
                            extraOffset: animation.offset });
                    }
                    if (native.bibShape) dependencies.push({ role: 'BIB', source: describeShp(
                        finder.getFilename(native.bibShape, native.useTheaterExtension)), palette: paletteFor(native) });
                }
                const allSources = [source, ...dependencies.filter(d => !['HVA', 'VPL'].includes(d.role)).map(d => d.source)];
                const resource = theaterResources.get(setting.name);
                const contract = resource?.environment;
                const bodyFamily = contract?.identities[edition]?.[id];
                const envMatch = bodyFamily && resource.publishedEnvironmentFamilies.has(bodyFamily)
                    && allSources.every(s => s?.sha256 && (environmentMemberSource(contract, bodyFamily, s.member)?.sha256 === s.sha256
                        || environmentMemberSource(contract, bodyFamily, contract.aliases?.[s.member])?.sha256 === s.sha256));
                const building = buildingCatalogs.find(c => c.family === id && c.theater === setting.name);
                // Match the loader's art-name resolution and exact source hash, including retail aliases.
                const buildingMatch = building && allSources.every(s => building.members.some((m: any) =>
                    m.sha256 === s?.sha256 && (!unified || m.canvas.every((value: number, index: number) => s.canvas[index] === value))
                    && (unified || m.member === s?.member)))
                    && (!unified || building.members.every((member: any) =>
                        get(finder.getFilename(member.artName, false))?.sha256 === member.sha256));
                const indexMatches = source?.sha256 ? accepted.get(`${source.member}:${source.sha256}`) ?? [] : [];
                const sharedIdentity = sharedYuriUnitHdIdentity(sharedAlliedUnitHdIdentity(id,
                    { filename: source?.member }), { filename: source?.member }, edition);
                const canonicalIdentity = id === 'AMRADR' ? 'GAAIRC' : id === 'TRUCKA' ? 'DTRUCK' : sharedIdentity;
                const sharedUnit = unified && [ObjectType.Infantry, ObjectType.Vehicle, ObjectType.Aircraft].includes(type)
                    && (unitHdFamiliesForEdition(edition)[canonicalIdentity]
                        || canonicalIdentity === 'E2' && source?.member === 'cons.shp');
                const exactIdentity = indexMatches.some(m => m.rulesIdentities?.includes(canonicalIdentity)
                    && (!m.theater || m.theater === setting.name || native.isVoxel || sharedUnit));
                const unit = (unitIdentities as any)[id];
                const vxl = (vxlUnitIdentities as any)[id];
                const blocked = unit?.blockedReason && (!unit.edition || unit.edition === edition)
                    && !(id === 'YURIPR' && edition === 'yr');
                const wallDescriptor = unified && setting.name === 'URBAN' && [ObjectType.Overlay, ObjectType.Building].includes(type)
                    ? id === 'GAWALL' ? buildingCatalogs.find(c => c.family === id && c.theater === 'TEMPERATE')
                        : id === 'NAWALL' ? sovietBuildingHdFamilies.NAWALL : undefined : undefined;
                const wallMember = wallDescriptor?.members[0];
                const factionWallReuse = wallMember && source?.sha256 === wallMember.sha256
                    && source.totalFrames === wallMember.frames * 2
                    && (wallMember.canvas ?? wallDescriptor.canvas).every((value: number, index: number) => source.canvas[index] === value)
                    && accepted.get(`${wallMember.member}:${wallMember.sha256}`)?.some(entry =>
                        entry.rulesIdentities?.includes(id));
                const militaryInherited = (buildingMatch || exactIdentity || factionWallReuse || id === 'HTNK' && setting.name === 'TEMPERATE')
                    && (!unit?.edition || unitHdAvailableInEdition({ identity: id, edition: unit.edition }, edition))
                    && (!vxl?.edition || vxl.edition === edition)
                    && (!vxlUnitFamilies[canonicalIdentity] ||
                        vxlUnitAvailableInTheater(vxlUnitFamilies[canonicalIdentity], setting.name));
                const invisibleSystemOverlay = type === ObjectType.Overlay && rule.isRubble;
                const invisible = invisibleSystemOverlay || source?.empty || rules.getIni().getSection(id)?.getBool('InvisibleInGame')
                    || BridgeOverlayTypes.bridgePlaceholderIds.some(n =>
                    rules.hasOverlayId(n) && rules.getOverlayName(n) === id);
                const nativeExceptions = dependencies.filter(d => !d.source?.sha256 &&
                    ['garefnl4.shp', 'gagap_a.shp'].includes(d.source?.member)).map(d => ({ role: d.role,
                    member: d.source.member, reason: 'RETAIL_ABSENT_OPTIONAL_ANIMATION_PRESERVED_M1_EXCEPTION' }));
                const missing = allSources.some(s => !s?.sha256 && !nativeExceptions.some(e => e.member === s?.member));
                const artworkExists = indexMatches.length || source?.sha256 && Object.values(environment.sources).some((s: any) =>
                    s.sha256 === source.sha256);
                const decision = blocked ? 'INTENTIONAL_NATIVE_EXCEPTION' : invisible ? 'INTENTIONAL_NATIVE_EXCEPTION'
                    : missing ? 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY'
                    : envMatch && (setting.name !== 'TEMPERATE' || !unified && !baselineEnvironmentFamilies.has(bodyFamily))
                        ? 'AUTHORED_HD_COMPLETE_REVIEW_PENDING'
                    : envMatch || militaryInherited ? 'ACCEPTED_HD_REUSED'
                    : artworkExists && setting.name === 'TEMPERATE' ? 'EXISTING_HD_BINDING_OR_REGISTRATION_PROBLEM'
                    : 'MISSING_AUTHORED_FAMILY';
                return { edition, theater: setting.name, kind: ObjectType[type].toLowerCase(), id,
                    source, dependencies, palette: paletteFor(native), hasShadow: native.hasShadow,
                    remapable: native.remapable, drawOffset: native.getDrawOffset(), paletteType: native.paletteType,
                    customPalette: native.customPaletteName, nativeArt: Object.fromEntries(native.art.entries),
                    nativeRules: Object.fromEntries(rules.getIni().getSection(id)?.entries ?? []), decision,
                    acceptedFamily: envMatch ? bodyFamily : buildingMatch ? building.selection : militaryInherited ? id : undefined,
                    acceptedResources: indexMatches, nativeExceptions,
                    exception: blocked ? unit.blockedReason : invisibleSystemOverlay ? 'ORIGINAL_INVISIBLE_RUBBLE_SYSTEM_OVERLAY'
                        : invisible ? 'NATIVE_INVISIBLE_OR_EMPTY' : undefined,
                    states: type === ObjectType.Building ? ['normal', 'damaged', 'destruction', 'native-shadow',
                        ...(rule.canBeOccupied ? ['occupied', 'evacuation', 'critical-damage-evacuation'] : []),
                        ...(rule.capturable ? ['capture', 'owner-change'] : []),
                        ...(rule.leaveRubble ? ['rubble'] : [])] : type === ObjectType.Animation ? ['native-phase', 'native-lifecycle']
                            : ['native-frames', 'native-shadow', 'damage-removal'],
                    runtimeEvidence: 'NOT_ESTABLISHED_BY_STATIC_INVENTORY' };
            };
            const observeObject = (id: string, type: ObjectType, count: number, reason: string, values?: number[]) => {
                try { record.dependencyKeys.push(observe(describeObject(id, type), mapId, count, reason, values)); }
                catch (error) { record.issues.push({ id, type: ObjectType[type], reason, error: String(error) }); }
            };
            if (!tileSets.has(map.theaterType)) {
                const iniName = setting.ini + (edition === 'yr' ? 'md' : '') + '.ini';
                get(iniName);
                const sets = new TileSets(new IniFile(resolveMember(tree, iniName).file));
                const failures: any[] = [];
                sets.loadTileData({ get(name: string) {
                    if (!get(name)) return undefined;
                    try { return new TmpFile(resolveMember(tree, name).file); }
                    catch (error) { failures.push({ source: get(name), issue: 'NATIVE_TMP_DECODER_REJECTED', error: String(error) }); return undefined; }
                } }, setting.extension);
                theaterFailures.set(map.theaterType, failures);
                tileSets.set(map.theaterType, sets);
            }
            const sets = tileSets.get(map.theaterType)!;
            const tileUsage = new Map<number, any[]>();
            for (const tile of map.tiles) {
                const use = tileUsage.get(tile.tileNum) ?? []; use.push(tile); tileUsage.set(tile.tileNum, use);
            }
            for (const [tileNum, tiles] of tileUsage) {
                const entry = sets.getTile(tileNum);
                if (!entry?.files.length) {
                    record.issues.push({ tileNum, issue: 'NATIVE_TILE_MISSING' });
                    record.dependencyKeys.push(observe({ edition, theater: setting.name, kind: 'tmp',
                        id: `unresolved-tile-${tileNum}`, set: sets.getSetNum(tileNum),
                        decision: 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY', issue: 'NATIVE_TILE_MISSING' },
                        mapId, tiles.length, 'PLACED_UNRESOLVED_TILE', tiles.map(t => t.subTile)));
                    continue;
                }
                for (const file of entry.files) {
                    const source = get(file.filename!), reuse = theaterResources.get(setting.name)?.acceptedTmp.get(source.member);
                    const valid = reuse?.sourceHashes[edition] === source.sha256;
                    record.dependencyKeys.push(observe({ edition, theater: setting.name, kind: 'tmp', id: source.member,
                        source, set: sets.getSetNum(tileNum), setName: entry.owner.setName,
                        nativeSlots: file.images.length, decision: valid
                            ? setting.name === 'TEMPERATE' && (unified || baselineTmpMembers.has(source.member))
                                ? 'ACCEPTED_HD_REUSED' : 'AUTHORED_HD_COMPLETE_REVIEW_PENDING'
                            : 'MISSING_AUTHORED_FAMILY',
                        acceptedFamily: valid ? reuse.group : undefined,
                        states: ['native-subtiles', 'random-variants', 'native-contact', 'native-lighting'],
                        runtimeEvidence: 'NOT_ESTABLISHED_BY_STATIC_INVENTORY' }, mapId, tiles.length, 'PLACED_RANDOM_VARIANT', tiles.map(t => t.subTile)));
                    if (tiles.some(t => t.subTile >= file.images.length)) record.issues.push({ tileNum, issue: 'NATIVE_SUBTILE_OUT_OF_RANGE' });
                    if (tiles.some(t => !file.images[t.subTile])) record.issues.push({ tileNum,
                        member: file.filename, issue: 'MAP_REFERENCES_EMPTY_TMP_SLOT' });
                }
                const animation = entry.getAnimation();
                if (animation && tiles.some(t => t.subTile === animation.subTile))
                    observeObject(animation.name, ObjectType.Animation, tiles.filter(t => t.subTile === animation.subTile).length, 'PLACED_TILE_ANIMATION');
            }
            for (const objects of [map.terrains, map.structures, map.vehicles, map.infantries, map.aircrafts, map.smudges]) {
                const counts = new Map<string, { object: any; count: number }>();
                for (const object of objects) {
                    const entry = counts.get(object.name) ?? { object, count: 0 }; entry.count++; counts.set(object.name, entry);
                }
                for (const { object, count } of counts.values()) observeObject(object.name, object.type, count, 'PLACED_OBJECT');
            }
            for (const [id, rule] of rules.smudgeRules) {
                if (isGeneratedGroundSmudge(rule) || map.smudges.some(object => object.name === id)) {
                    observeObject(id, ObjectType.Smudge, 0, 'NORMAL_EXPLOSION_GROUND_DECAL');
                } else {
                    const dependency = describeObject(id, ObjectType.Smudge);
                    record.dependencyKeys.push(observe({ ...dependency,
                        decision: 'DECLARED_INACTIVE_NATIVE_SMUDGE',
                        exception: 'NO_EFFECTIVE_CRATER_OR_BURN_FLAG_AND_NO_MAP_PLACEMENT',
                        generation: { crater: !!rule.crater, burn: !!rule.burn, placed: false },
                        sourceIssue: dependency.source?.status,
                        runtimeEvidence: 'AnimTerrainEffect.spawnSmudges filters both flags before selection; Game.createInitialMapSmudges has no matching placement.'
                    }, mapId, 0, 'DECLARED_RULE_WITHOUT_GROUND_GENERATION_OR_PLACEMENT'));
                }
            }
            for (const name of [rules.crateRules.crateImg, rules.crateRules.waterCrateImg]) {
                if (name && rules.hasObject(name, ObjectType.Overlay))
                    observeObject(name, ObjectType.Overlay, 0, 'NORMAL_GENERATED_CRATE');
            }
            const overlayUsage = new Map<number, number[]>();
            for (const overlay of map.overlays) {
                const values = overlayUsage.get(overlay.id) ?? []; values.push(overlay.value); overlayUsage.set(overlay.id, values);
            }
            const closure = new Set(overlayUsage.keys());
            for (const id of [...closure]) {
                const tibType = OreOverlayTypes.getOverlayTibType(id);
                const base = tibType === OverlayTibType.Ore ? OreOverlayTypes.minIdRiparius
                    : tibType === OverlayTibType.Gems ? OreOverlayTypes.minIdCruentus
                        : tibType === OverlayTibType.Vinifera ? OreOverlayTypes.minIdVinifera
                            : tibType === OverlayTibType.Aboreus ? OreOverlayTypes.minIdAboreus : undefined;
                // OreSpread generates twelve native variants; broad classifier ranges also contain unrelated slots.
                if (base !== undefined) for (let n = base; n < base + 12; n++) closure.add(n);
                if (BridgeOverlayTypes.isLowBridge(id)) {
                    const start = id >= 205 ? 205 : 74;
                    for (let n = start; n <= start + 25; n++) closure.add(n);
                }
                if (BridgeOverlayTypes.isHighBridge(id)) {
                    const start = id >= 237 ? 237 : 24; closure.add(start); closure.add(start + 1);
                }
            }
            for (const id of closure) {
                if (!rules.hasOverlayId(id)) { record.issues.push({ overlayId: id, issue: 'OVERLAY_REGISTRY_MISSING' }); continue; }
                const name = rules.getOverlayName(id), values = overlayUsage.get(id) ?? [];
                if (!rules.hasObject(name, ObjectType.Overlay)) {
                    record.dependencyKeys.push(observe({ edition, theater: setting.name, kind: 'overlay-registry-slot', id: name,
                        decision: 'INTENTIONAL_NATIVE_EXCEPTION', exception: 'UNREGISTERED_NON_RENDERABLE_RANGE_ENDPOINT' },
                        mapId, values.length, 'OVERLAY_STATE_RANGE_ENDPOINT'));
                } else observeObject(name, ObjectType.Overlay, values.length,
                    values.length ? 'PLACED_OVERLAY' : 'NORMAL_GROWTH_DEPLETION_BRIDGE_STATE', values);
            }
            // Normal construction shares accepted M1 catalogs; never equate a placed-only audit with normal play.
            for (const [type, collection] of [[ObjectType.Building, rules.buildingRules], [ObjectType.Infantry, rules.infantryRules],
                [ObjectType.Vehicle, rules.vehicleRules], [ObjectType.Aircraft, rules.aircraftRules]] as const) {
                for (const [id, rule] of collection as Map<string, any>) {
                    if (rule.techLevel >= 0 && rule.techLevel <= 10 && rule.owner?.length)
                        observeObject(id, type, 0, 'NORMAL_BUILDABLE_M1_ROSTER');
                }
            }
            record.dependencyKeys = [...new Set(record.dependencyKeys)].sort();
            record.theaterInitializationFailures = theaterFailures.get(map.theaterType) ?? [];
            if (map.iniFormat < 4) record.issues.push({ issue: 'NATIVE_MAP_FORMAT_UNSUPPORTED', iniFormat: map.iniFormat });
            if (map.startingLocations.length < 2) record.issues.push({ issue: 'NATIVE_SKIRMISH_STARTS_INSUFFICIENT', starts: map.startingLocations.length });
            record.cheapStructureStatus = record.issues.length || map.iniFormat < 4 || map.startingLocations.length < 2
                ? 'BLOCKED_OR_UNRESOLVED_NATIVE_SUPPORT' : record.theaterInitializationFailures.length
                    ? 'BLOCKED_NATIVE_THEATER_INITIALIZATION' : 'PASS_CHEAP_NATIVE_STRUCTURE';
            record.nativeSkirmishMode = {
                declaredFilters: mode.split(/,\s*/), availableFilters: ['standard'], unified,
                source: 'src/offline/loadRetail.ts: offline-client-ui mpmodescd.ini',
                status: unified || mode.split(/,\s*/).includes('standard')
                    ? 'AVAILABLE_STANDARD_MODE' : 'BLOCKED_NATIVE_SKIRMISH_MODE_UNAVAILABLE',
            };
            record.gameplayStatus = record.cheapStructureStatus.startsWith('PASS')
                && record.nativeSkirmishMode.status.startsWith('BLOCKED')
                ? record.nativeSkirmishMode.status : record.cheapStructureStatus;
            record.runtimeEligibility = record.catalogVisibility !== 'SELECTED_NATIVE_CATALOG'
                ? 'ARCHIVE_ONLY_NOT_SELECTABLE_IN_CURRENT_NATIVE_CATALOG'
                : record.gameplayStatus.startsWith('PASS') ? 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH'
                    : 'BLOCKED_NATIVE_GAMEPLAY_SUPPORT';
            if (unified) {
                const entry = officialCatalog.maps.find(entry => entry.edition === edition && entry.source.sha256 === source.sha256);
                record.unifiedSkirmish = entry && { runtimeName: entry.runtimeName, originalModes: entry.originalModes,
                    maxSlots: entry.maxSlots, sourceVerified: true, adaptation: 'STANDARD_MODE_INI_AND_DIALOG_WITH_ORIGINAL_MAP_MECHANISMS' };
                record.runtimeEligibility = !entry ? 'BLOCKED_UNRESOLVED_OFFICIAL_IDENTITY'
                    : record.gameplayStatus.startsWith('PASS') ? 'ELIGIBLE_FOR_FOCUSED_NATIVE_MATCH' : 'BLOCKED_NATIVE_GAMEPLAY_SUPPORT';
            }
            if (record.issues.length) issues.push({ mapId, issues: record.issues });
        } catch (error) { record.gameplayStatus = 'BLOCKED_MAP_PARSE_OR_NATIVE_SUPPORT'; record.issues.push(String(error)); issues.push({ mapId, error: String(error) }); }
        console.log(JSON.stringify({ mapId, theater: record.theater, status: record.gameplayStatus,
            dependencies: record.dependencyKeys.length, issues: record.issues.length }));
    }
}
const allRows = [...rows.values()];
const sourceGroups = new Map<string, any>();
for (const row of allRows) {
    const key = `${row.theater}:${row.kind}:${row.source?.member ?? row.id}:${row.source?.sha256 ?? 'unresolved'}`;
    const group = sourceGroups.get(key) ?? { key, theater: row.theater, kind: row.kind,
        member: row.source?.member, sha256: row.source?.sha256, decisions: [], identities: [], rowKeys: [], maps: [] };
    group.decisions = [...new Set([...group.decisions, row.decision])];
    group.identities = [...new Set([...group.identities, row.id])];
    group.rowKeys.push(row.key); group.maps = [...new Set([...group.maps, ...Object.keys(row.usage)])];
    sourceGroups.set(key, group);
}
const groups = [...sourceGroups.values()];
const theaters = Object.values(settings).map(setting => {
    const selectedMaps = maps.filter(m => m.classification === 'OFFICIAL_SKIRMISH' && m.theater === setting.name);
    const selectedGroups = groups.filter(g => g.theater === setting.name);
    return { theater: setting.name, maps: selectedMaps.length, blockedMaps: selectedMaps.filter(m => !m.gameplayStatus.startsWith('PASS')).length,
        resources: selectedGroups.length, gapResources: selectedGroups.filter(g => g.decisions.includes('MISSING_AUTHORED_FAMILY')).length,
        gapsByKind: Object.fromEntries([...new Set(selectedGroups.map(g => g.kind))].map(kind =>
            [kind, selectedGroups.filter(g => g.kind === kind && g.decisions.includes('MISSING_AUTHORED_FAMILY')).length])),
        production: !selectedMaps.length ? 'NOT_IN_SCOPE_NO_OFFICIAL_MAP'
            : setting.name === 'TEMPERATE' ? 'ACCEPTED_RESOURCE_REUSE'
            : unified ? 'AUTHORIZED_M2_4_NEW_ARTWORK_PENDING' : 'DEFERRED_NEW_ARTWORK' };
});
const duplicateGroups = (field: string) => Object.values(maps.filter(m => m.source).reduce((result: any, map: any) => {
    const key = field === 'sourceHash' ? map.source.sha256 : hashJson([map.geometryHash, map.placementHash]);
    (result[key] ??= []).push(map.mapId); return result;
}, {})).filter((ids: any) => ids.length > 1);
if (scopedMapIds) for (const id of scopedMapIds)
    if (!maps.some(map => map.mapId === id)) throw Error(`Scoped official map was not resolved: ${id}`);
save('inventory.json', { schema: unified ? 'm2-4-official-map-inventory-v1' : 'm2-3-official-map-inventory-v1',
    baseline: unified ? 'CURRENT_TASK_WORKTREE_SOURCE' : 'd38f136',
    status: scopedMapIds ? 'SCOPED_INVENTORY_COMPLETE_FULL_SCOPE_NOT_REPEATED'
        : 'INVENTORY_COMPLETE_PRODUCTION_AND_RUNTIME_PENDING',
    scope: scopedMapIds ? { kind: 'EXPLICIT_OFFICIAL_MAP_SUBSET', mapIds: scopedMapIds,
        disclosure: 'Global catalog/archive discovery is retained; dependency and map totals cover this subset only.' }
        : { kind: 'FULL_OFFICIAL_MAP_SCOPE' }, archivePins, catalogs,
    selectedResources: { terrain: terrainPointer, environment: readJson('.local/environment-selection.json'),
        ...(unified ? { theaters: Object.fromEntries([...theaterResources].map(([theater, resource]) =>
            [theater, { terrain: resource.terrainPointer, environment: resource.environmentPointer }])) } : {}),
        ui: readJson('.local/ui-selection.json'), prepared: readJson('desktop/prepared-hd-contract.json') },
    counts: { catalogEntries: catalogs.reduce((n, c) => n + c.declaredEntries, 0), inventoriedMapEntries: maps.length,
        officialSkirmishEntries: maps.filter(m => m.classification === 'OFFICIAL_SKIRMISH').length,
        excludedCooperativeCampaignEntries: maps.filter(m => m.classification === 'OFFICIAL_COOPERATIVE_CAMPAIGN_EXCLUDED').length,
        excludedArchiveCampaignOrUnclassifiedEntries: maps.filter(m => m.classification === 'ARCHIVE_CAMPAIGN_OR_UNCLASSIFIED_EXCLUDED').length,
        excludedArchiveCustomOrUnclassifiedEntries: maps.filter(m => m.classification === 'ARCHIVE_CUSTOM_OR_UNCLASSIFIED_EXCLUDED').length,
        totalExcludedEntries: maps.filter(m => m.classification !== 'OFFICIAL_SKIRMISH').length },
    theaters, maps, rows: allRows, resourceGroups: groups, archivedMaps, issues,
    duplicates: { identicalBytes: duplicateGroups('sourceHash'), matchingPlacements: duplicateGroups('semantics'),
        policy: 'Do not equate duplicate map bytes/placements with edition rules or source identity.' },
    exclusions: ['Campaign artwork/gameplay', 'Loose/custom/user maps', 'Windows profiling',
        ...(unified ? [] : ['Other-theater new artwork'])],
    boundaries: ['Source archives are allowlisted local imports, not independently authenticated retail media.',
        'Unresolved catalog entries remain in the denominator.', 'Static coverage does not prove native runtime binding or user visual acceptance.'] });
save('source-provenance.json', { schema: 'm2-3-native-source-provenance-v1', archivePins, sources: [...sourcePins.values()] });
save('gaps.json', { schema: 'm2-3-deduplicated-resource-gaps-v1', theaters,
    groups: groups.filter(g => g.decisions.some((d: string) => ['MISSING_AUTHORED_FAMILY',
        'EXISTING_HD_BINDING_OR_REGISTRATION_PROBLEM', 'UNSUPPORTED_OR_UNRESOLVED_DEPENDENCY'].includes(d))) });
save('matrix.json', { schema: 'm2-3-map-resource-matrix-v1', maps: maps.map(m => ({ mapId: m.mapId,
    classification: m.classification, theater: m.theater, gameplayStatus: m.gameplayStatus, dependencyKeys: m.dependencyKeys })) });
console.log(JSON.stringify({ catalogs, theaters, rows: allRows.length, resourceGroups: groups.length, issues: issues.length }));
