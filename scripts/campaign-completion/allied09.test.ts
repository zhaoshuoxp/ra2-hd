import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailIni, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities, campaignStartingCredits } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { UnitOrderTrait } from '../../src/game/gameobject/trait/UnitOrderTrait';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { ParadropTask } from '../../src/game/gameobject/task/ParadropTask';
import { CampaignVehicleParadropTask } from '../../src/game/campaign/CampaignVehicleParadropTask';
import { EventType } from '../../src/game/event/EventType';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all09t.map');
const sourceSha256 = '89a243ea0d9ccc802bd6e1d7da4d271d0077f86c3883802e27be7840364ac279';
const read = (library?: IniFile) => new CampaignDefinition('ra2', 'all09t.map', file.readAsString(), library,
    { sourceSha256, semanticsVersion: 23 });

test('original Allied09 preserves POWs, both building goals, controlled-house ledgers, global AI and actual media', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const original = read(); original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size,
        original.aiTriggers.size]).toEqual([80, 35, 37, 21, 3]);
    expect(original.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(false);
    expect(original.triggers.get('07C90810')!.events.map(event => [event.opcode, event.params[1]]))
        .toEqual([[10, '21'], [10, '14']]);
    expect(original.triggers.get('07C90E40')!.events.map(event => [event.opcode, event.params[1]]))
        .toEqual([[11, '13']]);
    expect([...original.houses.values()].filter(house => house.playerControl).map(house => [house.id, house.credits]))
        .toEqual([['Player House', 10000], ['Hack House', 5000]]);
    const rules = retailIni('ra2').mergeWith(original.ini);
    expect(['easy', 'normal', 'hard'].map(difficulty => [10000, 5000]
        .map(cash => campaignStartingCredits(cash, true, difficulty as any, rules, true))))
        .toEqual([[10050, 5050], [10000, 5000], [9950, 4950]]);
    expect(rules.getSection('ALL')!.getString('Name')).toBe('Herbert the Alligator');
    expect(rules.getSection('Mayanprism')!.getNumber('Damage')).toBe(1000);
    expect(rules.getSection('MAYAN')!.getBool('Capturable')).toBe(true);
    const expanded = read(new IniFile(retailMember('ra2', 'ai.ini').file.readAsString()));
    expanded.assertValid(); expect(campaignPreflight(expanded, campaignCapabilities)).toEqual([]);
    expect([...expanded.triggers]).toEqual([...original.triggers]);
    expect([...expanded.aiTriggers.values()].some(trigger => trigger.global && trigger.enabled)).toBe(true);
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a09_f00e', 'before-mission'], ['a09_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all08u.map')).toBe(22); expect(campaignMissionSemantics('all09t.map')).toBe(23);
    expect(campaignMissionImplemented('ra2', 'all09t.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all11t.map')).toBe(true);
});

test('Harmless POWs retain their original mission through transfer and wake on ordinary input', () => {
    const definition = read(), unit: any = { name: 'E1', isUnit: () => true, isInfantry: () => true,
        isAircraft: () => false, traits: { filter: () => [] }, owner: {}, resetGuardModeToIdle() {} };
    const host: any = { definition, initial: new Map(), semanticsVersion: 23 };
    const bind = () => CampaignTeams.prototype.bindInitial.call(host, unit,
        { owner: 'Other2 House', rx: 67, ry: 82, subCell: 2 });
    bind(); expect(unit.campaignHarmless).toBe(true); expect(unit.guardMode).toBe(false);
    expect(host.initial.get(unit)).toMatchObject({ mission: 'Harmless', recruitable: true });
    const ownerHost: any = { hunters: new Set(), assignments: new Map(), semanticsVersion: 23,
        release: (CampaignTeams.prototype as any).release };
    CampaignTeams.prototype.noteOwnerChange.call(ownerHost, unit);
    expect(unit.campaignHarmless).toBe(true);
    const orders = new UnitOrderTrait(unit);
    orders.addOrder({ onAdd() {}, orderType: 'Move' } as any);
    expect(unit.campaignHarmless).toBe(false);
    host.semanticsVersion = 22; expect(bind).toThrow('unsupported initial mission Harmless');
});

