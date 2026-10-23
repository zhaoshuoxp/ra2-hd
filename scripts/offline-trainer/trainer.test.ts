import { describe, expect, test } from 'bun:test';
import { TrainerSession, trainerBuildTicks, trainerEffects, trainerProtects, forgetTrainerObject, tickTrainer, type TrainerCommand } from '../../src/game/trainer/TrainerRuntime';
import { TrainerController, parseTrainerPreferences, trainerEditableTarget } from '../../src/gui/trainer/TrainerController';
import { HealthTrait } from '../../src/game/gameobject/trait/HealthTrait';
import { PowerTrait } from '../../src/game/player/trait/PowerTrait';
import { InvulnerableTrait } from '../../src/game/gameobject/trait/InvulnerableTrait';
import { SuperWeapon, SuperWeaponStatus } from '../../src/game/SuperWeapon';
import { SuperWeaponsTrait } from '../../src/game/trait/SuperWeaponsTrait';
import { Traits } from '../../src/game/Traits';
import { Production } from '../../src/game/player/production/Production';
import { ProductionTrait } from '../../src/game/trait/ProductionTrait';
import { FactoryType } from '../../src/game/rules/TechnoRules';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { Replay } from '../../src/network/gamestate/Replay';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';

function fixture(edition: 'ra2' | 'yr' = 'ra2') {
    const objects = new Map<number, any>(), events: any[] = [];
    const player: any = { credits: 1000, buildings: new Set(), isAi: false, isObserver: false, defeated: false };
    const enemy: any = { credits: 1000 };
    const powers: SuperWeapon[] = [];
    const traits = new Traits(); traits.add(new SuperWeaponsTrait());
    const game: any = { status: 1, currentTick: 0, localPlayer: player, traits, getWorld: () => ({ hasObjectId: (id: number) => objects.has(id), getObjectById: (id: number) => objects.get(id) }),
        events: { dispatch: (e: any) => events.push(e) }, mapShroudTrait: { revealMap: () => events.push('reveal') },
        changeObjectOwner: (o: any, owner: any) => { forgetTrainerObject(game, o); o.owner = owner; events.push('ownerChange'); } };
    player.powerTrait = new PowerTrait(player); player.superWeaponsTrait = { getAll: () => powers };
    let enabled = false, offline = true, changed = 0, modified = false;
    const session = new TrainerSession(game, player, edition, () => enabled, () => offline, () => changed++, () => modified = true);
    const send = (command: TrainerCommand, overrides: any = {}) => session.dispatch({ command, session: session.id, edition, actor: player, ...overrides });
    const object = (owner = player) => {
        const o: any = { id: objects.size + 1, owner, isSpawned: true, isDestroyed: false, isTechno: () => true, traits: new Traits() };
        o.healthTrait = new HealthTrait(200, o, .5, .25); o.invulnerableTrait = new InvulnerableTrait(); objects.set(o.id, o); return o;
    };
    return { game, player, enemy, session, objects, events, powers, send, object, tick: () => tickTrainer(game), enable: () => { enabled = true; },
        disable: () => { enabled = false; session.reset(); }, offline: (value: boolean) => { offline = value; }, modified: () => modified, changed: () => changed };
}
for (const edition of ['ra2', 'yr'] as const) describe(edition, () => {
    test('master/context/session/actor gates fail closed; stale queue does not execute', () => {
        const f = fixture(edition), cmd = { type: 'credits', mode: 'add', value: 100 } as const;
        expect(f.send(cmd)).toBe(false); f.enable();
        expect(f.send(cmd, { session: 'stale' })).toBe(false);
        expect(f.send(cmd, { edition: edition === 'ra2' ? 'yr' : 'ra2' })).toBe(false);
        expect(f.send(cmd, { actor: f.enemy })).toBe(false);
        for (const property of ['isAi', 'isObserver', 'defeated']) { f.player[property] = true; expect(f.send(cmd)).toBe(false); f.player[property] = false; }
        f.offline(false); expect(f.send(cmd)).toBe(false); f.offline(true);
        expect(f.send(cmd)).toBe(true); expect(f.player.credits).toBe(1000);
        f.game.status = 2; f.tick(); expect(f.player.credits).toBe(1000); expect(f.session.pending).toBe(0);
        f.game.status = 1; f.session.dispose(); expect(f.send(cmd)).toBe(false);
    });
    test('credits validation, pause queue, minimum, reset and completed actions', () => {
        const f = fixture(edition); f.enable();
        for (const value of [-1, NaN, Infinity, 1.5, 10000001]) expect(f.send({ type: 'credits', mode: 'set', value })).toBe(false);
        expect(f.send({ type: 'credits', mode: 'add', value: 10000000 })).toBe(false);
        f.send({ type: 'credits', mode: 'set', value: 2000 }); expect(f.player.credits).toBe(1000);
        f.tick(); expect(f.player.credits).toBe(2000); expect(f.modified()).toBe(true);
        f.send({ type: 'effect', effect: 'minimum', enabled: true, value: 3000 }); f.tick(); expect(f.player.credits).toBe(3000);
        f.player.credits = 1; f.tick(); expect(f.player.credits).toBe(3000); expect(f.enemy.credits).toBe(1000);
        f.send({ type: 'credits', mode: 'add', value: 50 }); f.send({ type: 'reset' }); f.tick(); expect(f.player.credits).toBe(3000);
        f.player.credits = 1; f.tick(); expect(f.player.credits).toBe(1); f.session.reset(); f.session.reset();
    });
    test('power emits native changes, preserves blackout and removes only trainer supply', () => {
        const f = fixture(edition); f.enable();
        const plant = { rules: { power: 100 }, healthTrait: { health: 100 } }, drain = { rules: { power: -200 } };
        f.player.powerTrait.updateFrom(plant, 'add', f.game); f.player.powerTrait.updateFrom(drain, 'add', f.game);
        expect(f.player.powerTrait.isLowPower()).toBe(true);
        f.send({ type: 'effect', effect: 'power', enabled: true, value: 1000 }); f.tick(); expect(f.player.powerTrait.isLowPower()).toBe(false);
        f.player.powerTrait.setBlackoutFor(100, f.game); expect(f.player.powerTrait.isLowPower()).toBe(true);
        f.disable(); expect(f.player.powerTrait.debugGetState()).toEqual({ power: 100, drain: 200 });
        expect(f.player.powerTrait.getBlackoutDuration()).toBe(100);
    });
    test('healing/protection native health events, independent invulnerability, identity and owner cleanup', () => {
        const f = fixture(edition); f.enable(); const own = f.object(), enemy = f.object(f.enemy);
        own.healthTrait.inflictDamage(120, enemy, f.game); expect(own.healthTrait.health).toBe(40);
        expect(f.send({ type: 'heal', targets: [enemy] })).toBe(false);
        f.send({ type: 'heal', targets: [own] }); f.tick(); expect(own.healthTrait.health).toBe(100);
        f.send({ type: 'protect', targets: [own] }); f.tick(); own.healthTrait.inflictDamage(30, enemy, f.game); expect(own.healthTrait.health).toBe(100);
        own.invulnerableTrait.setActiveFor(200, 0, true); f.send({ type: 'unprotect', targets: [own] }); f.tick();
        expect(trainerProtects(f.game, own)).toBe(false); expect(own.invulnerableTrait.isActive()).toBe(true);
        own.healthTrait.inflictDamage(30, enemy, f.game); expect(own.healthTrait.getHitPoints()).toBe(170);
        f.send({ type: 'protect', targets: [own] }); f.tick(); f.game.changeObjectOwner(own, f.enemy); expect(f.session.protectedObjects.size).toBe(0);
        f.game.changeObjectOwner(own, f.player); expect(trainerProtects(f.game, own)).toBe(false);
        f.send({ type: 'heal', targets: [own] }); f.objects.set(own.id, { ...own }); f.tick(); expect(own.healthTrait.getHitPoints()).toBe(170);
        expect(f.send({ type: 'heal', targets: [own] })).toBe(false);
    });
    test('all real special power types: ready event, power/active-effect restrictions, repeated recharge', () => {
        const f = fixture(edition); f.enable();
        const types = Object.values(SuperWeaponType).filter(x => typeof x === 'number' && x !== 4 && (edition === 'yr' || x < 7)) as number[];
        f.powers.push(...types.map(type => new SuperWeapon(`power-${type}`, { type, rechargeTime: 5, isPowered: true }, f.player)));
        for (const power of f.powers) f.player.buildings.add({ superWeaponTrait: { getSuperWeapon: () => power }, warpedOutTrait: { isActive: () => false } });
        f.send({ type: 'ready' }); f.tick(); expect(f.powers.every(p => p.status === SuperWeaponStatus.Ready)).toBe(true);
        f.powers[0].resetTimer(); f.player.powerTrait.setBlackoutFor(100, f.game);
        f.send({ type: 'ready' }); f.tick(); expect(f.powers[0].status).toBe(SuperWeaponStatus.Paused);
        f.player.powerTrait.setBlackoutFor(0, f.game);
        const effects = (f.game.traits.get(SuperWeaponsTrait) as any).effects;
        effects.push({ type: types[0], owner: f.player, status: 1 });
        f.send({ type: 'effect', effect: 'recharge', enabled: true }); f.tick(); expect(f.powers[0].chargeTicks).toBeGreaterThan(0);
        effects.length = 0; f.tick(); expect(f.powers[0].status).toBe(2);
        f.disable(); f.powers[0].resetTimer(); f.tick(); expect(f.powers[0].chargeTicks).toBeGreaterThan(0);
    });
    test('local timing caps do not mutate AI, rules, native lower times or already paid progress', () => {
        const f = fixture(edition); f.enable();
        f.send({ type: 'effect', effect: 'production', enabled: true, value: 1.1 }); f.send({ type: 'effect', effect: 'construction', enabled: true }); f.tick();
        expect(trainerBuildTicks(f.player, false, 500)).toBe(17); expect(trainerBuildTicks(f.player, false, 10)).toBe(10);
        expect(trainerBuildTicks(f.player, true, 500)).toBe(1); expect(trainerBuildTicks(f.enemy, true, 500)).toBe(500);
        f.disable(); expect(trainerBuildTicks(f.player, false, 500)).toBe(500);
        for (const value of [0, 121, Infinity, NaN]) { f.enable(); expect(f.send({ type: 'effect', effect: 'production', enabled: true, value })).toBe(false); }
    });
});

