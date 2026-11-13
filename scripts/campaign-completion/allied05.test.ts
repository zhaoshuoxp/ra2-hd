import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { CampaignSourceParticles } from '../../src/game/campaign/CampaignSourceParticles';
import { CampaignParticleSystems } from '../../src/game/campaign/CampaignParticleSystems';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { IdleActionTrait } from '../../src/game/gameobject/trait/IdleActionTrait';
import { Prng } from '../../src/game/Prng';
import { TransientAnim } from '../../src/engine/renderable/entity/TransientAnim';
import { Anim } from '../../src/engine/renderable/entity/Anim';
import { MapShroudTrait } from '../../src/game/trait/MapShroudTrait';
import { CampaignUnloadTask } from '../../src/game/campaign/CampaignUnloadTask';
import { JumpjetLocomotor } from '../../src/game/gameobject/locomotor/JumpjetLocomotor';
import { Vector3 } from '../../src/game/math/Vector3';
import { ZoneType } from '../../src/game/gameobject/unit/ZoneType';
import { Game } from '../../src/game/Game';
import { GameObject } from '../../src/game/gameobject/GameObject';
import { Traits } from '../../src/game/Traits';
import { VeteranTrait } from '../../src/game/gameobject/trait/VeteranTrait';
import { VeteranAbility } from '../../src/game/gameobject/unit/VeteranAbility';
import { HealthTrait } from '../../src/game/gameobject/trait/HealthTrait';
import { SelfHealingTrait } from '../../src/game/gameobject/trait/SelfHealingTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix')).openFile('all05s.map').getBytes();
const sourceSha256 = 'd09cebddc1f4009098dfa48b18bf4022e6e4d00801f1ca8efd99917f185bb225';
expect(sha256(bytes)).toBe(sourceSha256);
const original = new CampaignDefinition('ra2', 'all05s.map', new TextDecoder().decode(bytes));

test('original Allied05 retains spy infiltration, all missile alternatives, Tanya/lab losses, local rules and source media', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([128, 40, 42, 19, 2]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('SNOW');
    expect(original.ini.getSection('Map')!.getNumberArray('LocalSize')).toEqual([2, 53, 45, 71]);
    expect(original.ini.getSection('Basic')!.getBool('IgnoreGlobalAITriggers')).toBe(false);
    expect(original.ini.getSection('TANY')!.getNumber('Strength')).toBe(250);
    expect(original.ini.getSection('NAMISL')!.getBool('Capturable')).toBe(true);
    expect(original.triggers.get('0B9ECBBC')!.difficulties).toEqual({ easy: true, normal: false, hard: false });
    expect(original.scripts.get('08AB9D20')!.instructions[0].raw).toBe('13,0');
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a05_f00e', 'before-mission'], ['a05_p03e', 'transmission'], ['a05_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all04u.map')).toBe(18); expect(campaignMissionSemantics('all05s.map')).toBe(27);
    expect(campaignMissionImplemented('ra2', 'all05s.map')).toBe(true);
});

test('both destroyed, both captured and mixed original missile goals preserve their ten-second victory delay', () => {
    for (const flags of [['0', '1'], ['5', '6'], ['0', '6'], ['1', '5']]) {
        const actions: any[] = [], active = ['09F9E650', '0799FF3C', '0799FC0C', '0799F8DC'];
        const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => ['source'], condition: () => false,
            action: action => actions.push({ tick: machine.tick, ...action }) });
        for (const id of machine.states.keys()) machine.setEnabled(id, active.includes(id));
        for (const id of flags) machine.variables.set(id, true);
        machine.update(); expect(actions.filter(action => action.opcode === 1)).toEqual([]);
        for (let i = 0; i < 151; i++) machine.update();
        const win = actions.filter(action => action.opcode === 1);
        expect(win.length).toBe(1); expect(win[0].key).toBe('09F98660'); expect(win[0].tick).toBeGreaterThanOrEqual(150);
    }
});

