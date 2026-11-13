import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { campaignCrusherZones, campaignZoneCellKind, revealCampaignZone } from '../../src/game/campaign/CampaignZones';
import { LandType } from '../../src/game/type/LandType';
import { TerrainType } from '../../src/engine/type/TerrainType';
import { AttackOrder } from '../../src/game/order/AttackOrder';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all07t.map').getBytes();
const sourceSha256 = '3925c1211d86938a7137ff0df11cba85c59d3ae75742221d5e2d4d502d33c103';
const read = () => new CampaignDefinition('ra2', 'all07t.map', new TextDecoder().decode(bytes), undefined,
    { sourceSha256, semanticsVersion: 21 });

test('original Allied07 retains three zone reveals, source naval goals, local AI, difficulty chains and media', () => {
    expect(sha256(bytes)).toBe(sourceSha256);
    const original = read(); original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size,
        original.aiTriggers.size]).toEqual([57, 71, 87, 65, 47]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('TEMPERATE');
    expect(original.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(true);
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1500, 1000, 750]);
    expect(original.triggers.get('0BA51E1C')!.actions.map(action => [action.opcode, action.params[1]]))
        .toEqual([[18, '6'], [18, '7'], [18, '9']]);
    expect(original.triggers.get('07A173AC')!.events.map(event => [event.opcode, event.params[1]])).toEqual([[10, '14']]);
    expect(original.triggers.get('07A17A6C')!.events.map(event => [event.opcode, event.params[1]])).toEqual([[11, '13']]);
    expect(original.triggers.get('07C3C06C')!.difficulties).toEqual({ easy: true, normal: false, hard: false });
    expect(original.triggers.get('0CEA003C')!.events[0].params[1]).toBe('30');
    expect(original.triggers.get('04178E9C')!.events[0].params[1]).toBe('10');
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a07_f00e', 'before-mission'], ['a07_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all06u.map')).toBe(20); expect(campaignMissionSemantics('all07t.map')).toBe(21);
    expect(campaignMissionImplemented('ra2', 'all07t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all08u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all11t.map')).toBe(true);
});

test('Crusher zones join crushable sandbags, exclude infantry-only terrain and retain disconnected land islands', () => {
    const cells = [0, 1, 0, 4, 0, 5, 0, 7].map((kind, rx) => ({ rx, ry: 0, z: 0, kind }));
    const zones = campaignCrusherZones(cells), zone = (x: number) => zones.get(`${x},0`);
    expect(zone(0)).toBe(zone(1)); expect(zone(0)).toBe(zone(2)); expect(zone(0)).not.toBe(zone(4));
    expect(zone(4)).not.toBe(zone(6)); expect([zone(3), zone(5), zone(7)]).toEqual([1, 1, 1]);
    expect(campaignCrusherZones([...cells].reverse())).toEqual(zones);
    expect(cells.map(cell => cell.kind)).toEqual([0, 1, 0, 4, 0, 5, 0, 7]);
});

test('zone diagonal/ramp edges obey source height limits and the installed horizontal scanline threshold', () => {
    const cells = [{ rx: 0, ry: 0, z: 0, kind: 0 }, { rx: 1, ry: 1, z: 1, kind: 1 },
        { rx: 2, ry: 2, z: 3, kind: 0 }, { rx: 3, ry: 2, z: 6, kind: 0 },
        { rx: 4, ry: 2, z: 10, kind: 0 }];
    const zones = campaignCrusherZones(cells);
    expect(zones.get('0,0')).toBe(zones.get('1,1')); expect(zones.get('1,1')).not.toBe(zones.get('2,2'));
    expect(zones.get('2,2')).toBe(zones.get('3,2')); expect(zones.get('3,2')).not.toBe(zones.get('4,2'));
});

function world(tiles: any[], contents = new Map<any, any[]>()) {
    const revealed: any[] = [], shroud = { revealAround: (tile: any, radius: number) => revealed.push([tile, radius]) };
    const game: any = { localPlayer: {}, map: { tiles: { getAll: () => tiles }, getTheaterType: () => 0,
        tileOccupation: { getGroundObjectsOnTile: (tile: any) => contents.get(tile) ?? [], getBridgeOnTile: () => undefined },
        mapBounds: { getRawLocalSize: () => ({ x: 0, y: -10, width: 20, height: 20 }),
            getFullSize: () => ({ width: 40, height: 40 }) } },
        rules: { getLandRules: (land: number) => ({ getSpeedModifier: () => land === LandType.Cliff ? 0 : 1 }) },
        mapShroudTrait: { getPlayerShroud: (owner: any) => { expect(owner).toBe(game.localPlayer); return shroud; } } };
    return { game, revealed };
}

