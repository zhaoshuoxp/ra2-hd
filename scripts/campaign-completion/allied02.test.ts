import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { IniFile } from '../../src/data/IniFile';
import { WeaponTargeting } from '../../src/game/WeaponTargeting';
import { WeaponType } from '../../src/game/WeaponType';
import { LandTargeting } from '../../src/game/type/LandTargeting';
import { AttackOrder } from '../../src/game/order/AttackOrder';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { ObjectType } from '../../src/engine/type/ObjectType';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix').openFile('all02s.map').getBytes();
const sourceSha256 = '5ebd7a3aaa60215a6da1f63e87a53c4ebf8cb28378b09f7128953ab05e6425fc';
expect(sha256(bytes)).toBe(sourceSha256);
const text = new TextDecoder().decode(bytes), policy = { sourceSha256, semanticsVersion: 16 };
const read = (source = text, admission = policy) => new CampaignDefinition('ra2', 'all02s.map', source, undefined, admission);

test('original Allied02 retains chapel capture, both enemy-house goals, Tanya loss and all source records', () => {
    const original = read(); original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([84, 36, 44, 28, 23]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('SNOW');
    expect(original.triggers.get('0913BE4C')!.events.map(event => [event.opcode, event.params]))
        .toEqual([[11, ['0', '7']], [11, ['0', '8']]]);
    expect(original.triggers.get('0874619C')!.events[0].params).toEqual(['0', '10']);
    expect(original.triggers.get('0A1A33BC')!.events[0].opcode).toBe(32);
    expect(original.triggers.get('0BF0490C')!.events[0].params).toEqual(['0', '186']);
    expect(original.triggers.get('0A3876DC')!.actions[0].opcode).toBe(2);
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a02_f00e', 'before-mission'], ['a02_p02e', 'transmission'], ['a02_p01e', 'transmission']]);
});

test('orphan source scripts remain intact and cannot bypass checks when reachable or outside the pinned source policy', () => {
    const original = read(); expect([...original.dormantScripts]).toEqual(['0C258A1C', '0976F91C']);
    expect(original.scripts.get('0976F91C')!.instructions.map(line => [line.opcode, line.params]))
        .toEqual([[45, ['0']], [3, ['44']], [3, ['43']]]);
    expect(original.scripts.get('0C258A1C')!.instructions[0].raw).toBe('11,14');
    expect(campaignCapabilities.scripts.has(45)).toBe(false);
    for (const admission of [{ ...policy, semanticsVersion: 15 }, { ...policy, sourceSha256: '0'.repeat(64) }]) {
        expect([...read(text, admission).dormantScripts]).toEqual([]);
    }
    const firstScript = [...original.teams.values()][0].script;
    const reachable = text.replace(`Script=${firstScript}`, 'Script=0976F91C'); expect(reachable).not.toBe(text);
    expect(campaignPreflight(read(reachable), campaignCapabilities).some(issue => issue.reason.includes('Script opcode 45'))).toBe(true);
    const enabled = text.replace('IgnoreGlobalAITriggers=yes', 'IgnoreGlobalAITriggers=no'); expect(enabled).not.toBe(text);
    expect([...read(enabled).dormantScripts]).toEqual([]);
    const transitions = text.replace('0=45,0', '0=17,0'); expect(transitions).not.toBe(text);
    expect([...read(transitions).dormantScripts]).toEqual([]);
});

test('actual music requests retain their source tick and selected theme while replay suppresses asynchronous presentation', () => {
    const trigger = read().triggers.get('07B1F0AC')!, action = trigger.actions[1], calls: unknown[] = [];
    expect([action.opcode, action.params[1]]).toEqual([20, 'InDeep']);
    const host: any = { launch: { semanticsVersion: 16 }, trace: [], machine: { tick: 123 },
        uiAction: (value: unknown) => calls.push(value) };
    const execute = () => (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    execute(); expect(host.musicTheme).toBe('InDeep'); expect(host.machine.tick).toBe(123); expect(calls).toEqual([action]);
    host.musicTheme = undefined; host.restoring = true; execute();
    expect(host.musicTheme).toBe('InDeep'); expect(calls.length).toBe(1);
    host.launch.semanticsVersion = 15; expect(execute).toThrow('interpreter 16');
});

test('original one-way Alliance hostility permits rocketeer fire and C4 without changing victim diplomacy or old journals', () => {
    const original = read(), allies = new Map([...original.houses].map(([name, house]) => [name, house.allies]));
    expect(allies.get('Confederation')).toContain('Alliance'); expect(allies.get('Alliance')).not.toContain('Confederation');
    const actor: any = { name: 'JUMPJET', owner: { name: 'Alliance', campaignSemanticsVersion: 16 },
        rules: { landTargeting: LandTargeting.LandOk }, isAircraft: () => false };
    const target: any = { name: 'NALASR', owner: { name: 'Confederation' }, rules: {}, healthTrait: { health: 70 },
        isTechno: () => true, isBuilding: () => true, isUnit: () => false, isInfantry: () => false,
        isAircraft: () => false, c4ChargeTrait: {} };
    const game: any = { campaign: { launch: { semanticsVersion: 16 } },
        map: { getGroundObjectsOnTile: () => [] },
        areFriendly: (a: any, b: any) => a.owner === b.owner || allies.get(a.owner.name)!.includes(b.owner.name) };
    const targeting = (damage: number) => new WeaponTargeting(WeaponType.Primary, { isAntiAir: true, isAntiGround: true },
        { damage }, {}, actor, { prism: { type: 'SREF' } });
    expect(targeting(20).canTarget(target, undefined, game)).toBe(true);
    target.isUnit = () => true;
    expect(targeting(-20).canTarget(target, undefined, game)).toBe(false);
    actor.owner.campaignSemanticsVersion = 15;
    expect(targeting(20).canTarget(target, undefined, game)).toBe(false);
    expect(targeting(-20).canTarget(target, undefined, game)).toBe(true);
    const c4: any = { sourceObject: { ...actor, c4: true, attackTrait: {} }, target: { obj: target }, game };
    expect(AttackOrder.prototype.isValid.call(c4)).toBe(true); expect(c4.isC4).toBe(true);
    expect(game.areFriendly(target, actor)).toBe(true); expect(game.areFriendly(actor, target)).toBe(false);
});

test('the actual chapel entry tag disables absence loss before capture while preserving the French and destruction branches', () => {
    function fixture() {
        const definition = read(), actions: string[] = [];
        const state = { absent: false, french: false, entered: false };
        const machine = new CampaignTriggerMachine(definition, 'normal', {
            targets: trigger => definition.tagsForTrigger(trigger.id).some(tag => tag.id === '0A1A669C') ? ['object:1139'] : [],
            condition: (event, trigger) => trigger.id === '0BF0490C' ? state.absent
                : trigger.id === '0A1A33BC' ? state.french
                    : trigger.id === '0926B97C' ? state.entered ? ['object:1139'] : [] : false,
            action: (_action, trigger) => actions.push(trigger.id),
        });
        return { definition, machine, state, actions };
    }
    const direct = fixture();
    direct.machine.notify(direct.definition.triggerChain('0926B97C'), 1, () => ['object:1139']);
    expect(direct.machine.tick).toBe(0); expect(direct.machine.states.get('0926B97C')!.fired).toBe(1);
    expect(direct.machine.states.get('0BF0490C')!.finished).toBe(true);
    direct.state.absent = direct.state.entered = true; direct.machine.update();
    expect(direct.actions).not.toContain('0BF0490C'); expect(direct.machine.states.get('0926B97C')!.fired).toBe(1);
    const french = fixture(); french.machine.notify(french.definition.triggerChain('0926B97C'), 1, () => []);
    french.state.absent = french.state.french = true; french.machine.update();
    expect(french.machine.states.get('0A1A33BC')!.fired).toBe(1); expect(french.actions).not.toContain('0BF0490C');
    const destroyed = fixture(); destroyed.state.absent = true; destroyed.machine.update();
    expect(destroyed.actions).toContain('0BF0490C');
    const deferred = fixture(); deferred.state.absent = deferred.state.entered = true; deferred.machine.update();
    expect(deferred.actions).toContain('0BF0490C');
});

test('the original immediate Destroy Team releases the script while all six airborne engineers still arrive', () => {
    const definition = read(), trigger = definition.triggers.get('09B5298C')!;
    expect(trigger.actions.filter(action => [80, 5].includes(action.opcode)).map(action => [action.opcode, action.params[1]]))
        .toEqual([[80, '0C5E612C'], [5, '0C5E612C']]);
    const spec = definition.teams.get('0C5E612C')!, force = definition.taskForces.get(spec.taskForce)!;
    expect(force.units).toEqual([{ count: 6, type: 'ENGINEER' }]); expect(spec.properties.Droppod).toBe('yes');
    for (const version of [15, 16]) {
        const spawned: any[] = [], enabled: boolean[] = [], owner = { name: 'Americans' };
        const tile = { rx: 5, ry: 6, z: 0 }, rules = { type: ObjectType.Infantry };
        const plane = { id: 900, tile, tileElevation: 6, traits: { get: () => ({ setEnabled: (value: boolean) => enabled.push(value) }) },
            unitOrderTrait: { hasTasks: () => true } };
        const game: any = { map: { getTileZone: () => 0 }, currentTick: 0, world: { getAllObjects: () => spawned },
            rules: { general: { paradrop: { paradropRadius: 256 } }, hasObject: () => true, getObject: () => rules,
                getIni: () => new IniFile('[General]\n') },
            createUnitForPlayer: () => ({ id: spawned.length + 1, position: {}, unitOrderTrait: { addTask() {} } }),
            spawnObject: (unit: any) => { unit.isSpawned = true; spawned.push(unit); } };
        const teams: any = new CampaignTeams(definition, game, () => owner, undefined, version);
        teams.tickAi = () => {}; teams.canSpawn = () => true; teams.freeSubCell = () => 0;
        const team: any = { id: 8, type: spec.id, owner, members: [], tasks: [], phase: 'flying', line: 0,
            flight: { plane, target: tile, exit: tile, remaining: Array(6).fill('ENGINEER'), dropping: false } };
        teams.instances.set(8, team); teams.destroy(spec.id);
        expect(team.phase).toBe('finished'); expect(team.line).toBe(0);
        if (version === 16) expect(teams.snapshot().detachedFlights).toEqual([8]);
        for (let tick = 1; tick <= 7; tick++) teams.update(tick);
        expect(spawned.length).toBe(version === 16 ? 6 : 0);
        expect(team.phase).toBe('finished'); expect(team.line).toBe(0); expect(team.members).toEqual([]);
        if (version === 16) { expect(enabled).toEqual([true]); expect(teams.snapshot().detachedFlights).toEqual([]); }
        else expect(team.flight.remaining.length).toBe(6);
    }
});