test('source idle13 requests a real infantry animation once and completes without giving orders or drawing simulation RNG', () => {
    const idle = new IdleActionTrait(), infantry: any = { isSpawned: true, isInfantry: () => true, idleActionTrait: idle };
    const team: any = { type: '08AB2210', members: [infantry], line: 0, started: false, tasks: [] };
    const host: any = { require: () => original.teams.get('08AB2210'), definition: original, trace: [], semanticsVersion: 18, unloading: new Map(),
        advance: (entry: any) => { entry.line++; entry.started = false; }, finish: (entry: any) => { entry.phase = 'finished'; } };
    const tick = () => (CampaignTeams.prototype as any).tickScript.call(host, team, 120);
    expect(tick).toThrow('interpreter 19'); expect(idle.getCampaignIdleRequests()).toBe(0);
    host.semanticsVersion = 19; tick(); expect(idle.getCampaignIdleRequests()).toBe(1); expect(team.line).toBe(1);
    tick(); expect(idle.getCampaignIdleRequests()).toBe(1); expect(team.phase).toBe('finished');
});

test('new source scouting receives owner-directed allied sight and respects AllyReveal while old journals keep their policy', () => {
    const player = { getOwnedObjects: () => ['own'] }, civilian = { getOwnedObjects: () => ['prisoners'] },
        tanya = { getOwnedObjects: () => ['tanya'] }, players = [player, civilian, tanya];
    const links = new Map<any, any[]>([[player, [civilian, tanya]], [civilian, [tanya]], [tanya, [player]]]);
    const alliances = { getAllies: (owner: any) => links.get(owner)!, areAllied: (owner: any, viewer: any) => links.get(owner)!.includes(viewer) };
    const host: any = new MapShroudTrait({}, alliances), seen: any[] = [];
    const shroud = { revealFrom: (actor: any) => seen.push(actor), revealObject: () => {} };
    const game: any = { alliances, getCombatants: () => players };
    MapShroudTrait.prototype.revealObjects.call(host, shroud, player, game); expect(seen).toEqual(['own', 'prisoners', 'tanya']);
    seen.length = 0; host.sourceScouting = true;
    MapShroudTrait.prototype.revealObjects.call(host, shroud, player, game); expect(seen).toEqual(['own', 'tanya']);
    seen.length = 0; host.allyReveal = false;
    MapShroudTrait.prototype.revealObjects.call(host, shroud, player, game); expect(seen).toEqual(['own']);
});

test('a completed nonrecruitable source handoff team releases Tanya for the following tagged idle team without clearing player orders', () => {
    const owner: any = { name: 'Tanya House' }, idle = new IdleActionTrait();
    const actor: any = { id: 1, name: 'TANY', owner, rules: {}, isSpawned: true, isUnit: () => true, isInfantry: () => true,
        idleActionTrait: idle, unitOrderTrait: { clearOrders: () => {}, cancelAllTasks: () => {} } };
    owner.getOwnedObjects = () => [actor];
    const game: any = { map: {}, rules: { getIni: () => original.ini } };
    const teams: any = new CampaignTeams(original, game, () => owner, undefined, 19);
    const previous: any = { id: 1, type: '07F21C10', owner, members: [actor], phase: 'active', line: 1, tasks: [] };
    teams.instances.set(1, previous); teams.assignments.set(actor, previous); teams.nextId = 2;
    teams.tickScript(previous, 91); expect(previous.phase).toBe('finished');
    const next = teams.create('08AB2210'); expect(next.members).toEqual([actor]);
    expect(actor.tag.triggerId).toBe('08836B30'); teams.tickScript(next, 120);
    expect(idle.getCampaignIdleRequests()).toBe(1);
});

test('the original targetless initial infantry Return keeps its source identity and receives no invented destination', () => {
    const unit: any = { name: 'E2', isUnit: () => true, isInfantry: () => true, guardMode: true, defaultToGuardArea: true };
    const host: any = { definition: original, semanticsVersion: 18, initial: new Map() };
    const placement = { owner: 'RedTeam House', rx: 86, ry: 111, subCell: 3 };
    const bind = () => CampaignTeams.prototype.bindInitial.call(host, unit, placement);
    expect(bind).toThrow('unsupported initial mission Return');
    host.semanticsVersion = 19; bind(); expect(host.initial.get(unit).mission).toBe('Return');
    expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    expect(unit.campaignSleeping).toBeUndefined();
});

