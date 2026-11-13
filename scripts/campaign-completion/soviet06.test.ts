import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov06t.map').getBytes();
expect(sha256(bytes)).toBe('bea4548cca589aa1caf6fbc4e69700f8b408d650b700b71c65242f0df9eeeb83');
const source = new CampaignDefinition('ra2', 'sov06t.map', new TextDecoder().decode(bytes));
const header = '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n';

test('the original sixth mission retains its explicit empty hint program and both naval victory conditions', () => {
    source.assertValid();
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([43, 50, 45, 44, 19]);
    expect(source.ini.getSection('Actions')!.getString('097137D4')).toBe('0');
    expect(source.triggers.get('097137D4')!.actions).toEqual([]);
    expect(source.triggers.get('097137D4')!.events[0].opcode).toBe(32);
    expect(source.triggers.get('07A8FCA0')!.events.map(event => [event.opcode, event.params[1]]))
        .toEqual([[55, '14'], [55, '15']]);
    const reasons = campaignPreflight(source, campaignCapabilities).map(issue => issue.reason);
    expect(reasons.some(reason => reason.includes('Event opcode 55') || reason.includes('requires events'))).toBe(false);
});

test('the original unused Patrol script has only an explicitly disabled AI creation root', () => {
    const script = '07F8FDC0', team = source.teams.get('0B0A532C')!, ai = source.aiTriggers.get('0C5C48A0')!;
    expect(source.scripts.get(script)!.instructions.map(line => [line.opcode, ...line.params]))
        .toEqual([[5, '50'], [49, '0'], [11, '25']]);
    expect([...source.teams.values()].filter(value => value.script === script).map(value => value.id)).toEqual([team.id]);
    expect(source.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(true);
    expect(source.ini.getSection('AITriggerTypesEnable')!.has(ai.id)).toBe(true);
    expect(source.ini.getSection('AITriggerTypesEnable')!.getBool(ai.id)).toBe(false);
    expect(ai.enabled).toBe(false); expect([ai.count, ai.comparison]).toEqual([1, 3]);
    expect([...source.aiTriggers.values()].filter(value => value.team === team.id || value.secondTeam === team.id)
        .map(value => value.id)).toEqual([ai.id]);
    for (const key of ['Autocreate', 'Prebuild', 'Reinforce']) expect(team.properties[key]).toBe('no');
    const references = [...source.ini.sections].flatMap(([section, entries]) => [...entries.entries]
        .filter(([, value]) => String(value).includes(team.id)).map(([key]) => [section, key]));
    expect(references).toEqual([['TeamTypes', '31'], ['AITriggerTypes', ai.id]]);
    expect([...source.scripts.values()].flatMap(value => value.instructions).some(line => [17, 18].includes(line.opcode))).toBe(false);
    // The original house-wide action74 starts the house selector. It does not
    // override per-record enable flags; installed dispatch is pinned separately.
    expect(source.triggers.get('07F8C4B0')!.actions.some(action => action.opcode === 74)).toBe(true);
});

test('an explicit empty action list fires without side effects while missing or truncated lists remain invalid', () => {
    const body = '[Triggers]\na=P,<none>,Empty,0,1,1,1,0\n[Events]\na=1,8,0,0\n';
    const definition = new CampaignDefinition('ra2', 'empty-actions-fixture.map', header + body + '[Actions]\na=0\n');
    definition.assertValid();
    const machine = new CampaignTriggerMachine(definition, 'normal', {
        targets: () => [], condition: () => false, action: () => { throw Error('An empty program has no action'); },
    });
    machine.update(); expect(machine.states.get('a')!.fired).toBe(1); expect(machine.states.get('a')!.finished).toBe(true);
    for (const raw of ['', '[Actions]\na=1\n', '[Actions]\na=0,11\n', '[Actions]\na=\n']) {
        expect(() => new CampaignDefinition('ra2', 'invalid-actions-fixture.map', header + body + raw).assertValid()).toThrow();
    }
});

test('naval destruction counts significant owned naval units, including passengers, without counting yards or land forces', () => {
    const objects: any[] = [], owner = { getOwnedObjects: (passengers: boolean) => {
        expect(passengers).toBe(true); return objects;
    } };
    const host: any = { launch: { edition: 'ra2', semanticsVersion: 8 }, targets: () => [], resolveHouse: () => owner };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, { opcode: 55, params: ['0', '14'] }, {});
    const actor = (naval: boolean, building = false, insignificant = false): any => ({
        rules: { naval, insignificant }, isDestroyed: false, isSpawned: false,
        isBuilding: () => building, isUnit: () => !building,
    });
    objects.push(actor(false), actor(true, true), actor(true, false, true)); expect(check()).toBe(true);
    const ship = actor(true); objects.push(ship); expect(check()).toBe(false);
    ship.isDestroyed = true; expect(check()).toBe(true);
});

