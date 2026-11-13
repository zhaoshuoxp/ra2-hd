import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailIni, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignRuntime, campaignCapabilities, campaignStartingCredits } from '../../src/game/campaign/CampaignRuntime';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { SoundSpecs } from '../../src/engine/sound/SoundSpecs';
import { retailCampaignWeapon } from '../../src/game/campaign/CampaignTypeRegistry';
import { GameObject } from '../../src/game/gameobject/GameObject';
import { PoweredTrait } from '../../src/game/gameobject/trait/PoweredTrait';
import { TriggerExecutorFactory } from '../../src/game/trigger/TriggerExecutorFactory';
import { TaskStatus } from '../../src/game/gameobject/task/system/TaskStatus';
import { MoveTask } from '../../src/game/gameobject/task/move/MoveTask';
import { CampaignDeployIntoTask } from '../../src/game/campaign/CampaignDeployIntoTask';
import { DeployIntoTask } from '../../src/game/gameobject/task/morph/DeployIntoTask';
import { ScatterTask } from '../../src/game/gameobject/task/ScatterTask';
import { DifficultyRules } from '../../src/game/rules/DifficultyRules';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all10s.map');
const sourceSha256 = 'ac0ea14ec650256a014626db7c78135bb74168ba86d4eb863d987f04b07d1593';
const read = () => new CampaignDefinition('ra2', 'all10s.map', file.readAsString(), undefined,
    { sourceSha256, semanticsVersion: 24 });

test('original Allied10 preserves the laboratory failure, three-house goal, nonmonotonic delays and source media', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const source = read(); source.assertValid();
    expect([source.triggers.size, source.scripts.size, source.teams.size, source.taskForces.size, source.aiTriggers.size])
        .toEqual([89, 64, 66, 54, 32]);
    expect(source.ini.getSection('Map')!.getString('Theater')).toBe('SNOW');
    expect(source.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(true);
    expect(source.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1500, 750, 500]);
    expect(source.triggers.get('0924EB00')!.events.map(event => [event.opcode, event.params[1]]))
        .toEqual([[11, '15'], [11, '16'], [11, '17']]);
    expect(source.triggers.get('0B0CF040')!.events.map(event => event.opcode)).toEqual([48]);
    const media = campaignMediaReferences(source, retailIni('ra2', 'art'));
    expect([...new Set(media.map(ref => ref.name))]).toEqual(['a10_f00e', 'a10_p01e', 'a10_p02e']);
    expect(campaignMissionSemantics('all09t.map')).toBe(23); expect(campaignMissionSemantics('all10s.map')).toBe(24);
    expect(campaignMissionImplemented('ra2', 'all10s.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all11t.map')).toBe(true);
    expect(campaignPreflight(source, campaignCapabilities)).toEqual([]);
});

test('source random timers draw on construction and every enable, then expire on the exact simulation tick', () => {
    const source = read(), draws: number[][] = [], actions: any[] = [];
    const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], condition: () => false,
        randomInt: (minimum, maximum) => { draws.push([minimum, maximum]); return maximum; },
        action: action => actions.push({ tick: machine.tick, opcode: action.opcode, key: action.key }) }, 15, false, 24);
    expect(draws).toEqual([[0, 6], [0, 8], [0, 8]]);
    expect(['09EE4770', '09EE67B0', '09EE63A0'].map(id => machine.states.get(id)!.sourceTimerTicks))
        .toEqual([135, 180, 180]);
    for (const id of machine.states.keys()) machine.setEnabled(id, false);
    machine.setEnabled('09EE4770', true); expect(draws).toHaveLength(4);
    for (let i = 0; i < 80; i++) machine.update();
    const saved = machine.snapshot(); expect(saved.tick).toBe(80); expect(actions).toEqual([]);
    machine.setEnabled('09EE4770', true); expect(draws).toHaveLength(5);
    expect(machine.states.get('09EE4770')!.enabledTick).toBe(80);
    machine.restore(saved);
    for (let i = 80; i < 135; i++) machine.update(); expect(actions).toEqual([]);
    machine.update();
    expect(actions).toEqual([{ tick: 135, opcode: 32, key: '09EE4770' }, { tick: 135, opcode: 7, key: '09EE4770' }]);
    expect(draws).toHaveLength(5);
    const invalid = structuredClone(saved);
    delete invalid.triggers.find(([id]) => id === '09EE4770')![1].sourceTimerTicks;
    expect(() => machine.restore(invalid)).toThrow('Incompatible campaign trigger snapshot');
    expect(() => new CampaignTriggerMachine(source, 'normal', { targets: () => [], condition: () => false, action() {} }))
        .toThrow('Source random delay requires campaign interpreter 24');
});

