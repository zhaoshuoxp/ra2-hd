import { test, expect } from 'bun:test';
import { MindControllerTrait } from '../../src/game/gameobject/trait/MindControllerTrait';
import { MindControllableTrait } from '../../src/game/gameobject/trait/MindControllableTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';
import { NotifyUnspawn } from '../../src/game/gameobject/trait/interface/NotifyUnspawn';
import { NotifyDestroy } from '../../src/game/gameobject/trait/interface/NotifyDestroy';
import { IniFile } from '../../src/data/IniFile';

function fixture(infinite = false, capacity = 3) {
    const owner = { name: 'yuri' }, previous = { name: 'allied' };
    const ini = new IniFile('[General]\nOverloadCount=3,6,10,50\nOverloadDamage=0,50,100,500\nOverloadFrames=30,60,60,60');
    let hp = 1000;
    const controller: any = { owner, invulnerableTrait: { isActive: () => false }, healthTrait: {
        inflictDamage: (v: number) => { hp -= v; }, get health() { return hp; } } };
    const world: any = { rules: { getIni: () => ini }, changeObjectOwner: (o: any, p: any) => { o.owner = p; }, destroyObject: (o: any) => { o.isDestroyed = true; } };
    const trait = controller.mindControllerTrait = new MindControllerTrait(controller, capacity, infinite);
    const target = () => {
        const o: any = { name: 'tank', owner: previous };
        o.mindControllableTrait = new MindControllableTrait(o);
        return o;
    };
    return { controller, trait, world, target, previous, hp: () => hp };
}
test('retail tower capacity refuses a fourth victim and restoration frees one slot', () => {
    const f = fixture(), units = Array.from({ length: 4 }, f.target);
    units.slice(0, 3).forEach(u => f.trait.control(u, f.world));
    expect(f.trait.isAtCapacity()).toBe(true);
    f.trait.control(units[3], f.world);
    expect(units[3].owner).toBe(f.previous);
    expect(f.trait.getTargets()).toEqual(units.slice(0, 3));
    units[2].mindControllableTrait.restore(f.world);
    expect(f.trait.getTargets()).toEqual([units[0], units[1]]);
    f.trait.control(units[3], f.world);
    expect(f.trait.getTargets()).toEqual([units[0], units[1], units[3]]);
    f.trait[NotifyUnspawn.onUnspawn](f.controller, f.world);
    expect(units.every(u => u.owner === f.previous)).toBe(true);
    expect(f.trait.isActive()).toBe(false);
});
test('Mastermind keeps excess targets, applies retail overload tiers and releases every target', () => {
    const f = fixture(true), units = Array.from({ length: 7 }, f.target);
    units.slice(0, 3).forEach(u => f.trait.control(u, f.world));
    for (let i = 0; i < 100; i++) f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.hp()).toBe(1000);
    f.trait.control(units[3], f.world);
    expect(f.trait.isAtCapacity()).toBe(false);
    for (let i = 0; i < 59; i++) f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.hp()).toBe(1000);
    f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.hp()).toBe(950);
    units.slice(4).forEach(u => f.trait.control(u, f.world));
    for (let i = 0; i < 60; i++) f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.hp()).toBe(850);
    f.trait[NotifyUnspawn.onUnspawn](f.controller, f.world);
    expect(units.every(u => u.owner === f.previous)).toBe(true);
});

test('single-slot Yuri replaces and restores the previous victim', () => {
    const f = fixture(false, 1), first = f.target(), second = f.target();
    f.trait.control(first, f.world); f.trait.control(second, f.world);
    expect(first.owner).toBe(f.previous);
    expect(f.trait.getTargets()).toEqual([second]);
});

test('a controller killed in transport releases victims without a second unspawn event', () => {
    const f = fixture(false, 1), target = f.target();
    f.trait[NotifyUnspawn.onUnspawn](f.controller, f.world);
    f.trait.control(target, f.world);
    f.trait[NotifyDestroy.onDestroy](f.controller, f.world);
    expect(target.owner).toBe(f.previous);
    expect(target.mindControllableTrait.isActive()).toBe(false);
    expect(f.trait.getTargets()).toEqual([]);
});

test('powered control towers release all victims during a power outage', () => {
    const f = fixture(), victims = Array.from({ length: 3 }, f.target);
    let powered = true;
    f.controller.poweredTrait = { isPoweredOn: () => powered };
    victims.forEach(u => f.trait.control(u, f.world));
    f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.trait.getTargets()).toHaveLength(3);
    powered = false;
    f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.trait.getTargets()).toHaveLength(0);
    expect(victims.every(u => u.owner === f.previous)).toBe(true);
    powered = true;
    f.trait.control(victims[0], f.world);
    f.trait[NotifyTick.onTick](f.controller, f.world);
    expect(f.trait.getTargets()).toEqual([victims[0]]);
});
