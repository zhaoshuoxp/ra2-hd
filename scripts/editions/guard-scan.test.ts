import { expect, test } from 'bun:test';
import { ArmedTrait } from '../../src/game/gameobject/trait/ArmedTrait';

const weapon = (range: number, neverUse = false) => ({ range, rules: { neverUse } });
function armed(primary?: any, secondary?: any, guardRange = 0) {
    const trait = Object.create(ArmedTrait.prototype);
    Object.assign(trait, { primaryWeapon: primary, secondaryWeapon: secondary, gameObject: { rules: { guardRange } } });
    return trait as ArmedTrait;
}

test('single-weapon units can scan in area guard without a secondary weapon', () => {
    const primary = weapon(6), trait = armed(primary);
    expect(trait.computeGuardScanRange(primary as any)).toBe(11);
    expect(armed(undefined, primary).computeGuardScanRange(primary as any)).toBe(11);
});

test('guard scan retains selected, dummy range, native guard range and range cap semantics', () => {
    const primary = weapon(3), ordinarySecondary = weapon(8), dummy = weapon(8, true);
    expect(armed(primary, ordinarySecondary).computeGuardScanRange(primary as any)).toBe(5);
    expect(armed(primary, ordinarySecondary).computeGuardScanRange(ordinarySecondary as any)).toBe(15);
    expect(armed(primary, dummy).computeGuardScanRange(primary as any)).toBe(15);
    expect(armed(primary, undefined, 7).computeGuardScanRange(primary as any)).toBe(13);
    expect(armed(undefined, undefined, 4).computeGuardScanRange()).toBe(7);
    const trait = armed(primary, undefined);
    Object.assign(trait, { guardWeaponRangeOverride: 5 });
    expect(trait.computeGuardScanRange(primary as any)).toBe(9);
});
