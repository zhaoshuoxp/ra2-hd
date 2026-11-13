import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailIni, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities, campaignStartingCredits } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignSuperWeapons } from '../../src/game/campaign/CampaignSuperWeapons';
import { SuperWeaponStatus } from '../../src/game/SuperWeapon';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { validCampaignPresentation } from '../../src/game/campaign/CampaignCheckpoint';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { EventType } from '../../src/game/event/EventType';
import { DifficultyRules } from '../../src/game/rules/DifficultyRules';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all11t.map');
const sourceSha256 = '08456515dd5e258f5a9ff73b8961491883eccaa3635a8f008dcb1f9369d43887';
const read = () => new CampaignDefinition('ra2', 'all11t.map', file.readAsString(), undefined,
    { sourceSha256, semanticsVersion: 25 });

test('Allied11 keeps its native-backed silo goal, paused radar movies and all original records', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const source = read(); source.assertValid();
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([102, 89, 95, 73, 34]);
    expect(source.ini.getSection('Map')!.getString('Theater')).toBe('TEMPERATE');
    expect(source.ini.getSection('Basic')!.getString('NextScenario')).toBe('All12u.map');
    expect(source.triggers.get('0BA9F670')!.events.map(event => event.opcode)).toEqual([48]);
    expect(source.ini.getSection('MultiSpecial')!.getNumber('RechargeTime')).toBe(20);
    expect(source.ini.getSection('ChronoSphereSpecial')!.getNumber('RechargeTime')).toBe(5);
    expect(source.triggers.get('0CD424DC')!.actions[0]).toMatchObject({ opcode: 1, params: ['0', '13', '0', '0', '0', '0', 'A'] });
    const media = campaignMediaReferences(source, retailIni('ra2', 'art'));
    expect(media.filter(ref => ref.use === 'transmission-paused').map(ref => [ref.movieIndex, ref.name]))
        .toEqual([[73, 'a11_p01e'], [74, 'a11_p02e']]);
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
    expect(campaignMissionSemantics('all10s.map')).toBe(24); expect(campaignMissionSemantics('all11t.map')).toBe(25);
    expect(campaignMissionImplemented('ra2', 'all11t.map')).toBe(true);
});

test('all three original silo targets must be destroyed, really captured or infiltrated; scripted ownership changes do not count', () => {
    const source = read(), trigger = source.triggers.get('0BA9F670')!, silos = [1, 2, 3].map(id => ({ id }));
    const runtime: any = { launch: { semanticsVersion: 25 }, targets: () => silos, events: [],
        targetId: (object: any) => `object:${object.id}` };
    const check = (event: any, trigger: any) => (CampaignRuntime.prototype as any).check.call(runtime, event, trigger);
    const calls: any[] = [];
    const machine = new CampaignTriggerMachine(source, 'normal', {
        targets: trigger => trigger.id === '0BA9F670' ? silos.map(runtime.targetId) : [], condition: check,
        randomInt: minimum => minimum, action: action => calls.push(action) }, 15, false, 25);
    for (const id of machine.states.keys()) machine.setEnabled(id, false);
    machine.setEnabled(trigger.id, true);
    runtime.events = [{ type: EventType.ObjectOwnerChange, target: silos[0] }]; machine.update();
    expect(machine.states.get(trigger.id)!.remainingTargets).toHaveLength(3);
    runtime.events = [{ type: EventType.BuildingCapture, target: silos[0] }]; machine.update();
    expect(machine.states.get(trigger.id)!.remainingTargets).toEqual(['object:2', 'object:3']);
    const saved = machine.snapshot(); runtime.events = []; machine.update(); machine.restore(saved);
    runtime.events = [{ type: EventType.BuildingInfiltration, target: silos[1] }]; machine.update();
    expect(machine.states.get(trigger.id)!.remainingTargets).toEqual(['object:3']); expect(calls).toEqual([]);
    runtime.events = [{ type: EventType.ObjectDestroy, target: silos[2] }]; machine.update();
    expect(machine.states.get(trigger.id)!.fired).toBe(1);
    expect(machine.states.get('0AD6F94C')!.enabled).toBe(true);
    expect(machine.states.get('0CD424DC')!.fired).toBe(0);
    runtime.launch.semanticsVersion = 24;
    for (const type of [EventType.BuildingCapture, EventType.BuildingInfiltration, EventType.ObjectOwnerChange]) {
        runtime.events = [{ type, target: silos[0] }]; expect(check(trigger.events[0], trigger)).toEqual([]);
    }
});

test('Action117 uses the original presentation action without becoming fullscreen or changing source input locks', () => {
    const source = read(), trigger = source.triggers.get('0A9CD77C')!, action = trigger.actions.find(action => action.opcode === 117)!;
    const calls: any[] = [], host: any = { launch: { semanticsVersion: 25 }, machine: { tick: 10 }, trace: [],
        inputLocked: false, uiAction: (action: any) => calls.push(action) };
    (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    expect(calls).toEqual([action]); expect(host.inputLocked).toBe(false);
    host.restoring = true; (CampaignRuntime.prototype as any).execute.call(host, action, trigger); expect(calls).toHaveLength(1);
    host.launch.semanticsVersion = 24;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, action, trigger)).toThrow('interpreter 25');
});

