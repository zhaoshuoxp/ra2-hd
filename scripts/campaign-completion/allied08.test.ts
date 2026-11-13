import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CountdownTimer } from '../../src/game/CountdownTimer';
import { TriggerExecutorFactory } from '../../src/game/trigger/TriggerExecutorFactory';
import { CampaignCameraPan } from '../../src/gui/campaign/CampaignCameraPan';
import { validCampaignPresentation } from '../../src/game/campaign/CampaignCheckpoint';
import { RepairOrder } from '../../src/game/order/RepairOrder';

const file = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all08u.map');
const sourceSha256 = '71a119187bd8f78a1c7677636e20a18a258f24dc94add2ac2b108a3dae9df8ea';
const read = () => new CampaignDefinition('ra2', 'all08u.map', file.readAsString(), undefined,
    { sourceSha256, semanticsVersion: 22 });

test('original Allied08 retains beacon control, timed house changes, all difficulty records and actual media', () => {
    expect(sha256(file.getBytes())).toBe(sourceSha256);
    const original = read(); original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size,
        original.aiTriggers.size]).toEqual([109, 51, 64, 62, 31]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('URBAN');
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1500, 1250, 1000]);
    expect(original.triggers.get('08D59F3C')!.actions.find(action => action.opcode === 27)!.params[1]).toBe('1200');
    expect(original.triggers.get('0B8A848C')!.events[2].params[1]).toBe('900');
    expect(original.triggers.get('0B8A9B6C')!.events[2].params[1]).toBe('1080');
    expect(original.scripts.get('083508EC')!.instructions.map(line => [line.opcode, ...line.params]))
        .toEqual([[34, '4'], [50, '15'], [24, '154'], [20, '16']]);
    expect(original.triggers.get('087966DC')!.difficulties).toEqual({ easy: true, normal: true, hard: false });
    expect(original.triggers.get('087965EC')!.linked).toBe('087966DC');
    expect(original.triggers.get('09AB895C')!.difficulties).toEqual({ easy: false, normal: false, hard: true });
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a08_f00e', 'before-mission'], ['a08_p01e', 'transmission'], ['a08_p02e', 'transmission']]);
    expect(campaignMissionSemantics('all07t.map')).toBe(21); expect(campaignMissionSemantics('all08u.map')).toBe(22);
    expect(campaignMissionImplemented('ra2', 'all08u.map')).toBe(true);
    expect(campaignMissionImplemented('ra2', 'all11t.map')).toBe(true);
});

test('source timer bonus adds600 seconds to the remaining fractional ticks and preserves running or stopped state', () => {
    const original = read(), trigger = original.triggers.get('087966DC')!, action = trigger.actions[1];
    const game = { countdownTimer: new CountdownTimer() }, host: any = { launch: { semanticsVersion: 22 },
        trace: [], machine: { tick: 100 }, game, executorFactory: new TriggerExecutorFactory(), targets: () => [] };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    game.countdownTimer.setSeconds(1200); game.countdownTimer.start();
    game.countdownTimer.update({ events: { dispatch() {} } }); execute();
    expect(game.countdownTimer.snapshot()).toEqual({ ticks: 26999, running: true, text: null });
    game.countdownTimer.stop(); execute();
    expect(game.countdownTimer.snapshot()).toEqual({ ticks: 35999, running: false, text: null });
    host.launch.semanticsVersion = 21; expect(execute).toThrow('interpreter 22');
});

test('the original linked refinery/factory bonus shares one volatile source tag and does not award twice', () => {
    const original = read(), actions: any[] = [];
    const machine = new CampaignTriggerMachine(original, 'easy', { targets: () => [], condition: () => false,
        action: action => actions.push(action) });
    for (const id of machine.states.keys()) machine.setEnabled(id, ['087966DC', '087965EC'].includes(id));
    machine.variables.set('8', true); machine.update();
    expect(actions.filter(action => action.opcode === 25)).toHaveLength(1);
    machine.variables.set('7', true); machine.update();
    expect(actions.filter(action => action.opcode === 25)).toHaveLength(1);
    expect(original.tagsForTrigger('087965EC')).toEqual(original.tagsForTrigger('087966DC'));
});