test('tech bypass preserves edition catalog, playable entries, spawn factories and options', () => {
    const f = fixture(); f.enable();
    const rule: any = { name: 'TEST', type: ObjectType.Infantry, techLevel: 10, owner: ['other'], buildLimit: 1, prerequisite: ['LAB'], requiresStolenAlliedTech: true, isAvailableTo: () => false };
    const production = f.player.production = new Production(f.player, 1, { superWeapons: false }, {}, [rule]);
    f.send({ type: 'effect', effect: 'technology', enabled: true }); f.tick(); expect(production.isAvailableForProduction(rule)).toBe(false);
    f.player.buildings.add({ factoryTrait: { type: FactoryType.InfantryType }, rules: { owner: ['local'] } });
    expect(production.isAvailableForProduction(rule)).toBe(true);
    expect(production.isAvailableForProduction({ ...rule })).toBe(false);
    rule.techLevel = -1; expect(production.isAvailableForProduction(rule)).toBe(false); rule.techLevel = 10;
    rule.buildLimit = 0; expect(production.isAvailableForProduction(rule)).toBe(false); rule.buildLimit = 1;
    f.disable(); expect(production.isAvailableForProduction(rule)).toBe(false);
});

test('native production still charges, pauses, refunds and ignores the global legacy flag', () => {
    const f = fixture(); f.enable();
    const rules: any = { general: { buildSpeed: .7, multipleFactory: .8 }, buildingRules: new Map(), infantryRules: new Map(), vehicleRules: new Map(), aircraftRules: new Map() };
    const trait: any = new ProductionTrait(rules, { value: true });
    const item = { rules: { type: ObjectType.Infantry, buildTimeMultiplier: 1 }, creditsEach: 300, creditsSpent: 150, creditsSpentLeftover: 0, progress: .5 };
    const queue: any = { status: 0, type: 2, getFirst: () => item, notifyUpdated: () => {} };
    // Use the native enum rather than a timer-only shortcut.
    const QueueStatus = require('../../src/game/player/production/ProductionQueue').QueueStatus;
    queue.status = QueueStatus.Active;
    f.player.production = { getFactoryTypeForQueueType: () => 1, getFactoryCount: () => 1, buildSpeedModifier: 1 };
    trait.tickQueue(queue, f.player, f.game); expect(item.progress).toBeLessThan(.6);
    const spent = item.creditsSpent;
    f.send({ type: 'effect', effect: 'production', enabled: true, value: 1 }); f.tick();
    trait.tickQueue(queue, f.player, f.game); expect(item.creditsSpent - spent).toBe(20);
    const paid = item.creditsSpent; f.disable(); expect(item.creditsSpent).toBe(paid);
    f.player.credits = 0; trait.tickQueue(queue, f.player, f.game); expect(item.creditsSpent).toBe(paid);
    queue.status = QueueStatus.OnHold; f.player.credits = 500; trait.tickQueue(queue, f.player, f.game); expect(item.creditsSpent).toBe(paid);
});

