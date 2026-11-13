import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { IniFile } from '../../src/data/IniFile';
import { EventType } from '../../src/game/event/EventType';
import { SoundHandler } from '../../src/gui/screen/game/SoundHandler';
import { SoundControl } from '../../src/engine/sound/SoundSpecs';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix').openFile('all01t.map').getBytes();
expect(sha256(bytes)).toBe('ad64c9293a8bccb85c38f5871a974ed9c09b8b5da11bb346e990423bf625c79c');
const original = new CampaignDefinition('ra2', 'all01t.map', new TextDecoder().decode(bytes));
const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString());

test('first Allied source preserves the original base-destruction goal, Tanya branch and local rules', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([130, 38, 49, 29, 6]);
    expect(original.triggers.get('07506C5C')!.events.map(event => [event.opcode, event.params])).toEqual([[10, ['0', '14']]]);
    expect(original.triggers.get('075F22EC')!.events[0].params).toEqual(['0', '10']);
    expect(original.triggers.get('08B9BC5C')!.actions[0].opcode).toBe(2);
    expect(original.ini.getSection('TANY')!.getNumber('Strength')).toBe(250);
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1000, 750, 500]);
    expect(rules.getSection('Sticky')!.getBool('Paralyzed')).toBe(true);
    expect(rules.getSection('Sticky')!.getBool('Recruitable')).toBe(false);
});

test('source Flash Team affects every live instance but never a destroyed team or unrelated actor', () => {
    const teams: any = new CampaignTeams(original, { map: {} }, () => undefined, undefined, 15);
    const active = { isSpawned: true }, second = { isSpawned: true }, dead = { isSpawned: true, isDestroyed: true };
    const detached = { isSpawned: true }, unrelated = { isSpawned: true };
    teams.instances.set(1, { type: '0A67F6CC', phase: 'active', members: [active, dead] });
    teams.instances.set(2, { type: '0A67F6CC', phase: 'holding', members: [second] });
    teams.instances.set(3, { type: '0A67F6CC', phase: 'finished', members: [detached] });
    teams.instances.set(4, { type: '0B533EFC', phase: 'active', members: [unrelated] });
    teams.flash('0A67F6CC', 70, 120);
    expect((active as any).campaignFlashUntil).toBe(190); expect((second as any).campaignFlashUntil).toBe(190);
    for (const unit of [dead, detached, unrelated]) expect((unit as any).campaignFlashUntil).toBeUndefined();
    expect(() => teams.flash('0A67F6CC', -1, 0)).toThrow('duration');
});

test('source-assigned armed Sticky holds ground when retaliating and retains its frozen version boundary', () => {
    const instruction = original.scripts.get('074E4DBC')!.instructions[1];
    expect([instruction.opcode, instruction.params[0]]).toEqual([11, '6']);
    const tasks: any[] = [], options: any[] = [], target = {};
    const unit: any = { id: 1, primaryWeapon: {}, rules: {}, isSpawned: true,
        isUnit: () => true, isInfantry: () => false, isAircraft: () => false,
        unitOrderTrait: { clearOrders() {}, cancelAllTasks() {}, hasTasks: () => false, addTask: (task: any) => tasks.push(task) } };
    const teams: any = new CampaignTeams(original, { map: {} }, () => undefined, undefined, 15);
    teams.mission({ members: [unit] }, Number(instruction.params[0]));
    expect(unit.campaignSticky).toBe(true); expect(unit.guardMode).toBe(false);
    const attack: any = { retaliateTarget: target, isDisabled: () => false, shouldPassiveAcquire: () => false,
        selectWeaponVersus: () => ({}), createAttackTask: (...args: any[]) => { options.push(args[4]); return {}; } };
    const game = { campaign: { launch: { semanticsVersion: 15 } }, isValidTarget: () => true, rules: { getIni: () => rules } };
    AttackTrait.prototype[NotifyTick.onTick].call(attack, unit, game);
    expect(tasks.length).toBe(1); expect(options[0].holdGround).toBe(true);
    expect(unit.campaignSticky).toBe(true);
    const frozen: any = new CampaignTeams(original, { map: {} }, () => undefined, undefined, 14);
    expect(() => frozen.mission({ members: [unit] }, 6)).toThrow('Unsupported team mission: 6');
});

test('point sounds stop only their source location and restore loops without replaying expired one-shots', () => {
    const events: any[] = [], tiles = new Map([[32, { rx: 18, ry: 20, z: 0 }], [33, { rx: 19, ry: 20, z: 0 }]]);
    const host: any = { launch: { semanticsVersion: 15 }, soundEmitters: new Map(), trace: [], machine: { tick: 100 },
        game: { map: { getTileAtWaypoint: (id: number) => tiles.get(id) }, events: { dispatch: (event: any) => events.push(event) } } };
    const execute = (opcode: number, sound: string, waypoint: string) => (CampaignRuntime.prototype as any).execute.call(host,
        { opcode, section: 'Actions', key: 'sound', params: ['0', sound, '0', '0', '0', '0', waypoint] }, { id: 'sound' });
    execute(99, 'loop', 'AG'); execute(99, 'one-shot', 'AG'); execute(99, 'loop', 'AH');
    expect(host.soundEmitters.size).toBe(2);
    execute(116, '32', 'AG'); expect(host.soundEmitters.size).toBe(1);
    expect(events[3].type).toBe(EventType.TriggerStopSoundFx); expect(events[3].tile).toBe(tiles.get(32));
    const handles: any[] = [], callbacks: any[] = [];
    const game: any = { campaign: { launch: { semanticsVersion: 15 }, soundEmitters: host.soundEmitters }, map: host.game.map };
    const sound = { getSoundSpec: (name: string) => ({ control: new Set(name === 'loop' ? [SoundControl.Loop] : []) }) };
    const handler: any = new SoundHandler(game, { playEffect: () => {
        const handle = { stopped: false, isPlaying: () => true, stop() { this.stopped = true; } }; handles.push(handle); return handle;
    } }, undefined, sound, { subscribe: (callback: any) => { callbacks.push(callback); return () => {}; } }, undefined, undefined, {});
    host.soundEmitters.get('19,20,0').push({ sound: 'one-shot', waypoint: 33, tick: 0 });
    handler.init(); expect(handles.length).toBe(1);
    callbacks[0]({ type: EventType.TriggerSoundFx, soundId: 'loop', tile: tiles.get(32) });
    callbacks[0]({ type: EventType.TriggerStopSoundFx, tile: tiles.get(32) });
    expect(handles[0].stopped).toBe(false); expect(handles[1].stopped).toBe(true);
    handler.dispose(); expect(handles[0].stopped).toBe(true);
    host.restoring = true; execute(99, 'loop', 'AG'); expect(events.length).toBe(4);
});