test('original difficulty gates retain the600-second bonus and separate Easy/Normal extra Prism transports', () => {
    const original = read();
    for (const [difficulty, expectedBonus, expectedExtras] of [['easy', 1, 2], ['normal', 1, 1], ['hard', 0, 0]] as const) {
        const actions: any[] = [];
        const machine = new CampaignTriggerMachine(original, difficulty, { targets: () => [], condition: () => false,
            action: action => actions.push(action) });
        const relevant = ['087966DC', '087965EC', '0A197B2C', '0A19AAFC'];
        for (const id of machine.states.keys()) machine.setEnabled(id, relevant.includes(id));
        machine.variables.set('8', true);
        for (let tick = 0; tick < 76; tick++) machine.update();
        expect(actions.filter(action => action.opcode === 25)).toHaveLength(expectedBonus);
        expect(actions.filter(action => action.opcode === 7)).toHaveLength(expectedExtras);
    }
});

test('engineer repair uses the acting house directed alliance in22, preserving old campaign and skirmish validation', () => {
    const engineer: any = { rules: { engineer: true }, isInfantry: () => true };
    const building: any = { isBuilding: () => true, rules: { repairable: true }, healthTrait: { health: 10 },
        owner: { isCombatant: () => true } };
    let forward = true, reverse = false;
    const game: any = { campaign: { launch: { semanticsVersion: 22 } },
        areFriendly: (a: any, b: any) => a === engineer && b === building ? forward : reverse };
    const order = () => new RepairOrder(game).set(engineer, { obj: building });
    expect(order().isValid()).toBe(true); expect(order().isAllowed()).toBe(true);
    game.campaign.launch.semanticsVersion = 21; expect(order().isValid()).toBe(false);
    game.campaign = undefined; expect(order().isValid()).toBe(false);
    forward = false; reverse = true; game.campaign = { launch: { semanticsVersion: 22 } };
    expect(order().isValid()).toBe(false);
    game.campaign.launch.semanticsVersion = 21; expect(order().isValid()).toBe(true);
    building.healthTrait.health = 100; expect(order().isAllowed()).toBe(false);
});

test('source reshroud visits all combatants through normal owned-object and gap reset policy', () => {
    const original = read(), trigger = original.triggers.get('0B8A82CC')!, action = trigger.actions[0], reset: any[] = [];
    const owners = [{ name: 'Player' }, { name: 'Evil' }, { name: 'Allied' }];
    const game: any = { getCombatants: () => owners, mapShroudTrait: { resetShroud: (...args: any[]) => reset.push(args) } };
    const host: any = { launch: { semanticsVersion: 22 }, trace: [], machine: { tick: 300 }, game,
        executorFactory: new TriggerExecutorFactory(), targets: () => [] };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(reset).toEqual(owners.map(owner => [owner, game]));
    host.launch.semanticsVersion = 21; expect(execute).toThrow('interpreter 22');
});

test('original Tanya conversion retains camera, flash, explicit retail speech24 completion and later house change', () => {
    const original = read(), oldOwner = {}, evil = {}, tile = { rx: 90, ry: 60 }, calls: any[] = [];
    const member: any = { isSpawned: true, isDestroyed: false, owner: oldOwner, tile };
    const team: any = { id: 1, type: '08352E1C', owner: oldOwner, members: [member], line: 0,
        started: false, tasks: [], phase: 'active' };
    const host: any = { semanticsVersion: 22, definition: original, trace: [], require: (id: string) => original.teams.get(id),
        centerCamera: (members: any[], speed: number) => calls.push(['camera', members, speed]),
        house: (id: number) => { expect(id).toBe(16); return evil; },
        game: { changeObjectOwner: (actor: any, owner: any) => { calls.push(['owner', owner]); actor.owner = owner; } },
        advance: (CampaignTeams.prototype as any).advance };
    const tick = (n: number) => (CampaignTeams.prototype as any).tickScript.call(host, team, n);
    tick(100); expect(calls).toEqual([['camera', [member], 4]]); expect(team.line).toBe(1);
    tick(101); expect(member.campaignFlashUntil).toBe(116); expect(team.line).toBe(2);
    tick(102); expect(team.line).toBe(3); expect(calls).toHaveLength(1); expect(member.owner).toBe(oldOwner);
    expect(host.trace.at(-1)).toMatchObject({ opcode: 24, line: 2, tick: 102 });
    tick(103); expect(member.owner).toBe(evil); expect(team.owner).toBe(evil); expect(team.line).toBe(4);
    team.line = 0; team.started = false; host.semanticsVersion = 21; expect(() => tick(104)).toThrow('interpreter 22');
});