test('the source available-money condition includes equality and remains a current-state condition', () => {
    const source = read(), trigger = source.triggers.get('0B17C1F0')!, owner = { credits: 2000 };
    const event = trigger.events.find(event => event.opcode === 52)!;
    const host: any = { launch: { semanticsVersion: 24 }, targets: () => [], resolveHouse: (house: string) => {
        expect(house).toBe('Player'); return owner;
    } };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, event, trigger, []);
    expect(check()).toBe(true); owner.credits = 2001; expect(check()).toBe(false);
    owner.credits = 1999; expect(check()).toBe(true);
    host.launch.semanticsVersion = 23; expect(check).toThrow('campaign interpreter 24');
});

test('source script25 uses original SoundList order and advances once without fabricated speech', () => {
    const original = retailMember('ra2', 'sound.ini');
    expect(original.sha256).toBe('0bae295685bbe7e83d7fbd765d25825df392695676b9e73fa456a5c4305bf6f5');
    const sounds = new SoundSpecs(new IniFile(original.file.readAsString()));
    expect([405, 421].map(index => sounds.getOriginalName(index))).toEqual(['TextBleep', 'MenuSlideIn']);
    expect(() => sounds.getOriginalName(499)).toThrow('Unknown original sound index');
    const compact = new SoundSpecs(new IniFile('[Defaults]\nVolume=100\n[SoundList]\n42=One\n1=\n9=one\n8=Two\n[One]\n[Two]\n'));
    expect([0, 1].map(index => compact.getOriginalName(index))).toEqual(['One', 'Two']);
    expect(() => compact.getOriginalName(2)).toThrow('Unknown original sound index');
    const definition = read(), script = definition.scripts.get('0AE7CA6C')!, calls: number[] = [];
    expect(script.instructions[0]).toMatchObject({ opcode: 25, params: ['405'] });
    const team: any = { type: 'fixture', line: 0, members: [], tasks: [], started: false };
    const host: any = { definition, semanticsVersion: 24, trace: [], require: () => ({ script: script.id }),
        playSourceSound: (index: number) => calls.push(index), advance: (CampaignTeams.prototype as any).advance };
    (CampaignTeams.prototype as any).tickScript.call(host, team, 100);
    expect(calls).toEqual([405]); expect(team.line).toBe(1); expect(host.trace).toHaveLength(1);
    host.semanticsVersion = 23; team.started = false; team.line = 0;
    expect(() => (CampaignTeams.prototype as any).tickScript.call(host, team, 101)).toThrow('campaign interpreter 24');
});

test('Allied10 explosion references resolve the source allocation pass rather than an incidental engine index', () => {
    const ini = retailIni('ra2').mergeWith(read().ini), requested: string[] = [];
    const rules: any = { getIni: () => ini, getWeapon: (name: string) => { requested.push(name); return ini.getSection(name)!; } };
    const weapon = retailCampaignWeapon(rules, 35);
    expect(requested).toEqual(['120mmE']); expect(weapon.getNumber('Damage')).toBe(85);
    expect(weapon.getString('Warhead')).toBe('RHINAPE');
    expect([0, 1, 2].map(index => retailCampaignWeapon(rules, index).name)).toEqual(['DefaultDeathWeapon', 'Vulcan2', 'NukeCarrier']);
    expect(() => retailCampaignWeapon(rules, 9999)).toThrow('outside the qualified initial allocation pass');
    expect(read().triggers.get('0931E830')!.actions.at(-1)).toMatchObject({ opcode: 42,
        params: ['0', '35', '0', '0', '0', '0', 'AF'] });
});

