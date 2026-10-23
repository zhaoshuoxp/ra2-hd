import { expect, test } from 'bun:test';
import { Production } from '../../src/game/player/production/Production';
import { PrereqCategory } from '../../src/game/rules/GeneralRules';

test('a packed slave miner continues to meet PROC without replacing unrelated prerequisites', () => {
    const units = [{ name: 'SMIN' }];
    const player: any = { buildings: new Set([{ name: 'YABRCK' }]), getOwnedObjects: () => units };
    const rules: any = { general: { prereqProcAlternate: ['SMIN'], prereqCategories: new Map([[PrereqCategory.Proc, ['YAREFN']]]) } };
    const production = new Production(player, 10, {}, rules, []);
    expect(production.meetsPrerequisites({ prerequisite: ['PROC', 'YABRCK'] })).toBe(true);
    expect(production.meetsPrerequisites({ prerequisite: ['PROC', 'YATECH'] })).toBe(false);
    units.length = 0;
    expect(production.meetsPrerequisites({ prerequisite: ['PROC'] })).toBe(false);
    player.buildings.add({ name: 'YAREFN' });
    expect(production.meetsPrerequisites({ prerequisite: ['PROC'] })).toBe(true);
});

test('retail override buildings unlock their named prerequisite path only', () => {
    const player: any = { buildings: new Set([{ name: 'CAWA2A' }]) };
    const production = new Production(player, 10, {}, { general: {} }, []);
    expect(production.meetsPrerequisites({ prerequisite: ['GAPILE'], prerequisiteOverride: ['CAWA2A', 'CAWA2B'] })).toBe(true);
    expect(production.meetsPrerequisites({ prerequisite: ['GAPILE'], prerequisiteOverride: ['CAWA2B'] })).toBe(false);
});