test('original Harmless controls block passive acquisition and retaliation without changing ordinary units', () => {
    const rules = retailIni('ra2').mergeWith(read().ini), game: any = { rules: { getIni: () => rules } };
    expect(Object.fromEntries(rules.getSection('Harmless')!.entries)).toEqual({
        Recruitable: 'no', NoThreat: 'yes', Retaliate: 'no', Rate: '.5' });
    const unit: any = { campaignHarmless: true, owner: { isCombatant: () => true }, isUnit: () => true,
        rules: { canPassiveAquire: true }, primaryWeapon: {}, unitOrderTrait: { hasTasks: () => false } };
    expect(AttackTrait.prototype.shouldPassiveAcquire.call({}, unit, game)).toBe(false);
    expect(AttackTrait.prototype.shouldRetaliate.call({}, unit, game, 10, {}, {})).toBe(false);
    unit.campaignHarmless = false;
    expect(AttackTrait.prototype.shouldPassiveAcquire.call({}, unit, game)).toBe(true);
});

test('the source victory requires both houses buildings, allows surviving enemy units and waits five seconds', () => {
    const definition = read(), objects = new Map<number, any[]>([[14, []], [21, []]]);
    const host: any = { launch: { edition: 'ra2', semanticsVersion: 23 }, targets: () => [],
        resolveHouse: (id: number) => ({ getOwnedObjects: () => objects.get(id)! }) };
    const soldier = { isDestroyed: false, rules: { insignificant: false }, isBuilding: () => false };
    const facility = { isDestroyed: false, rules: { insignificant: false }, isBuilding: () => true };
    const actions: any[] = [];
    const machine = new CampaignTriggerMachine(definition, 'normal', { targets: () => [],
        condition: (event, trigger) => (CampaignRuntime.prototype as any).check.call(host, event, trigger, []),
        action: action => actions.push({ tick: machine.tick, ...action }) });
    for (const id of machine.states.keys()) machine.setEnabled(id, id === '07C90810');
    objects.set(14, [soldier]); objects.set(21, [facility]);
    machine.update(); expect(actions).toEqual([]);
    facility.isDestroyed = true; machine.update();
    expect(machine.states.get('07C90810')!.fired).toBe(1);
    expect(machine.states.get('0D2B6F3C')).toMatchObject({ enabled: true, enabledTick: 1 });
    for (let i = 0; i < 75; i++) machine.update();
    expect(actions.filter(action => action.opcode === 1).map(action => action.tick)).toEqual([76]);
});

test('POW rescue retains the source three-second radar delay and distinct difficulty reinforcements', () => {
    const original = read(), actions: any[] = [];
    const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => [], condition: () => false,
        action: action => actions.push({ tick: machine.tick, ...action }) });
    for (const id of machine.states.keys()) machine.setEnabled(id, ['08F54B80'].includes(id));
    machine.variables.set('1', true); machine.update();
    for (let i = 0; i < 45; i++) machine.update();
    expect(actions.filter(action => action.opcode === 100).map(action => [action.tick, action.params[1]]))
        .toEqual([[45, '129']]);
    expect(original.triggers.get('07C4BF3C')!.difficulties).toEqual({ easy: true, normal: false, hard: false });
    expect(original.triggers.get('07C4A1AC')!.difficulties).toEqual({ easy: false, normal: true, hard: false });
    expect(original.triggers.get('07C4BC7C')!.actions.filter(action => action.opcode === 80).map(action => action.params[1]))
        .toEqual(['07C496DC', '0CE2903C']);
    expect(original.scripts.get('0F549DBC')!.instructions.map(line => [line.opcode, ...line.params]))
        .toEqual([[3, '13'], [8, '2'], [20, '22']]);
});