test('source chrono power-off reaches only tagged buildings and remains gated for earlier journals', () => {
    const definition = read(), trigger = definition.triggers.get('0C701BBC')!, action = trigger.actions[0];
    const building: any = Object.assign(Object.create(GameObject.prototype), { isBuilding: () => true,
        owner: { campaignSemanticsVersion: 24, powerTrait: { level: 1 } }, rules: { power: -200 } });
    building.poweredTrait = new PoweredTrait(building);
    const host: any = { launch: { semanticsVersion: 24 }, machine: { tick: 0 }, trace: [], game: {},
        targets: () => [building, Object.create(GameObject.prototype)], executorFactory: new TriggerExecutorFactory() };
    expect(building.poweredTrait.isPoweredOn()).toBe(true);
    (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    expect(building.poweredTrait.isPoweredOn()).toBe(false);
    expect(definition.tagsForTrigger(trigger.id)).toHaveLength(1);
    host.launch.semanticsVersion = 23;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, action, trigger)).toThrow('campaign interpreter 24');
});

test('source scouting moves toward other houses, waits for its real task and shares visited houses between teams', () => {
    const owner = { name: 'owner' }, ally = { name: 'ally' }, neutral = { name: 'neutral' }, tile = { rx: 10, ry: 10 };
    const member: any = { id: 1, isSpawned: true, isDestroyed: false, rules: { speed: 6 } }, draws: number[][] = [];
    const target = { owner: ally, tile, isTechno: () => true, isSpawned: true, isDestroyed: false };
    const team: any = { owner, members: [member], tasks: [], line: 0 };
    const host: any = { definition: { houses: new Map([['owner', owner], ['ally', ally], ['neutral', neutral]]) },
        house: (name: string) => ({ owner, ally, neutral })[name], scoutedHouses: new Map(),
        game: { generateRandomInt: (minimum: number, maximum: number) => { draws.push([minimum, maximum]); return 0; },
            world: { getAllObjects: () => [target] }, rules: { general: { closeEnough: 1 } },
            map: { mapBounds: { getFullSize: () => ({ width: 20, height: 20 }) } } },
        canSpawn: () => true, tasks: (team: any, create: any) => { team.tasks = [{ unit: member, task: create(member) }]; },
        advance: (CampaignTeams.prototype as any).advance };
    const scout = (team: any) => (CampaignTeams.prototype as any).scout.call(host, team);
    scout(team); expect(draws).toEqual([[0, 1], [0, 0]]); expect(team.scoutHouse).toBe('ally');
    expect(team.tasks[0].task).toBeInstanceOf(MoveTask); expect(team.line).toBe(0);
    scout(team); expect(draws).toHaveLength(2); expect(host.scoutedHouses.get(owner).size).toBe(0);
    team.tasks[0].task.status = TaskStatus.Finished; scout(team);
    expect([...host.scoutedHouses.get(owner)]).toEqual(['ally']); expect(team.line).toBe(0);
    const second: any = { owner, members: [member], tasks: [], line: 0 };
    scout(second); expect(draws.at(-1)).toEqual([0, 0]);
    expect([...host.scoutedHouses.get(owner)]).toEqual(['ally', 'neutral']);
    scout(team); expect(team.line).toBe(1); expect(draws).toHaveLength(3);
});

