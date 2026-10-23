import { beforeAll } from 'bun:test';
import { retailIni } from '../test-support/resources';
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { Vector3 } from '../../src/game/math/Vector3';
import { MovementZone } from '../../src/game/type/MovementZone';
import { globalRules } from '../../src/game/rules/globalRules';
import { RangeHelper } from '../../src/game/gameobject/unit/RangeHelper';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { GameObject } from '../../src/game/gameobject/GameObject';
import { MoveInWeaponRangeTask } from '../../src/game/gameobject/task/move/MoveInWeaponRangeTask';
import { DrainTrait } from '../../src/game/gameobject/trait/DrainTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { NotifyOrder } from '../../src/game/gameobject/trait/interface/NotifyOrder';
import { NotifyOwnerChange } from '../../src/game/gameobject/trait/interface/NotifyOwnerChange';
import { NotifyUnspawn } from '../../src/game/gameobject/trait/interface/NotifyUnspawn';

let retail: IniFile;
let drainRules: ReturnType<IniFile['getSection']>, delay: number, amount: number;
beforeAll(() => {
    retail = retailIni('yr');
    drainRules = retail.getSection('DiskDrain')!;
    const settings = globalRules({ getIni: () => retail });
    delay = settings.getNumber('DrainMoneyFrameDelay');
    amount = settings.getNumber('DrainMoneyAmount');
});

function fixture(power = 0) {
    const owner: any = { credits: 10000, isCombatant: () => true };
    const blackouts = new Set();
    const enemy: any = { credits: 10000, powerTrait: {
        setExternalBlackout: (source: any, enabled: boolean) => enabled ? blackouts.add(source) : blackouts.delete(source),
    } };
    const body = (id: number, rx: number, ry: number, building: boolean, width = 1, height = 1): any => ({
        id, tile: { rx, ry, z: 0 }, position: { tileElevation: building ? 0 : 7,
            worldPosition: new Vector3((rx + width / 2) * 256, building ? 0 : 900, (ry + height / 2) * 256) },
        isUnit: () => !building, isBuilding: () => building, isTechno: () => true,
        isInfantry: () => false, isVehicle: () => !building, getFoundation: () => ({ width, height }),
        isSpawned: true, isDestroyed: false, rules: {},
    });
    const disc = body(1, 59, 85, false), refinery = body(2, 55, 84, true, 4, 3);
    Object.assign(refinery, { owner: enemy, rules: { drainable: true, refinery: !power, power } });
    const harvester = body(3, 59, 87, false); harvester.owner = enemy;
    const drainWeapon: any = { minRange: 0, range: drainRules.getNumber('Range'),
        rules: { drainWeapon: true, cellRangefinding: drainRules.getBool('CellRangefinding') },
        projectileRules: { vertical: true }, warhead: { rules: {} } };
    const laser: any = { ...drainWeapon, range: 7, rules: { drainWeapon: false }, warhead: { rules: {} } };
    const occupation = { calculateTilesForGameObject: (tile: any, object: any) => {
        const { width, height } = object.getFoundation();
        return Array.from({ length: width * height }, (_, i) => ({ rx: tile.rx + i % width,
            ry: tile.ry + Math.floor(i / width), z: 0 }));
    } };
    const world: any = { currentTick: 0, map: { tileOccupation: occupation },
        rules: { getIni: () => retail, general: { normalTargetingDelay: 5 } },
        areFriendly: (a: any, b: any) => a.owner === b.owner,
        isValidTarget: (target: any) => target.isSpawned && !target.isDestroyed };
    const attack: any = Object.assign(Object.create(AttackTrait.prototype), {
        disabled: false, passiveScanCooldownTicks: 0, rangeHelper: new RangeHelper(occupation),
        scanForTarget: () => ({ target: harvester, weapon: laser }),
        selectWeaponVersus: () => laser,
        createAttackTask: (_world: any, target: any) => ({ target }),
    });
    Object.assign(disc, { owner, sight: 9, primaryWeapon: laser, attackTrait: attack,
        rules: { movementZone: MovementZone.Fly, canPassiveAquire: true, canRetaliate: true },
        armedTrait: { getWeapons: () => [laser, drainWeapon] }, warpedOutTrait: { isActive: () => false },
        unitOrderTrait: { hasTasks: () => false, getCurrentTask: () => undefined,
            addTask: (task: any) => { attack.currentTarget = { obj: task.target }; },
            [NotifyTick.onTick]: () => {} } });
    const drain = disc.drainTrait = new DrainTrait(disc);
    drain.start(refinery, world);
    const advance = (ticks: number, passive = false) => {
        for (let i = 0; i < ticks; i++) {
            world.currentTick++;
            if (passive) attack[NotifyTick.onTick](disc, world);
            drain[NotifyTick.onTick](disc, world);
        }
    };
    return { disc, refinery, harvester, drain, attack, world, owner, enemy, blackouts, advance, drainWeapon };
}

