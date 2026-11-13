import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { EventType } from '../../src/game/event/EventType';
import { IniFile } from '../../src/data/IniFile';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { WarpedOutTrait } from '../../src/game/gameobject/trait/WarpedOutTrait';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov07s.map').getBytes();
expect(sha256(bytes)).toBe('0ad2fde5c76f17085065f7b43cb76045935774092b2498badc44fe91e7793171');
const source = new CampaignDefinition('ra2', 'sov07s.map', new TextDecoder().decode(bytes));

test('the seventh original mission retains all waves, the real lab failure chain and the final enemy-unit goal', () => {
    source.assertValid(); expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([62, 42, 45, 35, 0]);
    expect([...source.triggers.values()].flatMap(trigger => trigger.actions).filter(action => action.opcode === 107)).toHaveLength(31);
    expect(source.ini.getSection('General')!.getNumber('ChronoReinfDelay')).toBe(140);
    expect(source.triggers.get('096C4DF0')!.events.map(event => event.opcode)).toEqual([2]);
    expect(source.triggerChain('096C4DF0')).toEqual(['096C4DF0', '096C55C0', '0A7F6220']);
    expect(source.triggers.get('0A7F7830')!.disabled).toBe(true);
    expect(source.triggers.get('0A7F7830')!.events[0].params).toEqual(['0', '14']);
    expect(source.triggers.get('0A7F7830')!.events[0].opcode).toBe(9);
    expect(source.triggers.get('0C11377C')!.events[0].params).toEqual(['0', '5']);
});

test('Spied Upon reacts to actual infiltration of its attached lab, without treating the reserved zero as a house id', () => {
    const lab = { id: 1 }, other = { id: 2 }, spy = { owner: { country: { id: 15 } } };
    const host: any = { targets: () => [lab], targetId: (target: any) => 'object:' + target.id, events: [] };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, { opcode: 2, params: ['0', '0'] }, {});
    host.events = [{ type: EventType.EnterObject, target: lab, source: spy }]; expect(check()).toEqual([]);
    host.events = [{ type: EventType.BuildingInfiltration, target: other, source: spy }]; expect(check()).toEqual([]);
    host.events = [{ type: EventType.BuildingInfiltration, target: lab, source: spy }]; expect(check()).toEqual(['object:1']);
    spy.owner.country.id = 0; expect(check()).toEqual(['object:1']);
});

test('chrono reinforcement preloads the original IFV, preserves its passenger and waits the map delay before running its script', () => {
    const objects: any[] = [], effects: any[] = [], scripts: number[] = [], owner = { name: 'BadGuy1' };
    const ini = new IniFile('[General]\nChronoReinfDelay=140\n[AudioVisual]\nWarpIn=WARPIN\n');
    const rules: any = { FV: { name: 'FV', passengers: 1, size: 1, sizeLimit: 1 }, E1: { name: 'E1', size: 1 } };
    const tile = { rx: 40, ry: 40 }, game: any = { currentTick: 500, map: { getTileAtWaypoint: () => tile },
        rules: { getIni: () => ini }, traits: { filter: () => [] }, events: { dispatch: (event: any) => effects.push(event) } };
    const actor = (rule: any) => {
        const unit: any = { id: objects.length + 1, name: rule.name, rules: rule, owner, position: {}, tile,
            traits: { filter: () => [] }, isSpawned: true, isInfantry: () => rule.name === 'E1',
            unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} } };
        unit.warpedOutTrait = new WarpedOutTrait(unit);
        if (rule.passengers) unit.transportTrait = { units: [], getAvailableCapacity: () => 1 };
        objects.push(unit); return unit;
    };
    game.createUnitForPlayer = (rule: any) => { const unit = actor(rule); unit.isSpawned = false; return unit; };
    const manager: any = new CampaignTeams(source, game, () => owner, () => {}, 9);
    manager.rules = (name: string) => rules[name]; manager.spawn = (name: string) => actor(rules[name]);
    manager.sourceAi.update = () => {}; manager.tickScript = (_team: any, tick: number) => scripts.push(tick);
    const team = manager.create('0B2A38EC', true, 0, undefined, undefined, true);
    expect(team.members.map((unit: any) => unit.name)).toEqual(['FV', 'E1']);
    const [ifv, passenger] = team.members;
    expect(ifv.transportTrait.units).toEqual([passenger]); expect(passenger.isSpawned).toBe(false);
    expect(ifv.warpedOutTrait.isActive()).toBe(true); expect(ifv.warpedOutTrait.isInvulnerable()).toBe(false);
    expect(passenger.warpedOutTrait.isActive()).toBe(false);
    expect((manager.snapshot() as any).instances[0]).toMatchObject({ phase: 'phasing', waitUntil: 640 });
    expect(effects.map(event => event.name)).toEqual(['WARPIN']);
    for (game.currentTick = 501; game.currentTick < 640; game.currentTick++) {
        ifv.warpedOutTrait[NotifyTick.onTick](ifv, game); manager.update(game.currentTick);
    }
    expect(scripts).toEqual([]); expect(team.phase).toBe('phasing');
    ifv.warpedOutTrait[NotifyTick.onTick](ifv, game); manager.update(640);
    expect(ifv.warpedOutTrait.isActive()).toBe(false); expect(team.phase).toBe('active'); expect(scripts).toEqual([640]);
    const legacy = new CampaignTeams(source, game, () => owner, () => {}, 8);
    expect(() => legacy.create('0B2A38EC', true, 0, undefined, undefined, true)).toThrow('interpreter 9');
});

test('the real spy script waits for the requested disguise, then uses normal infiltration orders on the source power target', () => {
    const owner = {}, enemy = {}, infantryRules = {}, orders: number[] = [];
    const infantry: any = { id: 1, owner: enemy, rules: infantryRules, tile: { rx: 1, ry: 1 }, isSpawned: true,
        isTechno: () => true, isInfantry: () => true, isBuilding: () => false };
    const power: any = { id: 2, owner: enemy, rules: { power: 100, spyable: true }, tile: { rx: 2, ry: 2 }, isSpawned: true,
        isTechno: () => true, isInfantry: () => false, isBuilding: () => true };
    let disguise: any = { rules: infantryRules, owner };
    const spy: any = { id: 3, owner, rules: { infiltrate: true }, tile: { rx: 0, ry: 0 }, isSpawned: true,
        disguiseTrait: { getDisguise: () => disguise }, unitOrderTrait: { hasTasks: () => false, addOrder() {} } };
    const game: any = { map: {}, world: { getAllObjects: () => [infantry, power] }, isValidTarget: () => true,
        alliances: { areAllied: () => false }, createTarget: (object: any, tile: any) => ({ obj: object, tile }) };
    const manager: any = new CampaignTeams(source, game, () => owner, () => {}, 9);
    manager.orders = { create: (type: number) => { orders.push(type); return {
        set() { return this; }, isValid: () => true, isAllowed: () => true }; } };
    const team: any = { type: '0EF6D6CC', owner, members: [spy], line: 1, started: true, target: infantry, tasks: [] };
    manager.tickScript(team, 0); expect(team.line).toBe(1); expect(orders).toEqual([2]);
    disguise = { rules: infantryRules, owner: enemy }; manager.tickScript(team, 1); expect(team.line).toBe(2);
    manager.tickScript(team, 2); expect(orders.at(-1)).toBe(8); expect(team.target).toBe(power);
});