test('source cell classes ignore transient actors/buildings, honor overlay priority and retain partial tree occupation', () => {
    const tile: any = { rx: 1, ry: 1, z: 0, landType: LandType.Clear }, objects: any[] = [];
    const { game } = world([tile], new Map([[tile, objects]]));
    const object = (type: string, rules = {}) => ({ rules, isDestroyed: false,
        isTerrain: () => type === 'terrain', isOverlay: () => type === 'overlay', isBuilding: () => type === 'building' });
    objects.push(object('building'), object('vehicle')); expect(campaignZoneCellKind(game, tile)).toBe(0);
    const tree = object('terrain', { getOccupationBits: () => 4 }); objects.push(tree);
    expect(campaignZoneCellKind(game, tile)).toBe(5);
    tree.rules = { getOccupationBits: () => 7 }; expect(campaignZoneCellKind(game, tile)).toBe(2);
    objects.push(object('overlay', { crushable: true, wall: true })); expect(campaignZoneCellKind(game, tile)).toBe(1);
    objects.pop(); objects.length = 0;
    for (const [land, kind] of [[LandType.Water, 4], [LandType.Beach, 3], [LandType.Cliff, 6]]) {
        tile.landType = land; expect(campaignZoneCellKind(game, tile)).toBe(kind);
    }
    tile.rx = 40; expect(campaignZoneCellKind(game, tile)).toBe(7);
});

test('zone reveal affects each matching cell with radius2, including the reserved nonpassable zone, with no navigation access', () => {
    const tiles: any[] = [LandType.Clear, LandType.Clear, LandType.Water, LandType.Clear, LandType.Beach]
        .map((landType, index) => ({ rx: index + 1, ry: 1, z: 0, landType, terrainType: TerrainType.Clear }));
    const { game, revealed } = world(tiles);
    revealCampaignZone(game, tiles[0]); expect(revealed).toEqual([[tiles[0], 2], [tiles[1], 2]]);
    revealed.length = 0; revealCampaignZone(game, tiles[2]);
    expect(revealed).toEqual([[tiles[2], 2], [tiles[4], 2]]);
    game.map.tileOccupation.getBridgeOnTile = (tile: any) => tile === tiles[1] ? {} : undefined;
    revealed.length = 0; expect(() => revealCampaignZone(game, tiles[0])).toThrow('source qualification');
    expect(revealed).toEqual([]);
});

test('action18 uses its integer source waypoint and local shroud while old journals stay version gated', () => {
    const original = read(), trigger = original.triggers.get('0BA51E1C')!, action = trigger.actions[0];
    const tile: any = { rx: 1, ry: 1, z: 0, landType: LandType.Clear, terrainType: TerrainType.Clear };
    const { game, revealed } = world([tile]);
    game.map.getTileAtWaypoint = (id: number) => id === 6 ? tile : undefined;
    const host: any = { launch: { semanticsVersion: 21 }, trace: [], machine: { tick: 0 }, game };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(revealed).toEqual([[tile, 2]]);
    host.launch.semanticsVersion = 20; expect(execute).toThrow('interpreter 21');
});

test('source waypoint attacks cross AI shroud only in21; player Ctrl-clicks and recorded20 remain guarded', () => {
    const weapon = { rules: {}, warhead: { rules: {} } }, orders: any[] = [];
    const unit: any = { owner: {}, isSpawned: true, rules: {}, moveTrait: { isDisabled: () => false },
        attackTrait: { isDisabled: () => false, selectWeaponVersus: () => weapon },
        isUnit: () => true, isBuilding: () => false, unitOrderTrait: { addOrder: (order: any) => orders.push(order) } };
    const target: any = { tile: {}, isBuilding: () => true, isOverlay: () => false };
    const game: any = { campaign: { launch: { semanticsVersion: 21 } }, isValidTarget: () => true,
        map: { tileOccupation: {}, tiles: {}, getGroundObjectsOnTile: () => [] },
        mapShroudTrait: { getPlayerShroud: () => ({ isShrouded: () => true }) },
        createTarget: (obj: any, tile: any) => ({ obj, tile }) };
    const source = () => new AttackOrder(game, { forceAttack: true, campaignScriptTarget: true })
        .set(unit, game.createTarget(target, target.tile));
    expect(new AttackOrder(game, { forceAttack: true }).set(unit, game.createTarget(target, target.tile)).isValid()).toBe(false);
    expect(source().isValid()).toBe(true);
    const host: any = { semanticsVersion: 21, game, orders: { create: () => { throw Error('Source21 needs its explicit mission policy'); } } };
    (CampaignTeams.prototype as any).attack.call(host, { members: [unit] }, target, true);
    expect(orders).toHaveLength(1); expect(orders[0].isValid()).toBe(true);
    game.campaign.launch.semanticsVersion = 20; expect(source().isValid()).toBe(false);
    host.semanticsVersion = 20; host.orders.create = () => new AttackOrder(game, { forceAttack: true });
    (CampaignTeams.prototype as any).attack.call(host, { members: [unit] }, target, true);
    expect(orders).toHaveLength(1);
});

test('the original naval-building victory and player-loss chains preserve their separate five-second delays', () => {
    for (const [source, result, opcode] of [['07A173AC', '09C9877C', 1], ['07A17A6C', '09C98F3C', 2]] as const) {
        const original = read(), actions: any[] = []; let achieved = false;
        const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => [], condition: () => achieved,
            action: action => actions.push({ tick: machine.tick, ...action }) });
        for (const id of machine.states.keys()) machine.setEnabled(id, id === source);
        machine.update(); expect(actions).toEqual([]); achieved = true; machine.update();
        const enabledTick = machine.states.get(result)!.enabledTick;
        for (let i = 0; i < 74; i++) machine.update();
        expect(actions.filter(action => [1, 2].includes(action.opcode))).toEqual([]);
        machine.update(); const final = actions.filter(action => action.opcode === opcode);
        expect(final).toHaveLength(1); expect(final[0].tick - enabledTick).toBe(75);
    }
});