test('a future fleet arrival invalidates the initial empty-house condition before the two-fleet goal can fire, including restore', () => {
    const events = source.ini.getSection('Events')!.getString('07A8FCA0');
    const definition = new CampaignDefinition('ra2', 'two-fleets-fixture.map', header
        + '[Triggers]\na=P,<none>,Both fleets,0,1,1,1,0\n[Events]\na=' + events
        + '\n[Actions]\na=1,11,4,TEST,0,0,0,0,A\n');
    const fleets = new Map([['14', 1], ['15', 0]]), effects: number[] = [];
    const host = { targets: () => [], condition: (event: any) => fleets.get(event.params[1]) === 0,
        action: () => effects.push(1) };
    const machine = new CampaignTriggerMachine(definition, 'normal', host);
    machine.update(); expect(machine.states.get('a')!.latched).toEqual([false, true]);
    const restored = new CampaignTriggerMachine(definition, 'normal', host); restored.restore(machine.snapshot());
    fleets.set('15', 1); fleets.set('14', 0); machine.update(); restored.update();
    expect(machine.states.get('a')!.fired).toBe(0); expect(restored.snapshot()).toEqual(machine.snapshot());
    fleets.set('15', 0); machine.update(); restored.update();
    expect(machine.states.get('a')!.fired).toBe(1); expect(restored.snapshot()).toEqual(machine.snapshot());
    expect(effects).toHaveLength(2);
});

test('original attack categories distinguish occupied garrisons and capturable technology, with 8 retaining normal-threat behavior', () => {
    const owner = {}, enemy = {}, neutral = { isNeutral: true }, ally = {};
    const actor = (id: number, house: any, rules = {}, occupied = false): any => ({
        id, owner: house, rules, tile: { rx: id, ry: 0 }, isSpawned: true,
        isTechno: () => true, isBuilding: () => true, garrisonTrait: { isOccupied: () => occupied },
    });
    const empty = actor(1, neutral), normal = actor(2, enemy), garrison = actor(3, enemy, {}, true);
    const airport = actor(4, neutral, { capturable: true, needsEngineer: true });
    const uncapturable = actor(5, enemy, { needsEngineer: true }), friendly = actor(6, ally, {}, true);
    const game: any = { map: {}, world: { getAllObjects: () => [empty, normal, garrison, airport, uncapturable, friendly] },
        alliances: { areAllied: (_a: any, b: any) => b === ally }, isValidTarget: () => true };
    const manager: any = new CampaignTeams(source, game, () => owner, () => {}, 8);
    const team: any = { owner, members: [{ isSpawned: true, tile: { rx: 0, ry: 0 } }] };
    expect(manager.findTarget(team, 0, 1)).toBe(normal); expect(manager.findTarget(team, 0, 8)).toBe(normal);
    expect(manager.findTarget(team, 0, 10)).toBe(garrison); expect(manager.findTarget(team, 0, 11)).toBe(airport);
    garrison.isDestroyed = true; expect(manager.findTarget(team, 0, 10)).toBeUndefined();
    airport.owner = owner; expect(manager.findTarget(team, 0, 11)).toBeUndefined();
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
});