test('native cell range includes the refinery edge even when center distance exceeds weapon range', () => {
    const f = fixture(), range = new RangeHelper(f.world.map.tileOccupation);
    expect(range.distance2(f.disc, f.refinery) / 256).toBe(2.5);
    expect(range.tileDistance(f.disc, f.refinery)).toBe(1);
    expect(range.isInWeaponRange(f.disc, f.refinery, f.drainWeapon, f.world.rules)).toBe(true);
});

test('a nearby guard target cannot interrupt refinery payments after FireOnce finishes', () => {
    const f = fixture();
    f.advance(delay - 1, true);
    expect(f.owner.credits).toBe(10000);
    f.advance(1, true);
    expect(f.owner.credits).toBe(10000 + amount);
    expect(f.enemy.credits).toBe(10000 - amount);
    f.advance(2 * delay, true);
    expect(f.owner.credits).toBe(10000 + 3 * amount);
    expect(f.owner.credits + f.enemy.credits).toBe(20000);
    expect(f.drain.getTarget()).toBe(f.refinery);
});

test('retaliation preserves an active drain, then normal acquisition resumes after Stop', () => {
    const f = fixture();
    // Damage may have queued retaliation just before the drain projectile arrives.
    f.attack.retaliateTarget = f.harvester;
    f.advance(1, true);
    expect(f.attack.currentTarget).toBeUndefined();
    expect(f.drain.getTarget()).toBe(f.refinery);
    expect(f.attack.shouldRetaliate(f.disc, f.world, 1, f.harvester, { rules: {} })).toBe(false);
    f.drain[NotifyOrder.onPush](f.disc, 11, false); f.advance(1);
    expect(f.drain.getTarget()).toBeUndefined();
    expect(f.attack.shouldRetaliate(f.disc, f.world, 1, f.harvester, { rules: {} })).toBe(true);
    f.advance(delay, true);
    expect(f.attack.currentTarget.obj).toBe(f.harvester);
    expect(f.owner.credits).toBe(10000);
});

test('drain payments cap at remaining enemy credits and repeated activation does not reset the timer', () => {
    const f = fixture(); f.enemy.credits = amount + 7;
    f.advance(delay - 1); f.drain.start(f.refinery, f.world); f.advance(1);
    expect(f.owner.credits).toBe(10000 + amount);
    f.advance(2 * delay);
    expect(f.enemy.credits).toBe(0);
    expect(f.owner.credits).toBe(10000 + amount + 7);
});

for (const reason of ['move-order', 'new-target', 'destroyed', 'unspawned', 'captured', 'out-of-range', 'owner-change', 'source-unspawn']) {
    test(`${reason} ends the drain before another payment and releases blackout`, () => {
        for (const power of [0, 100]) {
            const f = fixture(power);
            if (reason === 'move-order') f.drain[NotifyOrder.onPush](f.disc, 0, false);
            if (reason === 'new-target') f.attack.currentTarget = { obj: f.harvester };
            if (reason === 'destroyed') f.refinery.isDestroyed = true;
            if (reason === 'unspawned') f.refinery.isSpawned = false;
            if (reason === 'captured') f.refinery.owner = f.owner;
            if (reason === 'out-of-range') f.disc.tile.rx += 20;
            if (reason === 'owner-change') f.drain[NotifyOwnerChange.onChange](f.disc, f.owner, f.world);
            if (reason === 'source-unspawn') f.drain[NotifyUnspawn.onUnspawn](f.disc, f.world);
            f.advance(delay + 1);
            expect(f.drain.getTarget()).toBeUndefined();
            expect(f.owner.credits).toBe(10000);
            expect(f.blackouts.size).toBe(0);
        }
    });
}