test('the source helicopter unload wrapper permits physical descent before its evacuation child can deliver the spies', () => {
    const run = (version: number) => {
        const game: any = { gameOpts: { campaign: { semanticsVersion: version } }, events: { dispatch: () => {} },
            map: { getGroundObjectsOnTile: () => [], getTileZone: () => ZoneType.Ground,
                terrain: { getPassableSpeed: () => 1, findObstacles: () => [] },
                tileOccupation: { getGroundObjectsOnTile: () => [] } } };
        const task = new CampaignUnloadTask(game), position: any = { worldPosition: new Vector3(0, 200, 0) };
        position.moveByLeptons3 = (distance: Vector3) => position.worldPosition.add(distance);
        const transport: any = { zone: ZoneType.Air, tile: { rx: 112, ry: 140, z: 0 }, position,
            rules: { balloonHover: false, hoverAttack: true, jumpjetHeight: 200, jumpjetClimb: 20 },
            unitOrderTrait: { getCurrentTask: () => task }, moveTrait: { handleElevationChange: () => {} } };
        for (let i = 0; i < 20; i++) JumpjetLocomotor.tickStationary(transport, game);
        return transport;
    };
    expect(run(18).zone).toBe(ZoneType.Air); expect(run(19).zone).toBe(ZoneType.Ground);
});

test('real map creation reads source100/200 as veteran/elite and installs starting self-heal without promotion events, preserving saved18', () => {
    const run = (version: number, percentage: number, forward = false) => {
        const events: any[] = [], actor: any = { rules: { cost: 100, veteranAbilities: new Set(), eliteAbilities: new Set([VeteranAbility.SELF_HEAL]) },
            traits: new Traits(), cachedTraits: { tick: [] }, position: {}, isInfantry: () => true, isBuilding: () => false,
            addTrait: GameObject.prototype.addTrait, armedTrait: { toggleEliteWeapons: () => {} } };
        actor.healthTrait = new HealthTrait(250, actor, .5, .25);
        actor.veteranTrait = new VeteranTrait(actor, { veteranRatio: 3, veteranCap: 2 } as any);
        const owner: any = {}, tile = { rx: 111, ry: 142, z: 0, landType: 0 };
        const game: any = { gameOpts: { campaign: { semanticsVersion: version, ...(forward ? { startingVeterancyVersion: 1 } : {}) } },
            campaign: { resolveHouse: () => owner, teams: { bindInitial: () => {} } }, playerList: { getAll: () => [] },
            map: { getTags: () => [], tiles: { getByMapCoords: () => tile } }, validateMapObjectRulesAndArt: () => true,
            createObject: () => actor, changeObjectOwner: () => {}, spawnObject: () => { actor.isSpawned = true; },
            addObjectTrait: (unit: any, trait: any) => unit.addTrait(trait), traits: new Traits(),
            rules: { general: { repair: { repairRate: .016 } } }, events: { dispatch: (event: any) => events.push(event) } };
        const placement: any = { name: 'TANY', owner: 'Tanya House', type: 3, health: 256, direction: 0,
            veterancy: percentage, isInfantry: () => true, isVehicle: () => false, isAircraft: () => false };
        Game.prototype.createInitialMapTechnos.call(game, [placement]);
        expect(events).toEqual([]);
        return { actor, game };
    };
    const legacy = run(18, 100); expect(legacy.actor.veteranTrait.isElite()).toBe(true);
    expect(legacy.actor.traits.find(SelfHealingTrait)).toBeUndefined();
    const veteran = run(19, 100); expect(veteran.actor.veteranTrait.isElite()).toBe(false);
    expect(veteran.actor.traits.find(SelfHealingTrait)).toBeUndefined();
    const elite = run(19, 200); expect(elite.actor.veteranTrait.isElite()).toBe(true);
    const heal = elite.actor.traits.find(SelfHealingTrait); expect(heal).toBeDefined();
    expect(elite.actor.cachedTraits.tick).toContain(heal);
    elite.actor.healthTrait.health = 80; heal[NotifyTick.onTick](elite.actor, elite.game);
    expect(elite.actor.healthTrait.health).toBeGreaterThan(80);
    const forward = run(18, 100, true); expect(forward.actor.veteranTrait.isElite()).toBe(false);
    expect(forward.actor.traits.find(SelfHealingTrait)).toBeUndefined();
});

