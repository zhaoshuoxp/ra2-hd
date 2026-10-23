// Native retail Production closure, with trainer effects absent and rules unchanged.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Production } from '../../../src/game/player/production/Production';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';

const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const native = resolveMember(editionRetailTree(top, 'yr'), GAME_EDITIONS.yr.rules).file.readAsString();
const rules = new Rules(adaptRetailRules(new IniFile(native)).rules);
const buildings: any[] = [];
const add = (rule: any) => buildings.push({ name: rule.name, rules: rule,
    factoryTrait: rule.factory ? { type: rule.factory } : undefined });
add(rules.getObject('YACNST', 2));
const player = { country: rules.getCountry('YuriCountry'), isAi: false, buildings, getOwnedObjects: () => [] };
const production = new Production(player, rules.mpDialogSettings.techLevel, { superWeapons: true }, rules, []);
for (let changed = true; changed;) {
    changed = false;
    for (const rule of rules.buildingRules.values()) {
        if (!buildings.some(b => b.name === rule.name) && production.isAvailableForProduction(rule)) {
            add(rule);
            changed = true;
        }
    }
}
const inventory = JSON.parse(readFileSync('.artifacts/yuri-buildings/source-v1/inventory.json', 'utf8'));
const reachable = buildings.map(b => b.name).sort();
const exclusions = inventory.union.filter(id => !reachable.includes(id)).map(id => ({
    id, techLevel: rules.getObject(id, 2).techLevel, nativeTechLimit: rules.mpDialogSettings.techLevel,
    reason: 'NATIVE_PRODUCTION_UNAVAILABLE_WITH_COMPLETE_LEGAL_TECH_CLOSURE',
}));
assert.deepEqual(exclusions.map(r => r.id), ['YADEPT']);
assert.deepEqual(reachable, inventory.union.filter(id => id !== 'YADEPT'));
writeFileSync(process.argv[2], JSON.stringify({ status: 'PASS_NATIVE_YURI_PRODUCTION_CLOSURE',
    reachable, exclusions, trainer: 'ABSENT', source: 'Imported retail rulesmd.ini and native Production',
    disclosure: 'Native methods with a synthetic legal prerequisite closure; actual production/actions remain separate.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ reachable: reachable.length, exclusions }));
