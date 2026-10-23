import { expect, test } from 'bun:test';
import { Production } from '../../src/game/player/production/Production';
import { SuperWeaponType } from '../../src/game/type/SuperWeaponType';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { TrainerSession } from '../../src/game/trainer/TrainerRuntime';

test('superweapon-off keeps labs and auxiliary powers available while disabling the two main powers per side', () => {
    const primary = [SuperWeaponType.MultiMissile, SuperWeaponType.IronCurtain,
        SuperWeaponType.LightningStorm, SuperWeaponType.ChronoSphere,
        SuperWeaponType.PsychicDominator, SuperWeaponType.GeneticConverter];
    const auxiliary = [SuperWeaponType.ForceShield, SuperWeaponType.ParaDrop,
        SuperWeaponType.AmerParaDrop, SuperWeaponType.SpyPlane, SuperWeaponType.PsychicReveal];
    const objects = [...primary, ...auxiliary].map(type => ({ name: `POWER-${type}`, superWeapon: String(type),
        type: ObjectType.Building, techLevel: 8, buildLimit: 1, owner: [], prerequisite: [], isAvailableTo: () => true }));
    const player: any = { country: {}, buildings: [], isAi: false, defeated: false, isObserver: false };
    const rules = { getSuperWeapon: (name: string) => ({ type: Number(name), disableableFromShell: true }) };
    const options = { superWeapons: false };
    const production = new Production(player, 10, options, rules, objects);
    for (const object of objects) expect(production.isAvailableForProduction(object)).toBe(auxiliary.includes(Number(object.superWeapon)));
    options.superWeapons = true;
    expect(objects.every(o => production.isAvailableForProduction(o))).toBe(true);
    options.superWeapons = false;
    const session = new TrainerSession({ status: 1 }, player, 'yr', () => true, () => true, () => {}, () => {});
    session.effects.technology = true;
    for (const object of objects) expect(production.isAvailableForProduction(object)).toBe(auxiliary.includes(Number(object.superWeapon)));
    session.dispose();
    player.buildings.push({ isSpawned: true, isDestroyed: false, rules: { secretLab: true,
        secretProduction: objects[0].name }, warpedOutTrait: { isActive: () => false } });
    expect(production.isAvailableForProduction(objects[0])).toBe(false);
});

test('superweapon option preserves normal prerequisite and tech-level restrictions', () => {
    const player = { country: {}, buildings: [], isAi: false };
    const object = { superWeapon: 'ForceShieldSpecial', type: ObjectType.Building,
        techLevel: 8, buildLimit: 1, owner: [], prerequisite: ['GAWEAP'], isAvailableTo: () => true };
    const rules = { getSuperWeapon: () => ({ type: SuperWeaponType.ForceShield, disableableFromShell: true }) };
    const production = new Production(player, 10, { superWeapons: false }, rules, []);
    expect(production.isAvailableForProduction(object)).toBe(false);
    (player.buildings as any[]).push({ name: 'GAWEAP', rules: {} });
    expect(production.isAvailableForProduction(object)).toBe(true);
    object.techLevel = 11;
    expect(production.isAvailableForProduction(object)).toBe(false);
});