test('a source MCV waits through occupied foundation cells and performs the real morph after they clear', () => {
    let clear = false;
    const tile = { rx: 110, ry: 38 }, events: any[] = [], building: any = { id: 2, healthTrait: { health: 100 } };
    const unit: any = { id: 1, owner: {}, tile, rules: { deploysInto: 'NACNST' }, purchaseValue: 2500,
        healthTrait: { health: 75 }, isSpawned: true, isVehicle: () => true, dispose() {} };
    const worker = { canPlaceAt: (_: any, at: any, options: any) => {
        expect(at).toBe(tile); expect(options).toEqual({ ignoreAdjacent: true, ignoreObjects: [unit] }); return clear;
    }, placeAt: () => [building] };
    const game: any = { getConstructionWorker: () => worker,
        getUnitSelection: () => ({ isSelected: () => false, getOrCreateSelectionModel: () => ({ getControlGroupNumber: () => undefined }) }),
        unspawnObject: () => { unit.isSpawned = false; }, events: { dispatch: (event: any) => events.push(event) } };
    const current: any = new CampaignDeployIntoTask(game); current.morphInto = { type: 2, name: 'NACNST' };
    expect(current.onTick(unit)).toBe(false); expect(current.onTick(unit)).toBe(false);
    expect(unit.isSpawned).toBe(true); expect(unit.replacedBy).toBeUndefined(); expect(events).toEqual([]);
    const legacy: any = new DeployIntoTask(game); legacy.morphInto = current.morphInto;
    expect(legacy.onTick(unit)).toBe(true); expect(unit.isSpawned).toBe(true);
    clear = true; expect(current.onTick(unit)).toBe(true);
    expect(unit.isSpawned).toBe(false); expect(unit.replacedBy).toBe(building);
    expect(building.healthTrait.health).toBe(75); expect(building.purchaseValue).toBe(2500); expect(events).toHaveLength(1);
});

test('AI deployment queues real allied scattering after cancelling old movement and leaves passing movers and enemies alone', () => {
    const owner = { isAi: true }, tile = { rx: 10, ry: 10 }, cell = { rx: 9, ry: 9 };
    const occupant = (friendly: boolean, moving: boolean) => {
        const tasks: any[] = [{ status: TaskStatus.Running }], calls: string[] = [];
        return { owner: friendly ? owner : {}, isSpawned: true, tasks, calls, isDestroyed: false, isUnit: () => true,
            moveTrait: { isMoving: () => moving, isDisabled: () => false },
            unitOrderTrait: { getTasks: () => tasks, clearOrders: () => calls.push('clear'),
                cancelAllTasks: () => { calls.push('cancel'); tasks.forEach(task => task.status = TaskStatus.Cancelling); },
                addTask: (task: any) => { calls.push('add'); tasks.push(task); } } };
    };
    const ally = occupant(true, false), moving = occupant(true, true), enemy = occupant(false, false);
    const worker = { canPlaceAt: () => false, normalizePlacementTileCoords: () => cell };
    const unit: any = { owner, tile, rules: { deploysInto: 'NACNST' } };
    const game: any = { getConstructionWorker: () => worker, areFriendly: (a: any, b: any) => a.owner === b.owner,
        art: { getObject: () => ({ foundation: { width: 1, height: 1 } }) },
        map: { tiles: { getByMapCoords: () => cell }, getGroundObjectsOnTile: () => [unit, ally, ally, moving, enemy] } };
    const task = new CampaignDeployIntoTask(game);
    expect(task.onTick(unit)).toBe(false);
    expect(ally.tasks).toHaveLength(2); expect(ally.tasks[0].status).toBe(TaskStatus.Cancelling);
    expect(ally.tasks[1]).toBeInstanceOf(ScatterTask); expect(ally.calls).toEqual(['clear', 'cancel', 'add']);
    expect((ally.tasks[1] as any).options.excludedTiles).toEqual([cell]);
    expect(moving.calls).toEqual([]); expect(enemy.calls).toEqual([]);
    expect(task.onTick(unit)).toBe(false); expect(ally.tasks).toHaveLength(2);
});

