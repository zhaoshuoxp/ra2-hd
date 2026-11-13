import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMissionImplemented, campaignMissionSemantics } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { IniFile } from '../../src/data/IniFile';
import { EventType } from '../../src/game/event/EventType';
import { OrderType } from '../../src/game/order/OrderType';
import { CampaignParticleSystems } from '../../src/game/campaign/CampaignParticleSystems';
import { CampaignParticles } from '../../src/game/campaign/CampaignParticles';
import { Prng } from '../../src/game/Prng';
import { AudioVisualRules } from '../../src/game/rules/AudioVisualRules';
import { CampaignSparkFx } from '../../src/engine/renderable/fx/CampaignSparkFx';
import { campaignSparkLightCacheIndex } from '../../src/engine/renderable/fx/campaignSparkLight';
import { Coords } from '../../src/game/Coords';
import { Country } from '../../src/game/Country';
import { CountryRules } from '../../src/game/rules/CountryRules';
import { TechnoRules } from '../../src/game/rules/TechnoRules';
import { Production } from '../../src/game/player/production/Production';
import { TaskRunner } from '../../src/game/gameobject/task/system/TaskRunner';
import { TriggerActionFxHandler } from '../../src/engine/renderable/fx/handler/TriggerActionFxHandler';

const bytes = parseMix(requiredBytes('assets/ra2/maps01.mix'), 'maps01.mix').openFile('all03u.map').getBytes();
const sourceSha256 = '186e317d4be77eaeec8e0b09e5c813f6ff95aa01e4e206f4b4c82178bf679a61';
expect(sha256(bytes)).toBe(sourceSha256);
const original = new CampaignDefinition('ra2', 'all03u.map', new TextDecoder().decode(bytes));

test('original Allied03 preserves the beacon, White House loss, evacuation sequence and source parameters', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.taskForces.size, original.aiTriggers.size])
        .toEqual([62, 51, 58, 39, 25]);
    expect(original.ini.getSection('Map')!.getString('Theater')).toBe('URBAN');
    expect(original.ini.getSection('SpecialFlags')!.getBool('DestroyableBridges')).toBe(true);
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([2900, 1600, 1000]);
    expect(original.ini.getSection('General')!.getNumber('CampaignMoneyDeltaEasy')).toBe(5000);
    expect(original.ini.getSection('General')!.getNumber('CampaignMoneyDeltaHard')).toBe(-5000);
    expect(original.ini.getSection('Basic')!.getString('Briefing')).toBe('Brief:TRN01');
    expect(original.triggers.get('0E0F0110')!.events[0].opcode).toBe(48);
    expect(original.triggers.get('0B71C87C')!.actions[0].opcode).toBe(2);
    expect(original.triggers.get('0AC2BA3C')!.events[0].params).toEqual(['0', '10']);
    expect(original.scripts.get('07E6F42C')!.instructions[0].raw).toBe('14,0');
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['a03_f00e', 'before-mission'], ['a03_p01e', 'transmission']]);
    expect(campaignMissionSemantics('all02s.map')).toBe(16); expect(campaignMissionSemantics('all03u.map')).toBe(17);
    expect(campaignMissionImplemented('ra2', 'all03u.map')).toBe(true);
});

test('bridge event31 requires a real destroyed bridge gap in the attached whole span, including lateral deck cells', () => {
    const attached = { rx: 98, ry: 115 }, other = { rx: 40, ry: 60 }, destroyed = { rx: 97, ry: 114 };
    const spec = {}, foreign = {}, spans = new Map([[spec, [destroyed, attached]], [foreign, [other]]]);
    let gap = true;
    const host: any = { launch: { semanticsVersion: 17 }, targets: () => [attached],
        targetId: (target: any) => `cell:${target.rx},${target.ry}`,
        game: { map: { bridges: { findAllBridgeTiles: (bridge: any) => spans.get(bridge),
            findDestroyedPieceTiles: () => gap ? [destroyed] : [] } } } };
    const target = { tile: destroyed, isOverlay: () => true, isBridge: () => true, bridgeTrait: { bridgeSpec: spec } };
    const event = original.triggers.get('07B3216C')!.events[0], trigger = original.triggers.get('07B3216C')!;
    const check = (entries: any[]) => (CampaignRuntime.prototype as any).check.call(host, event, trigger, entries);
    expect(check([{ type: EventType.ObjectDestroy, target }])).toEqual(['cell:98,115']);
    expect(check([{ type: EventType.ObjectAttacked, target }])).toEqual([]);
    target.bridgeTrait.bridgeSpec = foreign; expect(check([{ type: EventType.ObjectDestroy, target }])).toEqual([]);
    target.bridgeTrait.bridgeSpec = spec; gap = false; expect(check([{ type: EventType.ObjectDestroy, target }])).toEqual([]);
    gap = true; target.isBridge = () => false; expect(check([{ type: EventType.ObjectDestroy, target }])).toEqual([]);
    host.launch.semanticsVersion = 16; expect(() => check([])).toThrow('interpreter 17');
});

