import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { Rules } from '../../src/game/rules/Rules';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { FactoryType } from '../../src/game/rules/TechnoRules';
import { Production } from '../../src/game/player/production/Production';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { retailIni } from '../test-support/resources';

function fixture(version = 39, edition = 'yr') {
    const original = new IniFile(readFileSync('.local/campaign/yr/sov06lmd/sov06lmd.map', 'utf8'));
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules.clone().mergeWith(original));
    const buildings = new Set<any>();
    const player: any = { buildings, country: { name: 'Russians' }, getOwnedObjects: () => [...buildings] };
    const lunar = rules.getObject('LUNR', ObjectType.Infantry) as any;
    const production = new Production(player, 10, { superWeapons: true, campaign: { edition, semanticsVersion: version } }, rules, [lunar]);
    const barracks = { name: 'NAHAND', rules: rules.getBuilding('NAHAND'), factoryTrait: { type: FactoryType.InfantryType } };
    return { rules, lunar, production, buildings, barracks };
}

test('YR39 original lunar prerequisite residue permits paid infantry only after an ordinary factory exists', () => {
    const { rules, lunar, production, buildings, barracks } = fixture();
    expect(lunar.prerequisite).toEqual(['NAPILE']);
    expect([...rules.getIni().getSection('BuildingTypes')!.entries.values()]).not.toContain('NAPILE');
    expect(production.isAvailableForProduction(lunar)).toBe(false);
    buildings.add(barracks); expect(production.isAvailableForProduction(lunar)).toBe(true);
    buildings.clear(); expect(production.isAvailableForProduction(lunar)).toBe(false);
    expect(lunar.prerequisite).toEqual(['NAPILE']);
});

test('known categories, named prerequisites and allocated undefined slots remain required', () => {
    const { production, buildings, barracks, rules } = fixture(); buildings.add(barracks);
    expect(production.meetsPrerequisites({ prerequisite: ['BARRACKS'] })).toBe(true);
    expect(production.meetsPrerequisites({ prerequisite: ['NATECH'] })).toBe(false);
    buildings.add({ name: 'NATECH' }); expect(production.meetsPrerequisites({ prerequisite: ['NATECH'] })).toBe(true);
    expect([...rules.getIni().getSection('BuildingTypes')!.entries.values()]).toContain('CATIME');
    expect(rules.hasObject('CATIME', ObjectType.Building)).toBe(false);
    expect(production.meetsPrerequisites({ prerequisite: ['CATIME'] })).toBe(false);
    expect(production.meetsPrerequisites({ prerequisite: ['POWER'] })).toBe(false);
    buildings.add({ name: 'NAPOWR' }); expect(production.meetsPrerequisites({ prerequisite: ['POWER'] })).toBe(true);
});

test('earlier YR saves, RA2 and skirmish retain their existing literal prerequisite behavior', () => {
    for (const [version, edition] of [[38, 'yr'], [39, 'ra2'], [39, 'skirmish']] as const) {
        const { production, buildings, barracks, lunar } = fixture(version, edition); buildings.add(barracks);
        expect(production.isAvailableForProduction(lunar)).toBe(false);
    }
});
