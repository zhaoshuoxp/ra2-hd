import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { TechBuildingsTrait } from '../../src/game/trait/TechBuildingsTrait';
import { NotifyTick } from '../../src/game/trait/interface/NotifyTick';
import { Production } from '../../src/game/player/production/Production';
import { FactoryType } from '../../src/game/rules/TechnoRules';
import { ObjectType } from '../../src/engine/type/ObjectType';

test('preplaced secret lab choices persist and explicit map overrides unlock only the named unit', () => {
    const lab: any = { id: 1, isBuilding: () => true, rules: { secretLab: true, secretProduction: '' },
        isSpawned: true, warpedOutTrait: { isActive: () => false } };
    const ini = new IniFile('[General]\nSecretInfantry=DESO,TERROR\nSecretUnits=TTNK\nSecretBuildings=GTGCAN');
    const game: any = { currentTick: 0, rules: { getIni: () => ini }, world: { getAllObjects: () => [lab] },
        generateRandomInt: () => 0, getCombatants: () => [] };
    const trait = new TechBuildingsTrait();
    trait[NotifyTick.onTick](game);
    expect(lab.secretProduction).toBe('DESO');
    game.generateRandomInt = () => { throw new Error('Recapture must not reroll a boon'); };
    trait[NotifyTick.onTick](game);
    const player: any = { country: {}, buildings: new Set([lab]) };
    const production = new Production(player, 10, {}, {}, []);
    const object: any = { name: 'DESO', type: ObjectType.Infantry, techLevel: 5, isAvailableTo: () => false };
    expect(production.isAvailableForProduction(object)).toBe(false);
    player.buildings.add({ rules: {}, factoryTrait: { type: FactoryType.InfantryType } });
    expect(production.isAvailableForProduction(object)).toBe(true);
    lab.rules.secretProduction = 'TERROR';
    expect(production.isAvailableForProduction(object)).toBe(false);
    expect(production.isAvailableForProduction({ ...object, name: 'TERROR' })).toBe(true);
    player.buildings.delete(lab);
    expect(production.isAvailableForProduction({ ...object, name: 'TERROR' })).toBe(false);
});

test('tech healing stacks, separates organic/mechanical units, excludes aircraft and ends on loss of the structure', () => {
    const ini = new IniFile('[General]\nSelfHealInfantryFrames=50\nSelfHealInfantryAmount=20\nSelfHealUnitFrames=75\nSelfHealUnitAmount=5');
    const healed = [0, 0, 0, 0];
    const units = ['infantry', 'tank', 'squid', 'plane'].map((name, i) => ({ rules: { organic: name === 'squid' },
        isUnit: () => true, isAircraft: () => name === 'plane', isInfantry: () => name === 'infantry',
        warpedOutTrait: { isActive: () => false }, healthTrait: { health: 50, healBy: (n: number) => healed[i] += n } }));
    const building = { rules: { infantryGainSelfHeal: 1, unitsGainSelfHeal: 1 }, buildStatus: 1, isSpawned: true, warpedOutTrait: { isActive: () => false } };
    const player = { buildings: [building, { ...building }], getOwnedObjects: () => units };
    const game: any = { currentTick: 150, rules: { getIni: () => ini }, world: { getAllObjects: () => [] }, getCombatants: () => [player] };
    const trait = new TechBuildingsTrait();
    trait[NotifyTick.onTick](game);
    expect(healed).toEqual([40, 10, 40, 0]);
    player.buildings = [];
    game.currentTick = 300;
    trait[NotifyTick.onTick](game);
    expect(healed).toEqual([40, 10, 40, 0]);
});
