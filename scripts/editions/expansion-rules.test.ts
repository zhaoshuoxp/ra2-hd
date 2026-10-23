import { test, expect } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { globalRules } from '../../src/game/rules/globalRules';
import { WarheadRules } from '../../src/game/rules/WarheadRules';
import { Warhead } from '../../src/game/Warhead';
import { PowerTrait } from '../../src/game/player/trait/PowerTrait';
import { AttackTrait } from '../../src/game/gameobject/trait/AttackTrait';
import { Alliances, AllianceStatus } from '../../src/game/Alliances';

test('berserk passive acquisition prefers an original ally over a higher-threat enemy', () => {
    const owner: any = {}, allyOwner: any = {}, enemyOwner: any = {};
    const ally = { id: 1, tile: {}, threat: 10, owner: allyOwner }, enemy = { id: 2, tile: {}, threat: 1000, owner: enemyOwner };
    const alliances = new Alliances({ getCombatants: () => [owner, allyOwner, enemyOwner] } as any);
    alliances.setAlliance(owner, allyOwner, AllianceStatus.Formed);
    let berserk = true;
    const attacker: any = { owner, rules: {}, berserkTrait: { isActive: () => berserk } };
    const weapon: any = { range: 5, rules: {}, projectileRules: {} };
    const trait: any = { getAvailableWeapons: () => [weapon], scanTechnosAround: () => [enemy, ally],
        selectWeaponFromList: () => weapon, canPassiveAcquire: () => true, computeThreat: (target: any) => target.threat,
        rangeHelper: { isInWeaponRange: () => true, distance3: () => 1 }, losHelper: { hasLineOfSight: () => true } };
    const game: any = { rules: { elevationModel: { bonusCap: 0 }, general: { threat: {} } }, isValidTarget: () => true, alliances };
    expect(AttackTrait.prototype.scanForTarget.call(trait, attacker, weapon, game).target).toBe(ally);
    ally.owner = owner;
    expect(AttackTrait.prototype.scanForTarget.call(trait, attacker, weapon, game).target).toBe(ally);
    berserk = false;
    expect(AttackTrait.prototype.scanForTarget.call(trait, attacker, weapon, game).target).toBe(enemy);
});

test('case-insensitive section lookup and YR global fallback preserve original source', () => {
    const ini = new IniFile('[General]\nBehind=BEHIND\n[AudioVisual]\nFoo=bar\n[CombatDamage]\nOverloadCount=3,6,10,50\n[InvisibleLow]\nImage=none');
    expect(ini.getSection('Invisiblelow')).toBe(ini.getSection('InvisibleLow'));
    const global = globalRules({ getIni: () => ini });
    expect(global.getString('Behind')).toBe('BEHIND');
    expect(global.getNumberArray('OverloadCount')).toEqual([3, 6, 10, 50]);
    expect(ini.getSection('AudioVisual')!.has('Behind')).toBe(false);
});
test('Dominator zero armor verses protect units while structures receive blast damage', () => {
    const section = new IniFile('[DominatorWH]\nCellSpread=7\nPercentAtMax=.2\nVerses=0%,0%,0%,0%,0%,0%,100%,100%,6%,0%,0%').getSection('DominatorWH')!;
    const wh = new Warhead(new WarheadRules(section) as any);
    const object: any = { rules: { armor: 5 }, invulnerableTrait: { isActive: () => false }, crateBonuses: { armor: 1 },
        isTechno: () => true, isUnit: () => true, isAircraft: () => false, isInfantry: () => false, isBuilding: () => false, isTerrain: () => false, isOverlay: () => false };
    const world: any = { gameOpts: { destroyableBridges: true } };
    expect(wh.computeDamage(1000, object, world)).toBe(0);
    object.rules.armor = 6;
    object.isBuilding = () => true;
    object.isUnit = () => false;
    expect(wh.computeDamage(1000, object, world)).toBe(1000);
});
test('disc power drains and Force Shield outages expire independently', () => {
    const player: any = {}, world: any = { traits: { filter: () => [] }, events: { dispatch: () => {} } };
    const power = new PowerTrait(player), a = { id: 1 }, b = { id: 2 };
    power.setExternalBlackout(a, true, world);
    power.setExternalBlackout(b, true, world);
    power.setBlackoutFor(2, world);
    power.setExternalBlackout(a, false, world);
    expect(power.isLowPower()).toBe(true);
    power.updateBlackout(world); power.updateBlackout(world);
    expect(power.isLowPower()).toBe(true);
    power.setExternalBlackout(b, false, world);
    expect(power.isLowPower()).toBe(false);
    power.setBlackoutFor(1000, world);
    power.setBlackoutFor(0, world);
    expect(power.isLowPower()).toBe(false);
});

test('retail sound references tolerate section-name casing differences', async () => {
    const { SoundSpecs } = await import('../../src/engine/sound/SoundSpecs');
    const ini = new IniFile('[Defaults]\nVolume=100\nLimit=1\n[SoundList]\n0=SpyPlaneSnapShot\n[SpyPlaneSnapShot]\nSounds=spyplane');
    const specs = new SoundSpecs(ini);
    expect(specs.getSpec('SpyPlaneSnapshot')).toBe(specs.getSpec('SpyPlaneSnapShot'));
    expect(specs.getSpec('SPYPLANESNAPSHOT')).toBeDefined();
});

test('offline robots survive water bridges and magnetic suspension but sink after landing in water', async () => {
    const { PoweredUnitTrait } = await import('../../src/game/gameobject/trait/PoweredUnitTrait');
    const { NotifyTick } = await import('../../src/game/gameobject/trait/interface/NotifyTick');
    let lifted = false, deaths = 0;
    const unit: any = { owner: { buildings: new Set() }, rules: {}, onBridge: true, tile: {},
        magneticLiftTrait: { isActive: () => lifted }, moveTrait: { setDisabled: () => {} }, attackTrait: { setDisabled: () => {} },
        unitOrderTrait: { clearOrders: () => {}, cancelAllTasks: () => {} } };
    const game: any = { map: { getTileZone: () => 2 }, destroyObject: () => deaths++, events: { dispatch: () => {} } };
    const trait = new PoweredUnitTrait();
    trait[NotifyTick.onTick](unit, game);
    expect(trait.isOnline()).toBe(false);
    expect(deaths).toBe(0);
    unit.onBridge = false; lifted = true;
    trait[NotifyTick.onTick](unit, game);
    expect(deaths).toBe(0);
    lifted = false;
    trait[NotifyTick.onTick](unit, game);
    expect(deaths).toBe(1);
});