test('original bridge repair disables itself, recreates a killed engineer and reenables only through hut entry', () => {
    let bridge = false, died = false, entered = false;
    const created: string[] = [], active = ['07B3216C', '0B0B4D0C', '0BB74DEC'];
    const machine = new CampaignTriggerMachine(original, 'normal', { targets: () => ['attached'],
        condition: event => event.opcode === 31 ? bridge : event.opcode === 29 ? died : event.opcode === 1 ? entered : false,
        action: action => { if (action.opcode === 4) created.push(action.params[1]); } });
    for (const id of machine.states.keys()) machine.setEnabled(id, active.includes(id));
    expect(machine.variables.get('1')).toBe(true);
    bridge = true; machine.update(); bridge = false;
    expect(created).toEqual(['0B2A832C']); expect(machine.states.get('07B3216C')!.enabled).toBe(false);
    expect(machine.variables.get('1')).toBe(false);
    died = true; machine.update(); died = false; expect(created).toEqual(['0B2A832C', '0B2A832C']);
    entered = true; machine.update(); entered = false;
    expect(machine.variables.get('1')).toBe(true); expect(machine.states.get('07B3216C')!.enabled).toBe(true);
    died = true; machine.update(); expect(created.length).toBe(2);
});

test('source engineer attack-building46 uses the actual repair order for neutral or owned bridge huts and preserves16', () => {
    const orders: any[] = [], owner = { name: 'Russian1 House', isCombatant: () => true };
    const civilian = { name: 'Civilian1 House', isCombatant: () => false };
    let broken = true;
    const unit: any = { id: 1, owner, tile: { rx: 96, ry: 108 }, isSpawned: true, rules: { engineer: true },
        isInfantry: () => true, unitOrderTrait: { addOrder: (order: any) => orders.push(order), hasTasks: () => true } };
    const hut: any = { id: 2, owner: civilian, tile: { rx: 95, ry: 108 }, isSpawned: true, rules: { index: 30, capturable: false },
        isTechno: () => true, isBuilding: () => true, cabHutTrait: { canRepairBridge: () => broken } };
    const game: any = { map: {}, world: { getAllObjects: () => [hut] }, isValidTarget: () => true,
        alliances: { areAllied: () => true }, areFriendly: () => true, createTarget: (obj: any, tile: any) => ({ obj, tile }) };
    const manager: any = new CampaignTeams(original, game, () => owner, undefined, 17);
    const team: any = { type: '0B2A832C', owner, members: [unit], phase: 'active', line: 1, started: true, tasks: [] };
    expect(original.scripts.get('0B2B7DBC')!.instructions[1].raw).toBe('46,131102');
    expect(manager.findTarget(team, 46, 131102)).toBe(hut); manager.attack(team, hut);
    expect(orders.length).toBe(1); expect(orders[0].orderType).toBe(OrderType.Repair);
    expect(orders[0].isValid() && orders[0].isAllowed()).toBe(true);
    hut.owner = owner; team.target = undefined; manager.tickScript(team, 1); expect(team.target).toBe(hut);
    manager.tickScript(team, 2); expect(team.line).toBe(1); expect(team.target).toBe(hut);
    broken = false; manager.tickScript(team, 3); expect(team.line).toBe(2);
    expect(manager.findTarget(team, 46, 131102)).toBeUndefined();
    broken = true; hut.owner = civilian;
    const frozen: any = new CampaignTeams(original, game, () => owner, undefined, 16);
    expect(frozen.findTarget(team, 46, 131102)).toBeUndefined(); orders.length = 0;
    frozen.attack(team, hut); expect(orders.length).toBe(0);
});

