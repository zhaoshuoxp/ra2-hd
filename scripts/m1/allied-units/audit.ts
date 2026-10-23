// Source eligibility audit: native Production methods, synthetic legal building inventory.
import { readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Production } from '../../../src/game/player/production/Production';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { SideType } from '../../../src/game/SideType';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
const output: any = { status: 'SOURCE_ELIGIBILITY_AUDIT', baseline: '3b1bec1', editions: {},
  disclosure: 'Native rules and Production methods; synthetic building inventory and stolen flags. Not natural match production or action evidence.' };
for (const edition of ['ra2', 'yr'] as const) {
  const root = `.artifacts/allied-units/source-v2/${edition}`;
  const inv = JSON.parse(readFileSync(`${root}/inventory.json`, 'utf8'));
  const adapted = adaptRetailRules(new IniFile(readFileSync(`${root}/${GAME_EDITIONS[edition].rules}`, 'utf8')));
  const rules = new Rules(adapted.rules);
  const rows = inv.families.map((family: any) => {
    const type = family.category === 'InfantryTypes' ? 3 : family.category === 'AircraftTypes' ? 1 : 7;
    const rule: any = rules.getObject(family.id, type);
    const gates = inv.alliedHouses.map((name: string) => {
      const country = rules.getCountry(name);
      const buildings: any[] = [];
      // Start with the MCV's native construction-yard handoff, then close legal prerequisites.
      const seed = rules.buildingRules.get('GACNST');
      if (!seed) throw Error('Missing Allied construction yard');
      const add = (b: any) => buildings.push({ name: b.name, rules: b,
        factoryTrait: b.factory ? { type: b.factory } : undefined });
      add(seed);
      const player = { country, isAi: false, buildings, getOwnedObjects: () => [] };
      const prod = new Production(player, 10, { superWeapons: true }, rules, [rule]);
      for (let changed = true; changed;) {
        changed = false;
        for (const b of rules.buildingRules.values() as any) {
          if (buildings.some(x => x.name === b.name) || b.techLevel < 0 || b.techLevel > 10 ||
              !b.hasOwner(country) || !b.isAvailableTo(country) || !prod.isAvailableForProduction(b)) continue;
          add(b); changed = true;
        }
      }
      const before = prod.meetsStolenTech(rule);
      const progression = [];
      for (const side of [SideType.GDI, SideType.Nod, SideType.ThirdSide]) {
        prod.addStolenTech(side); progression.push(prod.meetsStolenTech(rule));
      }
      return { house: name, owner: rule.hasOwner(country), countryAllowed: rule.isAvailableTo(country),
        reachableBuildings: buildings.map(b => b.name), factory: prod.hasFactoryFor(rule),
        prerequisites: prod.meetsPrerequisites(rule), stolenBefore: before, stolenProgression: progression,
        available: rule.hasOwner(country) && prod.isAvailableForProduction(rule) };
    });
    return { id: family.id, image: rule.imageName, gates,
      included: gates.some((g: any) => g.available),
      reason: gates.some((g: any) => g.available) ? 'NATIVE_ALLIED_PRODUCTION_ROOT' : 'UNAVAILABLE_NATIVE_ALLIED_FACTORY_OR_PREREQUISITE' };
  });
  output.editions[edition] = { houses: inv.alliedHouses, rows,
    count: rows.filter((r: any) => r.included).length,
    missingSections: inv.missingSections, compatibilityAdditions: adapted.additions };
}
writeFileSync('.artifacts/allied-units/rules-audit-v1.json', JSON.stringify(output, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(Object.fromEntries(Object.entries(output.editions).map(([edition, data]: any) =>
  [edition, { count: data.count, included: data.rows.filter((r: any) => r.included).map((r: any) => r.id),
    excluded: data.rows.filter((r: any) => !r.included).map((r: any) => r.id) }]))));