test('the actual gift-scorpion script follows a real friendly, retargets moving units and waits for arrival before its local flag', () => {
    const owner = {}, ally = {}, enemy = {}, objects: any[] = [], attached: any[] = [], variables: any[] = [];
    const actor = (id: number, house: any, x: number, vehicle = true): any => ({ id, owner: house, isSpawned: true,
        tile: { rx: x, ry: 0 }, rules: {}, isVehicle: () => vehicle, isInfantry: () => false,
        unitOrderTrait: { clearOrders() {}, cancelAllTasks() {}, hasTasks: () => false,
            addTask: (task: any) => attached.push(task) } });
    const member = actor(1, owner, 0), hostile = actor(2, enemy, 1), aircraft = actor(3, ally, 1, false);
    const friend = actor(4, ally, 12), ownFriend = actor(5, owner, 20);
    objects.push(member, hostile, aircraft);
    const game: any = { map: {}, world: { getAllObjects: () => objects }, rules: { general: { closeEnough: 1 } },
        alliances: { areAllied: (a: any, b: any) => a === ally && b === owner } };
    const manager: any = new CampaignTeams(source, game, () => owner, (id, value) => variables.push([id, value]), 8);
    const team: any = { type: '0C10D30C', owner, members: [member], line: 0, started: false, tasks: [] };
    manager.tickScript(team, 0); expect(team.line).toBe(0); expect(team.target).toBeUndefined(); expect(attached).toEqual([]);
    objects.push(friend, ownFriend); manager.tickScript(team, 1);
    expect(team.target).toBe(friend); expect(team.line).toBe(0); expect(attached).toHaveLength(1);
    const move = attached[0]; expect(move.hasTarget(friend.tile, false)).toBe(true);
    friend.tile = { rx: 13, ry: 0 }; manager.tickScript(team, 2);
    expect(attached).toHaveLength(1); expect(move.hasTarget(friend.tile, false)).toBe(true);
    friend.isDestroyed = true; manager.tickScript(team, 3);
    expect(team.target).toBe(ownFriend); expect(move.hasTarget(ownFriend.tile, false)).toBe(true);
    member.tile = { rx: 19, ry: 0 }; manager.tickScript(team, 4);
    expect(team.line).toBe(1); expect(variables).toEqual([]);
    // Source facing is the intervening real instruction; fixture skips only
    // its already separately tested turn task to inspect the source flag.
    team.line = 2; team.started = false; manager.tickScript(team, 5);
    expect(variables).toEqual([['6', true]]); expect(team.line).toBe(3);
});

test('unarmed Sticky placements hold position and retain the source recruitment exclusion; armed behavior remains explicit', () => {
    const parked = new CampaignDefinition('ra2', 'parked-actor-fixture.map', header
        + '[Units]\n0=P,CAR,256,1,1,0,Sticky,None,0,-1,0,-1,1,1\n'
        + '[TaskForces]\n0=F\n[F]\n0=1,CAR\n[ScriptTypes]\n0=S\n[S]\n0=5,1\n'
        + '[TeamTypes]\n0=T\n[T]\nHouse=P\nTaskForce=F\nScript=S\n');
    const rules = new IniFile('[Sticky]\nRecruitable=no\n');
    const unit: any = { id: 1, name: 'CAR', isSpawned: true, tile: { rx: 1, ry: 1 }, rules: {},
        isUnit: () => true, isInfantry: () => false, isAircraft: () => false,
        unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} } };
    const owner: any = { name: 'P', getOwnedObjects: () => [unit] }; unit.owner = owner;
    const manager: any = new CampaignTeams(parked, { map: {}, rules: { getIni: () => rules } }, () => owner, () => {}, 8);
    const placement = { owner: 'P', rx: 1, ry: 1 };
    manager.bindInitial(unit, placement); expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    expect(unit.campaignSticky).toBe(true); expect(manager.create('T').members).toEqual([]);
    unit.campaignSticky = false; expect(manager.create('T').members).toEqual([unit]);
    unit.primaryWeapon = {}; expect(() => manager.bindInitial(unit, placement)).toThrow('unsupported initial mission Sticky');
});