test('original source smoke emits the held SHP with tick-owned motion/state, deterministic replay and complete release', () => {
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    const tile: any = { rx: 111, ry: 142, z: 0 };
    const fixture = (restoring: boolean) => {
        const events: any[] = [], game: any = { currentTick: 90, prng: new Prng(234), campaign: { restoring },
            rules: { getIni: () => ini, audioVisual: { gravity: 6 } }, events: { dispatch: (entry: any) => events.push(entry) } };
        return { game, events, particles: new CampaignSourceParticles(game) };
    };
    const live = fixture(false), replay = fixture(true);
    for (const f of [live, replay]) f.particles.create(2, tile);
    const drawsBefore = live.game.prng.snapshot();
    expect(live.events).toEqual([]); expect(live.game.prng.snapshot()).toEqual(drawsBefore);
    for (let i = 0; i < 40; i++) for (const f of [live, replay]) { f.particles.update(); f.game.currentTick++; }
    const state: any = live.particles.snapshot(); expect(state.smoke[0].name).toBe('BigGreySmokeSys');
    expect(state.smoke[0].particle).toBe('LargeGreySmoke'); expect(live.events[0].name).toBe('LGRYSMK1');
    expect(state.smoke[0].particles.length).toBeGreaterThan(0); expect(replay.events).toEqual([]);
    expect(live.particles.snapshot()).toEqual(replay.particles.snapshot()); expect(live.game.prng.snapshot()).toEqual(replay.game.prng.snapshot());
    const before = replay.game.prng.snapshot(); replay.particles.showRestored();
    expect(replay.events.length).toBe(state.smoke[0].particles.length);
    expect(replay.game.prng.snapshot()).toEqual(before); expect(replay.particles.snapshot()).toEqual(state);
    expect(live.events.some(event => event.attachment.frame > 0 && event.attachment.position.y > 10)).toBe(true);
    for (let i = 0; i < 2300; i++) { live.particles.update(); live.game.currentTick++; }
    expect((live.particles.snapshot() as any).smoke).toEqual([]);
    expect(live.events.every(event => !event.attachment.active)).toBe(true);
    replay.particles.dispose(); expect(replay.events.every(event => !event.attachment.active)).toBe(true);
    expect(() => new CampaignParticleSystems(live.game).create(2, tile)).toThrow('BigGreySmokeSys');
    expect(() => replay.particles.create(12, tile)).toThrow('12');
});

test('smoke render attachments sample saved simulation frames and opacity while old animations retain their runner', () => {
    const sampled: any[] = [], particle = { active: true, position: {}, frame: 7, translucency: 75 };
    const originalUpdate = Anim.prototype.update;
    Anim.prototype.update = () => {};
    try {
        const host: any = { attachment: particle, setPosition: () => {}, container: { updateChild: () => {} },
            isAnimNotStarted: () => false, isAnimFinished: () => false,
            setSimulationFrame: (...args: any[]) => sampled.push(args) };
        TransientAnim.prototype.update.call(host, 60000); expect(sampled).toEqual([[7, 75]]);
        expect(particle.frame).toBe(7); particle.frame = 12;
        TransientAnim.prototype.update.call(host, 0); expect(sampled.at(-1)).toEqual([12, 75]);
    } finally { Anim.prototype.update = originalUpdate; }
});