test('Allied11 keeps source handicaps, cash, team timing and difficulty-specific AI eligibility', () => {
    const source = read(), rules = retailIni('ra2').mergeWith(source.ini);
    const expected = {
        easy: { human: [1.2, .8, .8], ai: [.8, 1.2, 1], delay: 3500, cash: 10050, aiCount: 20, triggers: 62 },
        normal: { human: [1, 1, 1], ai: [1, 1, 1], delay: 2500, cash: 10000, aiCount: 28, triggers: 65 },
        hard: { human: [.8, 1.2, 1], ai: [1.2, .8, .8], delay: 2000, cash: 9950, aiCount: 34, triggers: 68 },
    };
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const row = expected[difficulty], human = DifficultyRules.readCampaign(rules, true, difficulty);
        const ai = DifficultyRules.readCampaign(rules, false, difficulty);
        expect([human.armor, human.rof, human.buildTime]).toEqual(row.human);
        expect([ai.armor, ai.rof, ai.buildTime]).toEqual(row.ai); expect(ai.teamDelay).toBe(row.delay);
        expect(campaignStartingCredits(10000, true, difficulty, rules, true)).toBe(row.cash);
        expect([...source.aiTriggers.values()].filter(trigger => trigger.enabled && trigger.difficulties[difficulty]))
            .toHaveLength(row.aiCount);
        expect([...source.triggers.values()].filter(trigger => !trigger.disabled && trigger.difficulties[difficulty]))
            .toHaveLength(row.triggers);
    }
});

test('Allied11 loses only after the original all-player-technos condition and its five-second delay', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const source = read(), calls: any[] = []; let gone = false;
        const machine = new CampaignTriggerMachine(source, difficulty, { targets: () => [], randomInt: minimum => minimum,
            condition: event => event.opcode === 11 && event.params[1] === '13' && gone,
            action: action => calls.push({ tick: machine.tick, opcode: action.opcode }) }, 15, false, 25);
        for (const id of machine.states.keys()) machine.setEnabled(id, id === '0BA99910');
        for (let tick = 0; tick < 100; tick++) machine.update();
        expect(calls).toEqual([]); gone = true; machine.update();
        for (let tick = 0; tick < 74; tick++) machine.update();
        expect(calls).toEqual([]); machine.update();
        expect(calls).toEqual([{ tick: 175, opcode: 2 }]);
    }
});

test('source target preference chain remains difficulty-disabled even when its enabler executes', () => {
    const source = read();
    const root = source.triggers.get('0BAF16F0')!;
    expect(root.difficulties).toEqual({ easy: false, normal: false, hard: false });
    expect(root.actions[0]).toMatchObject({ opcode: 35, params: ['0', '7', '0', '0', '0', '0', 'A'] });
    const calls: any[] = [];
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const machine = new CampaignTriggerMachine(source, difficulty, { targets: () => [], condition: () => false,
            randomInt: minimum => minimum, action: action => calls.push(action) }, 15, false, 25);
        for (const id of machine.states.keys()) machine.setEnabled(id, false);
        machine.setEnabled(root.id, true);
        for (let tick = 0; tick < 33000; tick++) machine.update();
        expect(machine.states.get(root.id)!.fired).toBe(0);
        expect(machine.states.get('0BAF6240')!.enabled).toBe(false);
        expect(machine.states.get('0BAEB340')!.enabled).toBe(false);
    }
    expect(calls).toEqual([]);
});

test('Action35 stores a house category without firing immediately or interpreting its unused waypoint', () => {
    const source = read(), trigger = source.triggers.get('0BAEB340')!, action = trigger.actions[0], owner = {};
    const calls: any[] = [], host: any = { launch: { semanticsVersion: 25 }, machine: { tick: 10 }, trace: [],
        resolveHouse: () => owner, superWeapons: { setPreferred: (...args: any[]) => calls.push(args) } };
    (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    expect(calls).toEqual([[owner, 6]]);
    host.launch.semanticsVersion = 24;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, action, trigger)).toThrow('interpreter 25');
});

