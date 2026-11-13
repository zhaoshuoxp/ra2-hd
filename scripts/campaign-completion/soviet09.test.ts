import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { Alliances } from '../../src/game/Alliances';
import { Game } from '../../src/game/Game';
import { InflictDamageEvent } from '../../src/game/event/InflictDamageEvent';
import { ObjectDestroyEvent } from '../../src/game/event/ObjectDestroyEvent';
import { ObjectAttackedEvent } from '../../src/game/event/ObjectAttackedEvent';
import { MindControllerTrait } from '../../src/game/gameobject/trait/MindControllerTrait';
import { MindControllableTrait } from '../../src/game/gameobject/trait/MindControllableTrait';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov09u.map').getBytes();
expect(sha256(bytes)).toBe('ef2dd5c5280d20f5759c02cebf860111280dc0f091c322f21b42eeae6b53c8b6');
const source = new CampaignDefinition('ra2', 'sov09u.map', new TextDecoder().decode(bytes));

test('the ninth original map retains the President attack/capture goal, first-damage failures, source drops and one-way alliance actions', () => {
    source.assertValid(); expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size]).toEqual([55, 22, 26, 19]);
    expect(source.triggers.get('0873BB5C')!.events[0]).toMatchObject({ opcode: 44, params: ['0', '5'] });
    expect(source.triggerChain('086A4CCC')).toEqual(['086A4CCC', '0873BB5C']);
    expect(source.triggers.get('086A4CCC')!.events[0].opcode).toBe(41);
    expect(source.triggers.get('0D36A0FC')!.events[0].opcode).toBe(41);
    expect(['0878DF3C', '0CC0044C', '0CC00E5C', '0CBFF28C'].map(id => source.triggers.get(id)!.actions[0].opcode))
        .toEqual([37, 37, 37, 37]);
    expect(source.triggers.get('0A41405C')!.difficulties).toEqual({ easy: false, normal: false, hard: true });
    expect(source.triggers.get('0A41304C')!.difficulties).toEqual({ easy: true, normal: false, hard: false });
});

test('First Damaged Any Source uses a real full-health damage boundary, including lethal/friendly hits and direct destruction', () => {
    const president = { id: 1 }, other = { id: 2 };
    const host: any = { launch: { semanticsVersion: 11 }, targets: () => [president], events: [], targetId: (object: any) => 'object:' + object.id };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, { opcode: 41, params: ['0', '0'] }, {});
    const damage = (previous: number, current: number, amount = 1, target = president) => {
        host.events = [new InflictDamageEvent(target, undefined, amount, current, previous)]; return check();
    };
    expect(damage(100, 90)).toEqual(['object:1']); expect(damage(90, 80)).toEqual([]);
    expect(damage(100, 0, 10)).toEqual(['object:1']); expect(damage(100, 100, 0)).toEqual([]);
    expect(damage(90, 100, -1)).toEqual([]); expect(damage(100, 90, 1, other)).toEqual([]);
    expect(damage(100, 90)).toEqual(['object:1']);
    host.events = [new ObjectDestroyEvent(president, undefined, true, 100)]; expect(check()).toEqual(['object:1']);
    host.events = [new ObjectDestroyEvent(president, undefined, false, 90)]; expect(check()).toEqual([]);
    host.launch.semanticsVersion = 10; expect(() => check()).toThrow('interpreter 11');
});

test('direct destruction records pre-destruction health before zeroing the real object', () => {
    for (const health of [100, 35]) {
        const events: any[] = [];
        const object: any = { isDestroyed: false, isSpawned: true, type: 3, healthTrait: { health },
            owner: { isNeutral: false, addUnitsLost() {} }, isTechno: () => true, isBuilding: () => false,
            onDestroy() {}, dispose() {} };
        const game: any = { traits: { filter: () => [] }, events: { dispatch: (event: any) => events.push(event) },
            unspawnObject: (unit: any) => { unit.isSpawned = false; } };
        Game.prototype.destroyObject.call(game, object);
        expect(object.healthTrait.health).toBe(0); expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(ObjectDestroyEvent); expect(events[0].previousHealth).toBe(health);
    }
});

test('the original FV targetless Move starts idle without an invented destination and retains recruitment metadata', () => {
    const game: any = { map: {} }, unit: any = { name: 'FV', isUnit: () => true, isInfantry: () => false,
        isAircraft: () => false, guardMode: true, defaultToGuardArea: true,
        unitOrderTrait: { addTask() { throw Error('An initial targetless Move must not invent a movement task'); } } };
    const placement = { owner: 'Americans', rx: 78, ry: 57 };
    const teams: any = new CampaignTeams(source, game, () => undefined, undefined, 11);
    teams.bindInitial(unit, placement);
    expect(teams.initial.get(unit)).toEqual({ group: -1, recruitable: true, mission: 'Move' });
    expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    const frozen = new CampaignTeams(source, game, () => undefined, undefined, 10);
    expect(() => frozen.bindInitial(unit, placement)).toThrow('unsupported initial mission Move');
});