test('original IFV action88 selects LGSparkSys and LargeSpark while legacy journals keep their frozen mapping', () => {
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    const rules = { getIni: () => ini, audioVisual: new AudioVisualRules().readIni(ini.getSection('AudioVisual')!) };
    const tile: any = { rx: 85, ry: 128, z: 4 };
    const fixture = (restoring: boolean) => {
        const events: any[] = [], game: any = { rules, prng: new Prng(123), campaign: { restoring }, events: { dispatch: (event: any) => events.push(event) } };
        return { game, events, particles: new CampaignParticleSystems(game) };
    };
    const action = original.triggers.get('0AF78D3C')!.actions[0]; expect([action.opcode, action.params[1]]).toEqual([88, '11']);
    const live = fixture(false), replay = fixture(true);
    live.particles.create(11, tile); replay.particles.create(11, tile);
    expect(live.events[0].name).toBe('LGSparkSys'); expect(live.events[0].type).toBe(EventType.TriggerParticle);
    expect(replay.events).toEqual([]);
    for (let i = 0; i < 5; i++) { live.particles.update(); replay.particles.update(); }
    const state = live.particles.snapshot() as any;
    expect(state.systems[0].particle).toBe('LargeSpark'); expect(state.systems[0].remaining).toBe(0);
    expect(state.systems[0].sparks.length).toBeGreaterThanOrEqual(3);
    expect(live.particles.snapshot()).toEqual(replay.particles.snapshot()); expect(live.game.prng.snapshot()).toEqual(replay.game.prng.snapshot());
    const before = replay.game.prng.snapshot(); replay.particles.showRestored(); expect(replay.events.length).toBe(1);
    const visual = replay.events[0].visual, fx = new CampaignSparkFx(visual, replay.events[0].name), removed: any[] = [];
    fx.setContainer({ remove: (value: any) => removed.push(value) }); fx.create3DObject();
    for (let i = 0; i < 30; i++) fx.update();
    expect(fx.get3DObject()!.userData.sourcePoints).toBe(state.systems[0].sparks.length);
    expect(replay.game.prng.snapshot()).toEqual(before); expect(replay.particles.snapshot()).toEqual(state);
    replay.particles.dispose(); fx.update(); expect(removed).toEqual([fx]); expect(fx.get3DObject()).toBeUndefined();
    for (let i = 0; i < 500; i++) live.particles.update();
    expect((live.particles.snapshot() as any).systems).toEqual([]);
    const legacy = new CampaignParticles(live.game); expect(() => legacy.create(11, tile)).toThrow('LargeRailgunPart');
});

test('source LightSize25 uses the native particle-cap clamp, integer conversion and initial flash phase', () => {
    // Installed0x60b090 clamps count/ParticleCap to0.4..1, truncates LightSize,
    // then0x5ddb90 scales by initial phase29's wave50/64 before cache lookup.
    const counts = [0, 1, 2, 3, 4, 5, 6, 7, 14];
    expect(counts.map(count => campaignSparkLightCacheIndex(25, 7, count)))
        .toEqual([-1, 7, 7, 7, 10, 13, 16, 19, 19]);
    expect(campaignSparkLightCacheIndex(0, 7, 7)).toBe(-1);
});

test('source one-frame spark light remains visible after emission and rendering preserves world/RNG', () => {
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    let visual: any;
    const game: any = { rules: { getIni: () => ini, audioVisual: new AudioVisualRules().readIni(ini.getSection('AudioVisual')!) },
        prng: new Prng(123), campaign: {}, events: { dispatch: (event: any) => visual = event.visual } };
    const particles = new CampaignParticleSystems(game);
    particles.create(11, { rx: 85, ry: 128, z: 4 });
    for (let i = 0; i < 6; i++) particles.update();
    expect(visual.flash).toBe(false); expect(visual.oneFrameLight).toBe(true); expect(visual.particleCap).toBe(7);
    const state = particles.snapshot(), rng = game.prng.snapshot();
    const fx = new CampaignSparkFx(visual, 'LGSparkSys'); fx.create3DObject();
    for (let i = 0; i < 60; i++) fx.update();
    const group = fx.get3DObject()!, flash: any = group.children[0];
    expect(flash.visible).toBe(true); expect(group.userData.lightRadius).toBeGreaterThan(2);
    expect(flash.scale.x / flash.scale.y).toBe(2); expect(flash.material.depthTest).toBe(false);
    expect(flash.scale.y).toBeCloseTo((group.userData.lightRadius + 1) * Coords.ISO_WORLD_SCALE * Coords.COS_ISO_CAMERA_BETA, 9);
    expect(flash.renderOrder).toBeLessThan(999999);
    expect(particles.snapshot()).toEqual(state); expect(game.prng.snapshot()).toEqual(rng);
    particles.dispose(); fx.update(); expect(fx.get3DObject()).toBeUndefined();
});

