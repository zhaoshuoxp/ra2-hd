import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Production } from '../../../src/game/player/production/Production';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { SideType } from '../../../src/game/SideType';
const root = '.artifacts/m1-7-yr',
  inv = JSON.parse(readFileSync(`${root}/source-v1/inventory.json`, 'utf8'));
const retail = new IniFile(readFileSync(`${root}/source-v1/rulesmd.ini`, 'utf8'));
const { rules: adapted, additions } = adaptRetailRules(retail),
  rules = new Rules(adapted);
// Preserve the existing adapter; no new rule edits are authorized by this audit.
const results: any[] = [];
for (const family of inv.families) {
  const type =
    family.category === 'InfantryTypes' ? 3 : family.category === 'AircraftTypes' ? 1 : 7;
  const rule: any = rules.getObject(family.id, type);
  assert.equal(rule.imageName, family.image);
  const houses = inv.sovietHouses.filter(
    (name: string) =>
      rule.hasOwner(rules.getCountry(name)) && rule.isAvailableTo(rules.getCountry(name)),
  );
  assert.deepEqual(houses, family.houses);
  const gates = [];
  for (const name of inv.sovietHouses) {
    // Explicit synthetic prerequisites/factories; this is not naturally obtained gameplay.
    const buildings = [...rules.buildingRules.values()]
      .filter((b: any) => b.owner?.some((owner: string) => inv.sovietHouses.includes(owner)))
      .map((b: any) => ({
        name: b.name,
        rules: b,
        factoryTrait: b.factory ? { type: b.factory } : undefined,
      }));
    const player = { country: rules.getCountry(name), isAi: false, buildings, getOwnedObjects: () => [] };
    const prod = new Production(player, 10, { superWeapons: true }, rules, [rule]);
    const before = prod.meetsStolenTech(rule);
    prod.addStolenTech(SideType.GDI);
    const allied = prod.meetsStolenTech(rule);
    prod.addStolenTech(SideType.Nod);
    const both = prod.meetsStolenTech(rule);
    prod.addStolenTech(SideType.ThirdSide);
    const all = prod.meetsStolenTech(rule);
    assert.equal(before, !(family.stolenTech.allied || family.stolenTech.soviet || family.stolenTech.third));
    assert.equal(all, true);
    assert.equal(both, !family.stolenTech.third);
    if (family.id === 'CIVAN') assert.equal(allied, false);
    if (family.id === 'CCOMAND') assert.equal(allied, true);
    if (family.id === 'PTROOP') assert.equal(allied, false);
    if (family.id === 'YURIPR') assert.equal(allied, false);
    gates.push({
      house: name,
      countryAllowed: rule.isAvailableTo(player.country),
      owner: rule.hasOwner(player.country),
      stolenGateBefore: before,
      afterAllied: allied,
      afterBoth: both,
      afterAllThree: all,
      factoryAvailable: prod.hasFactoryFor(rule),
      prerequisitesMet: prod.meetsPrerequisites(rule),
      syntheticAvailability: prod.isAvailableForProduction(rule),
    });
  }
  results.push({
    id: family.id,
    type,
    image: rule.imageName,
    techLevel: rule.techLevel,
    buildLimit: rule.buildLimit,
    houses,
    gates,
  });
}
assert.equal(inv.count.newRulesIdentities, 4);
assert.equal(inv.count.rulesIdentities, 28);
assert.deepEqual(inv.discrepancy, { unexpected: [], missing: [] });
assert.equal(inv.families.find((f: any) => f.id === 'DRON').representation, 'SHP');
assert.equal(inv.families.find((f: any) => f.id === 'SQD').attachments[0].member, 'sqdg.shp');
for (const [id, child] of [
  ['HARV', 'HORV'],
  ['V3', 'V3ROCKET'],
  ['DRED', 'DMISL'],
  ['SCHP', 'SCHD'],
  ['BORIS', 'BPLN'],
])
  assert.ok(inv.families.find((f: any) => f.id === id).children.some((c: any) => c.id === child));
assert.equal(inv.families.find((f: any) => f.id === 'SCHP').attachments[0].member, 'schpdepl.shp');
for (const row of results) assert(row.gates.some(g => g.syntheticAvailability), `${row.id} requires an explicit blocker`);
const output = {
  status: 'PASS_RULES_AND_SOURCE_AUDIT',
  disclosure:
    'Actual parsed rules and production methods with synthetic factory/prerequisite inventory and injected stolen-tech flags. No match buildability or ability completion claim.',
  compatibilityAdditions: additions,
  units: results,
};
writeFileSync(`${root}/rules-audit.json`, JSON.stringify(output, null, 2) + '\n');
console.log(output.status, results.length);