test('camera accepts the exact single-member original case, rejects unqualified centers and suppresses replay presentation', () => {
    const tile = {}, calls: any[] = [], member = { isSpawned: true, isDestroyed: false, tile };
    const host: any = { launch: { semanticsVersion: 22 }, restoring: false, uiTeamCamera: (...args: any[]) => calls.push(args) };
    const center = (members: any[], speed = 4) => (CampaignRuntime.prototype as any).centerTeamCamera.call(host, members, speed);
    center([member]); expect(calls).toEqual([[tile, 4]]);
    host.restoring = true; center([member]); expect(calls).toHaveLength(1);
    expect(() => center([member, member])).toThrow('source center qualification');
    expect(() => center([member], 5)).toThrow('Invalid source camera speed');
    host.launch.semanticsVersion = 21; expect(() => center([member])).toThrow('interpreter 22');
});

function camera() {
    let pan = { x: 0, y: 0 };
    const view = { getPan: () => ({ ...pan }), setPan: (value: typeof pan) => { pan = { ...value }; } };
    return { view, movement: new CampaignCameraPan(view) };
}

test('source camera progresses only with simulation ticks, uses its speed table and resumes an active saved move exactly', () => {
    const a = camera(); a.movement.center({ x: 1000, y: -1000 }, 4, 100);
    a.movement.update(100); expect(a.view.getPan()).toEqual({ x: 0, y: 0 });
    a.movement.update(103); const saved = a.movement.snapshot()!;
    expect(saved.progress).toBeCloseTo(.18, 6);
    const b = camera(); b.view.setPan(a.view.getPan()); b.movement.restore(saved);
    a.movement.update(110); b.movement.update(110);
    expect(b.view.getPan()).toEqual(a.view.getPan()); expect(b.movement.snapshot()).toEqual(a.movement.snapshot());
    a.movement.update(117); expect(a.view.getPan()).toEqual({ x: 1000, y: -1000 }); expect(a.movement.snapshot()).toBeUndefined();
    const slow = camera(); slow.movement.center({ x: 1000, y: 1000 }, 0, 0); slow.movement.update(100);
    expect(slow.movement.snapshot()!.progress).toBeCloseTo(.15, 5);
});

test('optional camera persistence keeps old presentation readable and rejects malformed new progress', () => {
    const legacy = { movies: [], speech: [], speechPolicy: 'restart-current-utterance' };
    expect(validCampaignPresentation(legacy)).toBe(true);
    const a = camera(); a.movement.center({ x: 50, y: 100 }, 2, 40); a.movement.update(41);
    const move = a.movement.snapshot()!;
    expect(validCampaignPresentation({ ...legacy, cameraMove: move })).toBe(true);
    for (const override of [{ speed: 5 }, { progress: 1 }, { progress: -1 }, { lastTick: .5 }, { from: { x: NaN, y: 0 } }]) {
        expect(validCampaignPresentation({ ...legacy, cameraMove: { ...move, ...override } })).toBe(false);
    }
    expect(() => a.movement.update(40)).toThrow('backwards');
});

test('original timed conversion loss preserves10-second radar delay,93-second ending delay and final reshroud', () => {
    const original = read(), actions: any[] = [];
    const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => [], condition: event => event.opcode === 14,
        action: action => actions.push({ tick: machine.tick, ...action }) });
    for (const id of machine.states.keys()) machine.setEnabled(id, ['0B8A96EC', '07BBC47C'].includes(id));
    for (let i = 0; i <= 1546; i++) machine.update();
    expect(actions.filter(action => action.opcode === 100).map(action => [action.tick, action.params[1]])).toEqual([[151, '72']]);
    expect(actions.filter(action => [51, 2].includes(action.opcode)).map(action => [action.tick, action.opcode]))
        .toEqual([[1546, 51], [1546, 2]]);
    expect(machine.variables.get('0')).toBe(true);
});