test('the source extra engineer Wait clears former work while retaining normal recruitment and later player orders', () => {
    const calls: string[] = [], unit: any = { isSpawned: true, campaignSleeping: true, guardMode: true, defaultToGuardArea: true,
        unitOrderTrait: { clearOrders: () => calls.push('orders'), cancelAllTasks: () => calls.push('tasks') } };
    const teams: any = new CampaignTeams(source, { map: {} } as any, () => undefined, undefined, 11);
    teams.mission({ members: [unit] }, 28);
    expect(calls).toEqual(['orders', 'tasks']); expect(unit.campaignSleeping).toBe(false);
    expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    const frozen: any = new CampaignTeams(source, { map: {} } as any, () => undefined, undefined, 10);
    expect(() => frozen.mission({ members: [unit] }, 28)).toThrow('Unsupported team mission: 28');
});

test('Make Ally changes only the original trigger house direction, retaining other allies and ordinary ownership', () => {
    const owner: any = { name: 'Americans' }, ally: any = { name: 'Africans' }, existing: any = { name: 'French' };
    const alliances = new Alliances({} as any); alliances.setScenarioAllies(owner, [existing]);
    alliances.setScenarioAllies(ally, []);
    const host: any = { launch: { semanticsVersion: 11 }, machine: { tick: 0 }, trace: [], game: { alliances },
        resolveHouse: (reference: any) => reference === 'Americans' ? owner : reference === 5 ? ally : undefined };
    const action = source.triggers.get('0878DF3C')!.actions[0], trigger = source.triggers.get('0878DF3C');
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(alliances.getAllies(owner)).toEqual([existing, ally]);
    expect(alliances.areAllied(owner, ally)).toBe(true); expect(alliances.areAllied(ally, owner)).toBe(false);
    execute(); expect(alliances.getAllies(owner)).toEqual([existing, ally]);
    host.launch.semanticsVersion = 10; expect(() => execute()).toThrow('interpreter 11');
});

test('a real psychic ownership change raises the original President attack goal without damaging him; ordinary shooting ends in defeat', () => {
    const previous = { name: 'French' }, owner = { name: 'Africans' };
    const controller: any = { owner }, president: any = { id: 833, owner: previous, healthTrait: { health: 100 } };
    president.mindControllableTrait = new MindControllableTrait(president);
    controller.mindControllerTrait = new MindControllerTrait(controller, 10);
    const host: any = { launch: { semanticsVersion: 11 }, events: [], targets: () => [president],
        resolveHouse: () => owner, targetId: (unit: any) => 'object:' + unit.id,
        game: { alliances: { areAllied: () => false } } };
    const run = () => {
        const actions: any[] = [], machine = new CampaignTriggerMachine(source, 'normal', { targets: () => ['object:833'],
            condition: (event, trigger) => ['0873BB5C', '086A4CCC'].includes(trigger.id)
                ? (CampaignRuntime.prototype as any).check.call(host, event, trigger) : false,
            action: (action, trigger) => actions.push({ key: trigger.id, opcode: action.opcode }) });
        machine.update(); machine.update();
        return { actions: actions.filter(action => [1, 2].includes(action.opcode)), machine };
    };
    controller.mindControllerTrait.control(president, { changeObjectOwner: (unit: any, next: any) => { unit.owner = next; } });
    CampaignRuntime.prototype.noteMindControlHit.call(host, president, controller, previous);
    expect(president.owner).toBe(owner); expect(president.healthTrait.health).toBe(100);
    expect(host.events).toHaveLength(1); expect(host.events[0].ownerAtHit).toBe(previous);
    const psychic = run(); expect(psychic.actions).toEqual([{ key: '0873BB5C', opcode: 1 }]);
    expect(psychic.machine.states.get('086A4CCC')!.finished).toBe(true);
    host.events = []; CampaignRuntime.prototype.noteMindControlHit.call(host, president, controller, owner);
    expect(host.events).toEqual([]);
    host.launch.semanticsVersion = 10;
    CampaignRuntime.prototype.noteMindControlHit.call(host, president, controller, previous); expect(host.events).toEqual([]);
    host.launch.semanticsVersion = 11; president.owner = previous;
    host.events = [new ObjectAttackedEvent(president, { player: owner }, false), new InflictDamageEvent(president, undefined, 1, 90, 100)];
    expect(run().actions).toEqual([{ key: '0873BB5C', opcode: 1 }, { key: '086A4CCC', opcode: 2 }]);
});

test('captured units leave former scripted teams and hunters while script 20 retains its deliberately changed team house', () => {
    const teams: any = new CampaignTeams(source, { map: {} } as any, () => undefined, undefined, 11);
    const previous = {}, owner = {}, unit: any = { owner, campaignSleeping: true, mindControllableTrait: { getController: () => ({ owner }) } };
    const team: any = { owner: previous, members: [unit], tasks: [{ unit }] };
    teams.instances.set(1, team); teams.assignments.set(unit, team); teams.hunters.add(unit);
    teams.noteOwnerChange(unit);
    expect(team.members).toEqual([]); expect(team.tasks).toEqual([]); expect(teams.assignments.has(unit)).toBe(false);
    expect(teams.hunters.has(unit)).toBe(false); expect(unit.campaignSleeping).toBe(false);
    team.owner = owner; team.members = [unit]; teams.assignments.set(unit, team);
    teams.noteOwnerChange(unit); expect(teams.assignments.get(unit)).toBe(team); expect(team.members).toEqual([unit]);
});
