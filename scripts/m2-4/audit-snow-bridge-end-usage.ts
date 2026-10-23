// Distinguish source bridge dependencies from actual original overlay placements.
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
import { BridgeOverlayTypes } from '../../src/game/map/BridgeOverlayTypes';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const output = process.argv[2];
assert(output, 'A new output file is required');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const sourceAudit = JSON.parse(readFileSync('.artifacts/m2-4/source-audit-v3/audit.json', 'utf8'));
const snowIds = new Set(sourceAudit.maps.filter(row => row.theater === 'SNOW').map(row => row.mapId));
const rows = [], declarations = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const base = new IniFile(resolveMember(tree, edition === 'yr' ? 'rulesmd.ini' : 'rules.ini').file);
    const rules = new Rules(adaptRetailRules(base).rules);
    const ends = Object.fromEntries([...rules.overlayTypes].filter(([, name]) => /^LOBRDGE[1-4]$/.test(name)));
    assert.equal(Object.keys(ends).length, 4);
    assert(Object.keys(ends).every(id => !BridgeOverlayTypes.isBridge(Number(id)) &&
        !BridgeOverlayTypes.isBridgePlaceholder(Number(id))));
    declarations.push({ edition, ends });
    for (const entry of catalog.maps.filter(entry => entry.edition === edition && snowIds.has(entry.mapId))) {
        const owner = tree.find(container => container.path === entry.source.archive)!;
        let file: VirtualFile;
        if ('memberId' in entry.source) {
            const member = owner.mix.getEntries().find(row => row.hash === entry.source.memberId)!;
            const mix = owner.mix as any;
            file = VirtualFile.factory(mix.stream, entry.source.member, mix.dataStart + member.offset, member.length);
        } else file = owner.mix.openFile(entry.source.member);
        assert.equal(sha(file.getBytes()), entry.source.sha256);
        const map = new MapFile(file);
        assert(!map.getSection('OverlayTypes')?.entries.size, 'Map registry override requires its own merged Rules lookup');
        assert(map.overlays.every(overlay => Number.isInteger(overlay.id) && overlay.id >= 0 && overlay.id < 255));
        const placements = map.overlays.filter(overlay => ends[String(overlay.id)] !== undefined);
        const actions = map.getSection('Actions');
        const actionTypes: number[] = [];
        for (const raw of actions?.entries.values() ?? []) {
            assert.equal(typeof raw, 'string');
            const values = (raw as string).split(',');
            const count = Number(values.shift());
            assert(Number.isInteger(count) && values.length >= count * 8);
            for (let index = 0; index < count; index++) actionTypes.push(Number(values[index * 8]));
        }
        const crates = map.getSection('CrateRules');
        const bridges = map.overlays.filter(overlay => BridgeOverlayTypes.isBridge(overlay.id));
        const bridgeUsage = bridges.map(overlay => ({ ...overlay,
            kind: BridgeOverlayTypes.isLowBridge(overlay.id) ? 'low' : 'high',
            material: BridgeOverlayTypes.getOverlayBridgeType(overlay.id) === 1 ? 'concrete' : 'wood',
            xDirection: BridgeOverlayTypes.isXBridge(overlay.id) }));
        rows.push({ mapId: entry.mapId, sourceSha256: entry.source.sha256,
            overlays: map.overlays.length,
            placements: placements.map(overlay => ({ ...overlay, name: ends[String(overlay.id)] })),
            actionCount: actions?.entries.size ?? 0, actions: actions?.entries.size ? actions.toString() : '',
            actionTypes, bridgeUsage,
            nativeRepairHuts: [...(map.getSection('Structures')?.entries.values() ?? [])]
                .filter(value => typeof value === 'string' && value.toUpperCase().includes(',CABHUT,')),
            crateImages: {
                land: crates?.getString('CrateImg', rules.crateRules.crateImg) ?? rules.crateRules.crateImg,
                water: crates?.getString('WaterCrateImg', rules.crateRules.waterCrateImg) ?? rules.crateRules.waterCrateImg,
            },
            unknownActionTypes: map.unknownActionTypes, unknownEventTypes: map.unknownEventTypes });
    }
}
assert.equal(rows.length, 91);
assert(rows.every(row => !row.placements.length && !Object.keys(row.unknownActionTypes).length &&
    row.actionTypes.every(type => type === 99 || type === 108) &&
    row.crateImages.land === 'CRATE' && row.crateImages.water === 'WCRATE'));
const inventoryPath = '.artifacts/m2-4/inventory-v6/inventory.json';
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const excluded = inventory.resourceGroups.filter(row => row.theater === 'SNOW' &&
    row.kind === 'overlay' && /^lobrdge[1-4]\.sno$/.test(row.member));
assert.equal(excluded.length, 4);
const receipt = { schema: 'm2-4-snow-low-bridge-end-usage-v2', status: 'PASS_UNUSED_IN_SCOPE_NOT_HD_COVERED',
    inventoryPath, inventorySha256: sha(readFileSync(inventoryPath)),
    catalogSha256: sha(readFileSync('src/offline/officialSkirmishCatalog.json')),
    sourceAuditSha256: sha(readFileSync('.artifacts/m2-4/source-audit-v3/audit.json')),
    declarations, maps: rows, placementCount: rows.reduce((count, row) => count + row.placements.length, 0),
    distinctMapSources: new Set(rows.map(row => row.sourceSha256)).size,
    overlayPlacementsExamined: rows.reduce((count, row) => count + row.overlays, 0),
    excludedSourceGroups: excluded,
    mapsWithActions: rows.filter(row => row.actionCount > 0).map(row => row.mapId),
    runtimePath: ['src/game/map/BridgeOverlayTypes.ts', 'src/engine/renderable/entity/Overlay.ts',
        'src/game/map/Bridges.ts', 'src/game/trigger/executor/CreateCrateExecutor.ts',
        'src/game/trait/CrateGeneratorTrait.ts', 'src/data/map/trigger/TriggerActionType.ts']
        .map(file => ({ file, sha256: sha(readFileSync(file)) })),
    runtimeUseReview: 'Bridge aggregation uses the two 26-member low ranges; destruction and repair use BridgeOverlayTypes ranges. All map actions are ambient sound (99) or crate creation (108), whose native land/water image names are CRATE/WCRATE. End IDs 122..125 occur in none of these paths.',
    policy: 'Four default scanner dependencies are unused in this official Snow scope, not HD-covered. Original sources, indices, declarations, maps and earlier evidence remain retained.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, maps: rows.length, placements: receipt.placementCount,
    mapsWithActions: receipt.mapsWithActions, declarations }));