for (const power of [0, 100]) {
    test(`pending drain protects FireOnce intent without early effects (power=${power})`, () => {
        const f = fixture(power), shot = { id: 40, isSpawned: true };
        f.drain.stop(f.world);
        f.drain.prepare(shot, f.refinery, f.world);
        f.attack.retaliateTarget = f.harvester;
        f.advance(delay + 1, true);
        expect(f.attack.currentTarget).toBeUndefined();
        expect(f.drain.isEngaged()).toBe(true);
        expect(f.drain.getTarget()).toBeUndefined();
        expect(f.owner.credits).toBe(10000);
        expect(f.blackouts.size).toBe(0);
        // Detonation removes the projectile before applying its effect.
        shot.isSpawned = false;
        f.drain.start(f.refinery, f.world, shot);
        f.advance(delay, true);
        expect(f.drain.getTarget()).toBe(f.refinery);
        expect(f.owner.credits).toBe(10000 + (power ? 0 : amount));
        expect(f.blackouts.size).toBe(power ? 1 : 0);
    });
}

for (const reason of ['stop', 'move', 'retarget', 'captured', 'destroyed', 'projectile-removed', 'owner-change', 'source-unspawn']) {
    test(`${reason} cancels pending drain and rejects late impact`, () => {
        const f = fixture(100), shot = { id: 40, isSpawned: true };
        f.drain.stop(f.world); f.drain.prepare(shot, f.refinery, f.world);
        if (['stop', 'move', 'retarget'].includes(reason)) f.drain[NotifyOrder.onPush](f.disc, 11, false);
        if (reason === 'captured') f.refinery.owner = f.owner;
        if (reason === 'destroyed') f.refinery.isDestroyed = true;
        if (reason === 'projectile-removed') { shot.isSpawned = false; f.advance(1); }
        if (reason === 'owner-change') f.drain[NotifyOwnerChange.onChange](f.disc, f.owner, f.world);
        if (reason === 'source-unspawn') f.drain[NotifyUnspawn.onUnspawn](f.disc, f.world);
        f.drain.start(f.refinery, f.world, shot); f.advance(1);
        expect(f.drain.isEngaged()).toBe(false);
        expect(f.drain.getTarget()).toBeUndefined();
        expect(f.blackouts.size).toBe(0);
        expect(f.owner.credits).toBe(10000);
    });
}

test('an old projectile cannot replace a newer reservation; queued orders preserve it', () => {
    const f = fixture(), oldShot = { id: 40, isSpawned: true }, newShot = { id: 41, isSpawned: true };
    f.drain.stop(f.world); f.drain.prepare(oldShot, f.refinery, f.world);
    const oldHash = f.drain.getHash();
    f.drain[NotifyOrder.onPush](f.disc, 2, false);
    f.drain.prepare(newShot, f.refinery, f.world);
    expect(f.drain.getHash()).not.toBe(oldHash);
    f.drain.start(f.refinery, f.world, oldShot);
    expect(f.drain.getTarget()).toBeUndefined();
    f.drain[NotifyOrder.onPush](f.disc, 0, true);
    f.drain.start(f.refinery, f.world, newShot);
    expect(f.drain.getTarget()).toBe(f.refinery);
});


test('drain approach reaches the building center while ordinary weapon movement retains edge range', () => {
    const f = fixture();
    Object.setPrototypeOf(f.refinery, GameObject.prototype);
    f.refinery.centerTile = { rx: 57, ry: 85, z: 0 };
    const task: any = new MoveInWeaponRangeTask(f.world, f.refinery, false, f.drainWeapon);
    task.losHelper.hasLineOfSight = () => true;
    expect(task.isCloseEnoughToDest(f.disc, f.disc.tile)).toBe(false);
    expect(task.isCloseEnoughToDest(f.disc, f.refinery.centerTile)).toBe(true);
    task.weapon = { ...f.drainWeapon, rules: { ...f.drainWeapon.rules, drainWeapon: false } };
    expect(task.isCloseEnoughToDest(f.disc, f.disc.tile)).toBe(true);
});