test('ready major AI weapons use source difficulty target values, equal-maximum RNG and the real activation path', () => {
    const rules = retailIni('ra2'), ai: any = { name: 'AI', isAi: true, isNeutral: false }, human: any = { name: 'Human', isNeutral: false };
    const weapon: any = { name: 'NukeSpecial', status: SuperWeaponStatus.Charging, rules: { type: SuperWeaponType.MultiMissile } };
    ai.superWeaponsTrait = { getAll: () => [weapon] }; human.getOwnedObjects = () => objects;
    const object = (id: number, type: string, props: any): any => ({ id, owner: human, isSpawned: true, name: type,
        rules: { name: type, ...props }, tile: { rx: id, ry: 10 }, isTechno: () => true, isBuilding: () => true,
        isAircraft: () => false, getFoundation: () => ({ width: 3, height: 2 }) });
    const objects = [object(1, 'GACNST', { constructionYard: true }), object(2, 'GAPOWR', { power: 200 }),
        object(3, 'GAWEAP', { factory: ObjectType.Vehicle }), object(4, 'GAWEAP', { factory: ObjectType.Vehicle })];
    const source: any = { houses: new Map([['AI', { id: 'AI', playerControl: false, iq: 5 }],
        ['Human', { id: 'Human', playerControl: true, iq: 0 }]]) };
    const launches: any[] = [], draws: any[] = [], requests: any[] = [];
    const game: any = { rules: { getIni: () => rules }, gameOpts: { campaign: { difficulty: 'normal' } },
        alliances: { areAllied: () => false }, world: { getAllObjects: () => objects }, isValidTarget: () => true,
        generateRandomInt: (min: number, max: number) => { draws.push([min, max]); return max; },
        map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } },
        traits: { get: () => ({ activateSuperWeapon: (...args: any[]) => { launches.push(args); weapon.status = SuperWeaponStatus.Charging; } }) } };
    const teams: any = { preferredSuperWeaponTarget: (owner: any, category: number) => { requests.push([owner, category]); return objects[1]; } };
    const runtime = new CampaignSuperWeapons(source, game, (name: string) => name === 'AI' ? ai : human, teams);
    runtime.update(1); expect(draws).toEqual([]); expect(launches).toEqual([]);
    weapon.status = SuperWeaponStatus.Paused; runtime.update(2); expect(launches).toEqual([]);
    weapon.status = SuperWeaponStatus.Ready; runtime.update(3);
    expect(draws).toEqual([[0, 1]]); expect(launches[0].slice(0, 2)).toEqual([SuperWeaponType.MultiMissile, ai]);
    expect(launches[0][3]).toEqual({ rx: 5, ry: 11 }); expect(runtime.trace[0].target).toBe(4);
    runtime.setPreferred(ai, 9); expect(launches).toHaveLength(1);
    weapon.status = SuperWeaponStatus.Ready; runtime.update(4);
    expect(requests).toEqual([[ai, 9]]); expect(runtime.trace[1].target).toBe(2);
    expect(runtime.snapshot()).toEqual({ preferred: [['AI', 9]] });
    source.houses.get('AI').iq = 3; weapon.status = SuperWeaponStatus.Ready; runtime.update(5);
    expect(launches).toHaveLength(2); expect(() => runtime.setPreferred(ai, 12)).toThrow('Unsupported');
});

test('paused radar save placement is admitted only by interpreter25 and keeps existing presentations compatible', () => {
    const legacy = { movies: [{ id: 'a11_p03e', placement: 'transmission', time: 1 }], speech: [], speechPolicy: 'restart-current-utterance' };
    expect(validCampaignPresentation(legacy, 24)).toBe(true); expect(validCampaignPresentation(legacy, 25)).toBe(true);
    const paused = { ...legacy, movies: [{ id: 'a11_p01e', placement: 'transmission-paused', time: 3.2 }] };
    expect(validCampaignPresentation(paused, 24)).toBe(false); expect(validCampaignPresentation(paused, 25)).toBe(true);
    expect(validCampaignPresentation({ ...paused, movies: [{ ...paused.movies[0], time: NaN }] }, 25)).toBe(false);
});

test('source naval reinforcements retain full-map water waypoints before view expansion without bypassing terrain or occupancy', () => {
    const point = { rx: 162, ry: 166 }, placed: any[] = [], flags: any[] = [];
    let occupied = false;
    const makeUnit = (): any => ({ rules: { naval: true, speedType: 5 }, isInfantry: () => false, position: {} });
    const host: any = { semanticsVersion: 25, rules: () => ({}), canSpawn: (CampaignTeams.prototype as any).canSpawn,
        game: { createUnitForPlayer: makeUnit, spawnObject: (unit: any, tile: any) => placed.push([unit, tile]),
            map: { tiles: { getByMapCoords: () => undefined }, mapBounds: {}, getTileZone: () => 0,
                terrain: { getPassableSpeed: (...args: any[]) => { flags.push(args.slice(4)); return args[6] ? 1 : 0; } },
                getGroundObjectsOnTile: () => occupied ? [{ isDestroyed: false, isBuilding: () => true }] : [] } } };
    const spec: any = { id: '09C011FC', properties: {} };
    const spawn = () => (CampaignTeams.prototype as any).spawn.call(host, 'DRED', {}, point, spec);
    expect(spawn().position).toEqual({}); expect(placed).toHaveLength(1); expect(placed[0][1]).toBe(point);
    expect(flags[0]).toEqual([[], false, true]);
    occupied = true; expect(spawn).toThrow('no passable reinforcement');
    occupied = false; host.semanticsVersion = 24; expect(spawn).toThrow('no passable reinforcement');
    host.semanticsVersion = 25; host.game.createUnitForPlayer = () => ({ ...makeUnit(), rules: { naval: false } });
    expect(spawn).toThrow('no passable reinforcement'); expect(placed).toHaveLength(1);
    expect(read().waypoints.get(19)).toEqual({ x: 162, y: 166 });
});
