import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { EventType } from '../../src/game/event/EventType';
import { EnterTransportTask } from '../../src/game/gameobject/task/EnterTransportTask';
import { CampaignBaseBuilder } from '../../src/game/campaign/CampaignBaseBuilder';
import { TaskStatus } from '../../src/game/gameobject/task/system/TaskStatus';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov04s.map').getBytes();
expect(sha256(bytes)).toBe('a0a95b26639cc1d4d916dea3a264a18e409bef3d2b84c245e67cd250defc2100');
const source = () => new CampaignDefinition('ra2', 'sov04s.map', new TextDecoder().decode(bytes));

test('Soviet 04 retains its original 38 triggers, 53 teams and physical engineer-IFV boarding script', () => {
    const definition = source(); definition.assertValid();
    expect([definition.triggers.size, definition.teams.size, definition.scripts.size, definition.aiTriggers.size]).toEqual([38, 53, 46, 21]);
    expect(campaignPreflight(definition, campaignCapabilities)).toEqual([]);
    expect(definition.scripts.get('0BA0F48C')!.instructions.map(line => line.opcode)).toEqual([14, 3, 3, 8, 46]);
    expect(definition.taskForces.get('0BA0EDAC')!.units).toEqual([{ count: 1, type: 'ENGINEER' }, { count: 1, type: 'FV' }]);
});

test('build events require the correct producer, native type index and actual production event', () => {
    const owner = {}, other = {}, trigger = { house: 'Player' };
    const building = { owner, rules: { index: 67 } };
    const plane = { owner, rules: { index: 1 }, isAircraft: () => true, isInfantry: () => false, isVehicle: () => false };
    const host: any = { launch: { semanticsVersion: 6 }, events: [], targets: () => [], resolveHouse: () => owner };
    const check = (opcode: number, parameter: string) => (CampaignRuntime.prototype as any).check.call(host, { opcode, params: ['0', parameter] }, trigger);
    host.events = [{ type: EventType.FactoryProduceUnit, target: building }]; expect(check(19, '67')).toBe(false);
    host.events = [{ type: EventType.BuildingPlace, target: building }]; expect(check(19, '67')).toBe(true);
    expect(check(19, '1')).toBe(false); building.owner = other; expect(check(19, '67')).toBe(false);
    host.events = [{ type: EventType.FactoryProduceUnit, target: plane }]; expect(check(22, '1')).toBe(true);
    expect(check(20, '1')).toBe(false); expect(check(21, '1')).toBe(false);
    host.events = []; expect(check(22, '1')).toBe(false);
});

test('load-onto-transport waits for normal physical boarding before the source IFV route can begin', () => {
    const definition = source(), tasks: any[] = [], objects: any[] = [], owner = { name: 'BadGuy1', getOwnedObjects: () => objects };
    const game: any = { map: {} }, manager: any = new CampaignTeams(definition, game, () => owner, () => {}, 4);
    const actor = (id: number, name: string): any => ({ id, name, owner, isSpawned: true, rules: { size: 1 },
        isUnit: () => true, isInfantry: () => name === 'ENGINEER',
        unitOrderTrait: { clearOrders() {}, cancelAllTasks() {}, addTask: (task: any) => tasks.push(task) } });
    const engineer = actor(1, 'ENGINEER'), ifv = actor(2, 'FV');
    ifv.transportTrait = { units: [], getAvailableCapacity: () => 1, unitFitsInside: () => true };
    objects.push(engineer, ifv);
    const team = manager.create('0BA0EEBC'); manager.update(0);
    expect(team.line).toBe(0); expect(engineer.isSpawned).toBe(true); expect(ifv.transportTrait.units).toEqual([]);
    expect(tasks.length).toBe(1); expect(tasks[0]).toBeInstanceOf(EnterTransportTask); expect(tasks[0].target).toBe(ifv);
    manager.update(1); expect(team.line).toBe(0);
    // The ordinary EnterTransportTask performs limbo and emits the boarding
    // events in-game; this fixture models its completed external contract.
    engineer.isSpawned = false; engineer.limboData = { inTransport: true }; ifv.transportTrait.units.push(engineer);
    tasks[0].status = TaskStatus.Finished; manager.update(2); expect(team.line).toBe(1);
});

