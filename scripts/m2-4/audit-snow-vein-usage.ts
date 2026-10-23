// Prove whether the original Snow maps or their normal resource creators can use VEINS.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { Rules } from '../../src/game/rules/Rules';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { OreSpread } from '../../src/game/map/OreSpread';
import { OverlayTibType } from '../../src/engine/type/OverlayTibType';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const output = process.argv[2];
assert(output, 'A new receipt path is required');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const inventoryFile = '.artifacts/m2-4/inventory-v6/inventory.json';
const inventory = JSON.parse(readFileSync(inventoryFile, 'utf8'));
const sourceAuditFile = '.artifacts/m2-4/source-audit-v3/audit.json';
const sourceAudit = JSON.parse(readFileSync(sourceAuditFile, 'utf8'));
const snowIds = new Set(sourceAudit.maps.filter((map: any) => map.theater === 'SNOW').map((map: any) => map.mapId));
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const maps: any[] = [], declarations: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const base = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const rules = new Rules(adaptRetailRules(base).rules);
    const veinIds = [...rules.overlayTypes].filter(([, name]) => /VEIN/i.test(name)).map(([id]) => id);
    assert(veinIds.length && veinIds.every(id => rules.getOverlayName(id).includes('VEIN')));
    declarations.push({ edition, veinIds, names: veinIds.map(id => rules.getOverlayName(id)) });
    for (const entry of catalog.maps.filter(entry => entry.edition === edition && snowIds.has(entry.mapId))) {
        const owner = tree.find(container => container.path === entry.source.archive)!;
        const member = owner.mix.getEntries().find(row => row.hash === entry.source.memberId)!;
        const mix = owner.mix as any;
        const file = entry.source.memberId === undefined ? owner.mix.openFile(entry.source.member)
            : VirtualFile.factory(mix.stream, entry.source.member, mix.dataStart + member.offset, member.length);
        assert.equal(sha(file.getBytes()), entry.source.sha256);
        const map = new MapFile(file);
        assert(!map.getSection('OverlayTypes')?.entries.size, 'Registry overrides require separate merged auditing');
        const placements = map.overlays.filter(overlay => veinIds.includes(overlay.id));
        const monsters = [...map.terrains, ...map.structures, ...map.vehicles, ...map.infantries]
            .filter(object => /VEIN/i.test(object.name));
        const generated = new Map<number, Set<number>>();
        for (const type of [OverlayTibType.Ore, OverlayTibType.Gems, OverlayTibType.Vinifera, OverlayTibType.Aboreus]) {
            const ids = new Set(map.tiles.map(tile => OreSpread.calculateOverlayId(type, tile)!));
            assert([...ids].every(id => Number.isInteger(id) && !veinIds.includes(id)));
            generated.set(type, ids);
        }
        const actionTypes: number[] = [];
        for (const raw of map.getSection('Actions')?.entries.values() ?? []) {
            assert.equal(typeof raw, 'string');
            const values = (raw as string).split(',');
            const count = Number(values.shift());
            assert(Number.isInteger(count) && values.length >= count * 8);
            for (let index = 0; index < count; index++) actionTypes.push(Number(values[index * 8]));
        }
        const crates = map.getSection('CrateRules');
        const crateImages = { land: crates?.getString('CrateImg', rules.crateRules.crateImg) ?? rules.crateRules.crateImg,
            water: crates?.getString('WaterCrateImg', rules.crateRules.waterCrateImg) ?? rules.crateRules.waterCrateImg };
        assert(!placements.length && !monsters.length && !Object.keys(map.unknownActionTypes).length);
        assert(actionTypes.every(type => type === 99 || type === 108));
        assert(crateImages.land === 'CRATE' && crateImages.water === 'WCRATE');
        maps.push({ mapId: entry.mapId, sourceSha256: entry.source.sha256, overlayCount: map.overlays.length,
            tileCount: map.tiles.length, placements, monsters, actionTypes, crateImages,
            originalVeinGrowthEnabled: map.getSection('Basic')?.getString('VeinGrowthEnabled'),
            generatedOverlayIds: Object.fromEntries([...generated].map(([type, ids]) => [type, [...ids].sort((a, b) => a - b)])) });
    }
}
assert.equal(maps.length, 91);
const unusedSourceGroups = inventory.resourceGroups.filter((group: any) => group.theater === 'SNOW'
    && group.kind === 'overlay' && group.member === 'veins.sno');
assert.equal(unusedSourceGroups.length, 1);
const paths = ['src/game/map/OreSpread.ts', 'src/game/map/OreOverlayTypes.ts',
    'src/game/gameobject/trait/TiberiumTreeTrait.ts', 'src/game/trait/CrateGeneratorTrait.ts',
    'src/game/trigger/executor/CreateCrateExecutor.ts', 'src/data/map/trigger/TriggerActionType.ts'];
const receipt = { schema: 'm2-4-snow-vein-source-usage-v1', status: 'PASS_UNUSED_IN_SCOPE_NOT_HD_COVERED',
    inventoryFile, inventorySha256: sha(readFileSync(inventoryFile)), sourceAuditSha256: sha(readFileSync(sourceAuditFile)),
    catalogSha256: sha(readFileSync('src/offline/officialSkirmishCatalog.json')), declarations, maps,
    placementCount: 0, distinctMapSources: new Set(maps.map(map => map.sourceSha256)).size,
    overlayPlacementsExamined: maps.reduce((sum, map) => sum + map.overlayCount, 0),
    generatedCoordinatesExamined: maps.reduce((sum, map) => sum + map.tileCount, 0), unusedSourceGroups,
    runtimePaths: paths.map(file => ({ file, sha256: sha(readFileSync(file)) })),
    rootCause: 'Inventory expanded the broad Riparius classification interval 102..127, although normal OreSpread emits only 102..113. The interval includes the unused VEINS registry slot and bridge ends. No original Snow placement, seed/monster, native resource creator or map action reaches VEINS.',
    policy: 'Retain original source and all maps. No HD coverage, mechanism repair or resource-production claim is made for this unused source; explicit scope reconciliation may exclude it from missing actual-use artwork.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, maps: maps.length, placementCount: 0,
    distinctMapSources: receipt.distinctMapSources, generatedCoordinatesExamined: receipt.generatedCoordinatesExamined }));