test('preferences validate version/types/ranges/duplicates and preserve separate edition storage', () => {
    expect(parseTrainerPreferences().enabled).toBe(false); expect(parseTrainerPreferences('invalid').enabled).toBe(false);
    expect(parseTrainerPreferences('{"version":2,"enabled":true}').enabled).toBe(false);
    const parsed = parseTrainerPreferences(JSON.stringify({ version: 1, enabled: 'true', credits: -1, seconds: 121, bindings: { heal: 3, protect: 3, ready: 11 } }));
    expect(parsed.enabled).toBe(false); expect(parsed.credits).toBe(10000); expect(parsed.seconds).toBe(1); expect(parsed.bindings).toEqual({ heal: 3 });
    const stores = [new Map(), new Map()]; const c = new TrainerController();
    const prefs = (i: number) => ({ getItem: (k: string) => stores[i].get(k), setItem: (k: string, v: string) => stores[i].set(k, v) });
    c.initialize(prefs(0), { getCommandType: () => undefined }); c.setEnabled(true); c.setNumber('credits', 1234);
    c.initialize(prefs(1), {}); expect(c.preferences.enabled).toBe(false);
    c.initialize(prefs(0), {}); expect(c.preferences.enabled).toBe(true); expect(c.preferences.credits).toBe(1234);
    expect([...stores[0].keys()]).toEqual(['_r_trainer_v1']);
});