test('source aircraft ejections use five simulation frames while old journals retain their burst policy', () => {
    for (const [version, expected] of [[23, [100, 105, 110, 115, 120]], [22, [100, 101, 102, 103, 104]]]) {
        const arrivals: number[] = [], tile = { rx: 73, ry: 44 }, rules = { type: ObjectType.Infantry };
        const game: any = { currentTick: 100, map: { getTileZone: () => 0 },
            rules: { general: { paradrop: { paradropRadius: 1024 } } },
            createUnitForPlayer: () => ({ position: {}, unitOrderTrait: { addTask() {} } }),
            spawnObject: () => arrivals.push(game.currentTick) };
        const host: any = { semanticsVersion: version, game, rules: () => rules, canSpawn: () => true,
            freeSubCell: () => 0, add: (team: any, unit: any) => team.members.push(unit) };
        const plane = { tile, tileElevation: 6, traits: { get: () => ({ setEnabled() {} }) },
            unitOrderTrait: { hasTasks: () => true } };
        const team: any = { owner: {}, members: [], flight: { plane, target: tile, remaining: Array(5).fill('GHOST'), dropping: false } };
        for (let tick = 100; tick <= 120; tick++) {
            game.currentTick = tick; (CampaignTeams.prototype as any).tickFlight.call(host, team);
        }
        expect(arrivals).toEqual(expected);
        if (version === 23) expect(team.flight.nextDropTick).toBe(125);
        else expect(team.flight.nextDropTick).toBeUndefined();
    }
});

test('the original first-pyramid capture dispatches distinct Easy/Normal reinforcements and excludes Hard', () => {
    const original = read();
    for (const [difficulty, expected] of [['easy', ['07C496DC', '0CE2903C']], ['normal', ['0CF0ADEC']], ['hard', []]] as const) {
        const actions: any[] = [], ids = original.triggerChain('07C401DC');
        const machine = new CampaignTriggerMachine(original, difficulty, { targets: () => ['pyramid'],
            condition: () => false, action: action => actions.push({ tick: machine.tick, ...action }) });
        for (const id of machine.states.keys()) machine.setEnabled(id, ids.includes(id));
        machine.notify(ids, 1, () => ['pyramid']);
        for (let tick = 0; tick < 31; tick++) machine.update();
        expect(actions.filter(action => action.opcode === 80).map(action => action.params[1])).toEqual([...expected]);
        expect(actions.filter(action => action.opcode === 14).map(action => [action.tick, action.params[1]]))
            .toEqual([[30, '13']]);
    }
});

test('successful physical paradrop contact notifies source CellTags while invalid and old landings do not', () => {
    for (const version of [undefined, 22, 23]) for (const vehicle of [false, true]) for (const passable of [false, true]) {
        const events: any[] = [], tile = { rx: 73, ry: 43 }, unit: any = { isSpawned: true, isDestroyed: false,
            tile, tileElevation: 0, position: {}, rules: {}, isInfantry: () => !vehicle,
            attackTrait: { isDisabled: () => false, setDisabled() {} } };
        const game: any = { gameOpts: { campaign: version && { semanticsVersion: version } }, events: { dispatch: (event: any) => events.push(event) },
            rules: { general: { parachuteMaxFallRate: -5 } },
            map: { terrain: { getPassableSpeed: () => Number(passable) } },
            destroyObject: () => { unit.isDestroyed = true; unit.isSpawned = false; } };
        const task = vehicle ? new CampaignVehicleParadropTask(game, unit) : new ParadropTask(game);
        expect(task.onTick(unit)).toBe(true);
        expect(unit.isDestroyed).toBe(!passable);
        expect(events.map(event => [event.type, event.target, event.source]))
            .toEqual(version === 23 && passable ? [[EventType.EnterTile, tile, unit]] : []);
    }
});