test('the original Russian1 engineer team uses its scenario identity without bypassing factory or technology checks', () => {
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    const names = [...new Set(ini.getSection('Countries')!.entries.values())];
    const country = Country.factory('Russian1', { getCountry: (name: string) =>
        new CountryRules(names.indexOf(name) as any).readIni(ini.getSection(name)!) } as any);
    const source = ini.getSection('ENGINEER')!, engineer: any = { name: 'ENGINEER', techLevel: source.getNumber('TechLevel'),
        buildLimit: Infinity, requiredHouses: source.getArray('RequiredHouses'), forbiddenHouses: source.getArray('ForbiddenHouses'),
        isAvailableTo: TechnoRules.prototype.isAvailableTo };
    expect(country.matchesCountry('Russians')).toBe(true); expect(engineer.isAvailableTo(country)).toBe(false);
    const host: any = { player: { country, isAi: true, campaignSemanticsVersion: 17 }, gameOpts: { superWeapons: true },
        maxTechLevel: 5, hasSecretProduction: () => false, hasFactoryFor: () => true,
        meetsPrerequisites: () => true, meetsStolenTech: () => true };
    const available = () => Production.prototype.isAvailableForProduction.call(host, engineer);
    expect(available()).toBe(true);
    host.player.campaignSemanticsVersion = 16; expect(available()).toBe(false);
    host.player.campaignSemanticsVersion = undefined; expect(available()).toBe(false);
    host.player.campaignSemanticsVersion = 17; host.player.isAi = false; expect(available()).toBe(false);
    host.player.isAi = true; host.hasFactoryFor = () => false; expect(available()).toBe(false);
    host.hasFactoryFor = () => true; host.maxTechLevel = 0; expect(available()).toBe(false);
});

test('actual attached repeated hut entry dispatches once while frozen16 keeps its previous replay behavior', () => {
    const run = (version: 16 | 17) => {
        let notify: any;
        const russian = {}, hut: any = { id: 1943, tag: { id: '0B0B4B0C' } };
        const host: any = { definition: original, launch: { semanticsVersion: version }, boundTargets: new Map(),
            events: [], discoverySubjects: new Set(), resolveHouse: () => russian,
            game: { world: { getAllObjects: () => [hut] }, map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } },
                events: { subscribe: (callback: any) => { notify = callback; return () => {}; } } } };
        for (const key of ['targets', 'targetId', 'refreshTargets', 'check']) host[key] = (CampaignRuntime.prototype as any)[key].bind(host);
        host.machine = new CampaignTriggerMachine(original, 'normal', { targets: trigger => host.targets(trigger).map(host.targetId),
            condition: (event, trigger) => host.check(event, trigger), action() {} });
        CampaignRuntime.prototype.start.call(host);
        for (const id of host.machine.states.keys()) host.machine.setEnabled(id, id === '0B0B4D0C');
        notify({ type: EventType.EnterObject, source: { owner: russian, zone: 0 }, target: hut });
        expect(host.machine.states.get('0B0B4D0C').fired).toBe(1);
        // This comparison isolates entry dispatch;16 cannot execute bridge31.
        host.machine.setEnabled('07B3216C', false);
        host.machine.update(); return host.machine.states.get('0B0B4D0C').fired;
    };
    expect(run(17)).toBe(1); expect(run(16)).toBe(2);
});