test('Production Begins enables the original zero-PercentBuilt landing base without a construction RNG gate', () => {
    const definition = source(), pushes: any[] = [], active = new Set<any>();
    const rules = { name: 'GAPOWR' }, queue = { status: 0, push: (...args: any[]) => pushes.push(args) };
    const owner = { name: 'BadGuy1', production: { isAvailableForProduction: () => true, getQueueForObject: () => queue } };
    const game = { map: { tiles: { getByMapCoords: () => ({}) }, getGroundObjectsOnTile: () => [] },
        rules: { getBuilding: () => rules }, sellTrait: { computePurchaseValue: () => 800 },
        getConstructionWorker: () => ({ canPlaceAt: () => true }),
        generateRandomInt: () => { throw Error('Source base construction must not invent RNG decisions'); } };
    const builder = new CampaignBaseBuilder(definition, game, reference => reference === 'BadGuy1 House' ? owner : {}, active, 5);
    expect(definition.ini.getSection('BadGuy1 House')!.getNumber('PercentBuilt')).toBe(0);
    builder.update(0); expect(pushes).toEqual([]);
    active.add(owner); builder.update(1); expect(pushes).toEqual([[rules, 1, 800]]);
    expect(builder.trace).toEqual([{ tick: 1, house: 'BadGuy1', node: 0, type: 'GAPOWR', phase: 'queued' }]);
    expect(builder.snapshot()).toEqual({ next: [] });
});

test('a blocked original defense node cannot prevent the rest of the landing base from being built', () => {
    const definition = source(), pushed: string[] = [], checked: any[] = [], defense = { name: 'GAPILL' };
    const owner: any = { name: 'BadGuy1', production: { isAvailableForProduction: () => true,
        getQueueForObject: (rules: any) => rules === defense ? { status: 3, getFirst: () => ({ rules }) }
            : { status: 0, push: (rules: any) => pushed.push(rules.name) } } };
    const existing: any = { '115,41': 'GAPOWR', '104,34': 'GAPILE', '109,46': 'GAPILL', '103,40': 'GAPILL' };
    const game = { map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) }, getGroundObjectsOnTile: (tile: any) => {
        const name = existing[[tile.rx, tile.ry].join(',')]; return name ? [{ name, tile, isBuilding: () => true }] : [];
    } }, rules: { getBuilding: (name: string) => name === 'GAPILL' ? defense : { name } }, sellTrait: { computePurchaseValue: () => 1000 },
        getConstructionWorker: () => ({ canPlaceAt: (name: string, tile: any, options: any) => {
            checked.push({ name, tile, options }); return name === 'GAREFN';
        } }) };
    const builder = new CampaignBaseBuilder(definition, game, reference => reference === 'BadGuy1 House' ? owner : {}, new Set([owner]), 5);
    builder.update(0); expect(pushed).toEqual(['GAREFN']); expect(builder.trace[0].node).toBe(6);
    expect(checked.every(check => check.options.ignoreAdjacent && check.options.ignoreShroud && check.options.normalizedTile)).toBe(true);
    expect(definition.ini.getSection('BadGuy1 House')!.getString('004')).toBe('GAPILL,116,47');
});

test('original general target categories distinguish base defenses, harvesters and zero-index construction factories', () => {
    const own = {}, enemy = {}, actor = (id: number, building: boolean, rules: any, extra = {}): any => ({
        id, owner: enemy, isSpawned: true, tile: { rx: id, ry: id }, rules, isTechno: () => true,
        isBuilding: () => building, isInfantry: () => false, isVehicle: () => !building, isAircraft: () => false, ...extra });
    const power = actor(1, true, { power: 100 }), defense = actor(2, true, { isBaseDefense: true });
    const miner = actor(3, false, {}, { harvesterTrait: {} }), tank = actor(4, false, {}), yard = actor(5, true, { factory: 0 });
    const game = { map: {}, world: { getAllObjects: () => [power, defense, miner, tank, yard] },
        isValidTarget: () => true, alliances: { areAllied: () => false } };
    const manager: any = new CampaignTeams(source(), game, () => own, () => {}, 5);
    const team = { owner: own, members: [{ isSpawned: true, tile: { rx: 0, ry: 0 } }] };
    expect(manager.findTarget(team, 0, 7)).toBe(defense); expect(manager.findTarget(team, 0, 3)).toBe(miner);
    expect(manager.findTarget(team, 0, 6)).toBe(yard); expect(manager.findTarget(team, 0, 9)).toBe(power);
    expect(() => manager.findTarget(team, 0, 8)).toThrow('Unsupported attack target category');
    expect([...source().scripts.values()].some(script => script.instructions.some(line => line.opcode === 0 && line.params[0] === '7'))).toBe(true);
});

test('source wildcard AI triggers preserve explicit team ownership and disabled historical IFV records', () => {
    const definition = source(), bad = {}, other = {};
    const manager: any = new CampaignTeams(definition, { map: {} }, reference => {
        if (reference === '<all>') throw Error('A selector is not a scenario house');
        return reference === 'BadGuy1' ? bad : other;
    }, () => {}, 5);
    const trigger = definition.aiTriggers.get('0A4274E0')!;
    expect(trigger.house).toBe('<all>'); expect(manager.aiOwnerMatches(trigger, bad)).toBe(true);
    expect(manager.aiOwnerMatches(trigger, other)).toBe(false);
    expect(definition.aiTriggers.get('0B9E3EEC')!.enabled).toBe(false);
    expect([...definition.triggers.values()].flatMap(trigger => trigger.actions).some(action => action.params.includes('0B9E3EEC'))).toBe(false);
});