test('modified replay cannot serialize; ordinary replay format remains intact', () => {
    const replay = new Replay(); replay.gameOpts = {}; expect(replay.serialize().length).toBeGreaterThan(0);
    replay.trainerModified = true; expect(() => replay.serialize()).toThrow('Trainer-modified');
});

test('bounded queue snapshots values and reports rejected stale targets without marking replay', () => {
    const f = fixture(); f.enable(); const own = f.object();
    const targets = [own]; f.send({ type: 'heal', targets }); targets.length = 0;
    own.isDestroyed = true; f.tick();
    expect(f.session.lastResult).toBe('rejected'); expect(f.modified()).toBe(false);
    const command = { type: 'credits', mode: 'add', value: 1 } as const;
    for (let i = 0; i < 64; i++) expect(f.send(command)).toBe(true);
    expect(f.send(command)).toBe(false); expect(f.send({ type: 'reset' })).toBe(true);
    expect(f.session.pending).toBe(0); expect(f.modified()).toBe(false);
    f.send({ type: 'effect', effect: 'minimum', enabled: true, value: 0 }); f.tick();
    expect(f.session.isEffectEnabled('minimum')).toBe(true);
    f.disable(); expect(f.session.isEffectEnabled('minimum')).toBe(false);
});

test('OFF and absent trainer have identical deterministic native production and health outcomes', () => {
    const run = (attached: boolean) => {
        const f = fixture(); if (!attached) f.session.dispose();
        const rule: any = { general: { buildSpeed: .7, multipleFactory: .8 }, buildingRules: new Map(), infantryRules: new Map(), vehicleRules: new Map(), aircraftRules: new Map() };
        const trait: any = new ProductionTrait(rule, { value: true });
        const item = { rules: { type: ObjectType.Infantry, buildTimeMultiplier: 1 }, creditsEach: 300, creditsSpent: 0, creditsSpentLeftover: 0, progress: 0 };
        const queue: any = { status: 1, type: 2, getFirst: () => item, notifyUpdated: () => {} };
        f.player.production = { getFactoryTypeForQueueType: () => 1, getFactoryCount: () => 1, buildSpeedModifier: 1 };
        const own = f.object(); const frames = [];
        for (let i = 0; i < 40; i++) {
            f.tick(); trait.tickQueue(queue, f.player, f.game); own.healthTrait.inflictDamage(1, own, f.game);
            frames.push([f.player.credits, item.progress, item.creditsSpent, own.healthTrait.getHitPoints(), f.events.length]);
        }
        expect(trainerEffects(f.player)).toBeUndefined(); return frames;
    };
    expect(run(true)).toEqual(run(false));
});