test('original priority50 evacuation takes the four recruitable priority7 actors with Recruiter=no and freezes16', () => {
    const run = (version: number, blocked?: 'priority' | 'recruitable' | 'payload') => {
        const definition = new CampaignDefinition('ra2', 'all03u.map', new TextDecoder().decode(bytes));
        const objects: any[] = [], owner: any = { name: 'Other1 House', getOwnedObjects: () => objects };
        const game: any = { map: { mapBounds: { isWithinBounds: () => true } },
            rules: { getIni: () => new IniFile('') } };
        const manager: any = new CampaignTeams(definition, game, () => owner, undefined, version);
        for (const [index, name] of ['SHAD', 'PRES', 'SSRV', 'SSRV'].entries()) objects.push({
            id: index + 1, name, owner, rules: {}, isSpawned: true, isUnit: () => true,
            isInfantry: () => name !== 'SHAD', unitOrderTrait: { clearOrders() {}, cancelAllTasks() {} },
            ...(name === 'SHAD' ? { transportTrait: { units: [] } } : {}) });
        const predecessors = ['0ECAB6AC', '0C4E57BC', '0C4EA7DC', '0C4EA32C'].map(id => manager.create(id));
        expect(predecessors.flatMap(team => team.members).map(unit => unit.name).sort())
            .toEqual(['PRES', 'SHAD', 'SSRV', 'SSRV']);
        for (const team of predecessors) { team.phase = 'holding'; team.line = 1; }
        if (blocked === 'payload') objects[0].transportTrait.units.push({});
        if (blocked === 'priority') definition.teams.get('0ECAB6AC')!.properties.Priority = '50';
        if (blocked === 'recruitable') definition.teams.get('0ECAB6AC')!.properties.AreTeamMembersRecruitable = 'no';
        const spec = definition.teams.get('0B88567C')!;
        expect(spec.properties.Recruiter).toBe('no'); expect(spec.properties.Priority).toBe('50');
        const evacuation = manager.create(spec.id);
        return { phase: evacuation.phase, names: evacuation.members.map(unit => unit.name).sort() };
    };
    expect(run(17)).toEqual({ phase: 'active', names: ['PRES', 'SHAD', 'SSRV', 'SSRV'] });
    expect(run(16)).toEqual({ phase: 'assembling', names: [] });
    for (const blocked of ['priority', 'recruitable', 'payload'] as const)
        expect(run(17, blocked)).toEqual({ phase: 'assembling', names: ['PRES', 'SSRV', 'SSRV'] });
});

test('original President and Secret Service face42 complete with source zero ROT before boarding, while16 stays frozen', () => {
    for (const type of ['0C4E57BC', '0C4EA7DC', '0C4EA32C']) for (const version of [16, 17]) {
        const tasks: any[] = [], unit: any = { id: 1, isSpawned: true, direction: 135, spinVelocity: 0,
            rules: { rot: 0 }, isInfantry: () => true, unitOrderTrait: {
                clearOrders() {}, cancelAllTasks() {}, addTask: (task: any) => tasks.push(task) } };
        const manager: any = new CampaignTeams(original, { map: {} }, () => ({}), undefined, version);
        const team: any = { id: 1, type, members: [unit], phase: 'active', line: 1, started: false, tasks: [] };
        expect(original.scripts.get(original.teams.get(type)!.script)!.instructions[1].raw).toBe('42,4');
        manager.tickScript(team, 1); new TaskRunner().tick(tasks, unit); manager.tickScript(team, 2);
        expect(unit.direction).toBe(version === 17 ? 180 : 135);
        expect(tasks.length).toBe(version === 17 ? 0 : 1);
        expect(team.line).toBe(version === 17 ? 2 : 1);
    }
});

test('leaving during the original live spark releases every material and detaches the renderer without altering simulation', () => {
    const ini = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(original.ini);
    const scene = new Set<CampaignSparkFx>(), effects: CampaignSparkFx[] = [];
    let listener: any, unsubscribed = false;
    const game: any = { rules: { getIni: () => ini, audioVisual: new AudioVisualRules().readIni(ini.getSection('AudioVisual')!) },
        prng: new Prng(123), campaign: {}, events: { dispatch: (event: any) => listener(event),
            subscribe: (callback: any) => { listener = callback; return { dispose: () => { unsubscribed = true; } }; } } };
    const handler = new TriggerActionFxHandler(game, { createTransientAnim() {}, addEffect(effect: CampaignSparkFx) {
        scene.add(effect); effects.push(effect); effect.setContainer({ remove: (fx: CampaignSparkFx) => scene.delete(fx) });
        effect.create3DObject();
    } });
    handler.init(); const particles = new CampaignParticleSystems(game);
    particles.create(11, { rx: 85, ry: 128, z: 4 });
    for (let i = 0; i < 5; i++) particles.update(); effects[0].update();
    const materials = effects[0].get3DObject()!.children.map(sprite => (sprite as any).material);
    const disposed = new Set(); materials.forEach(material => material.addEventListener('dispose', () => disposed.add(material)));
    const before = particles.snapshot(), rng = game.prng.snapshot();
    handler.dispose(); handler.dispose(); effects[0].dispose();
    expect(unsubscribed).toBe(true); expect(scene.size).toBe(0); expect(effects[0].get3DObject()).toBeUndefined();
    expect(disposed.size).toBe(materials.length); expect(materials.length).toBeGreaterThan(3);
    expect(particles.snapshot()).toEqual(before); expect(game.prng.snapshot()).toEqual(rng);
});