test('Allied10 retains distinct handicaps, cash, babysitters, AI eligibility and nonmonotonic team delays', () => {
    const source = read(), rules = retailIni('ra2').mergeWith(source.ini);
    const expected = {
        easy: { human: [1.2, .8, .8], ai: [.8, 1.2, 1], delay: 500, cash: 10050, aiCount: 18, babysitters: 0 },
        normal: { human: [1, 1, 1], ai: [1, 1, 1], delay: 750, cash: 10000, aiCount: 29, babysitters: 3 },
        hard: { human: [.8, 1.2, 1], ai: [1.2, .8, .8], delay: 1500, cash: 9950, aiCount: 32, babysitters: 3 },
    };
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const row = expected[difficulty], human = DifficultyRules.readCampaign(rules, true, difficulty);
        const ai = DifficultyRules.readCampaign(rules, false, difficulty);
        expect([human.armor, human.rof, human.buildTime]).toEqual(row.human);
        expect([ai.armor, ai.rof, ai.buildTime]).toEqual(row.ai); expect(ai.teamDelay).toBe(row.delay);
        expect(campaignStartingCredits(10000, true, difficulty, rules, true)).toBe(row.cash);
        expect([...source.aiTriggers.values()].filter(trigger => trigger.enabled && trigger.difficulties[difficulty]))
            .toHaveLength(row.aiCount);
        const babysitters = ['0B02E3EC', '0B02FCAC', '0B02F81C'];
        expect(babysitters.filter(id => source.triggers.get(id)!.difficulties[difficulty])).toHaveLength(row.babysitters);
    }
});

test('the actual source goal and laboratory failure require their distinct conditions and five-second result delays', () => {
    for (const result of ['victory', 'defeat'] as const) {
        const source = read(), gone = new Set<string>(), actions: any[] = [];
        let labGone = false;
        const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => [], randomInt: () => 0,
            condition: event => event.opcode === 11 ? gone.has(event.params[1]) : event.opcode === 48 ? labGone : false,
            action: action => actions.push({ tick: machine.tick, opcode: action.opcode }) }, 15, false, 24);
        for (const id of machine.states.keys()) machine.setEnabled(id,
            ['0924EB00', '09F864EC', '0B0CF040', '09F7978C'].includes(id) && ['0924EB00', '0B0CF040'].includes(id));
        gone.add('15'); gone.add('16'); machine.update();
        expect(actions).toEqual([]); expect(machine.states.get('09F864EC')!.enabled).toBe(false);
        if (result === 'victory') gone.add('17'); else labGone = true;
        machine.update();
        const resultOpcode = result === 'victory' ? 1 : 2;
        for (let i = 0; i < 74; i++) machine.update();
        expect(actions.some(action => [1, 2].includes(action.opcode))).toBe(false);
        machine.update();
        expect(actions.filter(action => [1, 2].includes(action.opcode))).toEqual([{ tick: 76, opcode: resultOpcode }]);
    }
});

test('the original linked240-second fallback remains active instead of silently granting late AI production', () => {
    const source = read(), starts = ['08DC9190', '08DC95C0', '08DCA960'];
    const enables = ['0A46D390', '0A468930', '0A4685D0'], fallbacks = ['0AD3822C', '0AD3EBBC', '0AD3E9AC'];
    for (const deployments of [[3000, 3100, 3200], [3697, 3672, 3351]]) {
        const production: string[] = [];
        const machine = new CampaignTriggerMachine(source, 'normal', { targets: () => ['original-placeholder'], randomInt: () => 0,
            condition: (_, trigger) => enables.includes(trigger.id) && machine.tick >= deployments[enables.indexOf(trigger.id)],
            action: action => { if (action.opcode === 3) production.push(action.params[1]); } }, 15, false, 24);
        for (const id of machine.states.keys()) machine.setEnabled(id, enables.includes(id) || fallbacks.includes(id));
        for (let tick = 0; tick < 4200; tick++) machine.update();
        expect(production).toEqual(deployments[0] === 3000 ? ['15', '16', '17'] : ['17']);
        expect(starts.map(id => machine.states.get(id)!.fired)).toEqual(deployments[0] === 3000 ? [1, 1, 1] : [0, 0, 1]);
    }
});
