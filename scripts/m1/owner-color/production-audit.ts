// Compare native retail production closures with only the superweapon option changed.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../../src/data/IniFile';
import { Rules } from '../../../src/game/rules/Rules';
import { Production } from '../../../src/game/player/production/Production';
import { adaptRetailRules } from '../../../src/offline/retailCompatibility';
const rows = [];
for (const edition of ['ra2', 'yr']) {
    const file = `.artifacts/allied-units/source-v2/${edition}/${edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini'}`;
    const rules: any = new Rules(adaptRetailRules(new IniFile(readFileSync(file, 'utf8'))).rules);
    for (const side of [
        { houses: ['Americans', 'Alliance', 'French', 'Germans', 'British'], yard: 'GACNST', lab: 'GATECH', powers: ['GACSPH', 'GAWEAT'] },
        { houses: ['Russians', 'Confederation', 'Africans', 'Arabs'], yard: 'NACNST', lab: 'NATECH', powers: ['NAIRON', 'NAMISL'] },
        ...(edition === 'yr' ? [{ houses: ['YuriCountry'], yard: 'YACNST', lab: 'YATECH', powers: ['YAGNTC', 'YAPPET'] }] : []),
    ]) for (const house of side.houses) {
        const cases = [false, true].map(superWeapons => {
            const country = rules.getCountry(house), buildings: any[] = [];
            const add = (r: any) => buildings.push({ name: r.name, rules: r,
                factoryTrait: r.factory ? { type: r.factory } : undefined });
            add(rules.getObject(side.yard, 2));
            const player = { country, isAi: false, buildings, getOwnedObjects: () => [] };
            const prod = new Production(player, rules.mpDialogSettings.techLevel, { superWeapons }, rules, []);
            for (let changed = true; changed;) {
                changed = false;
                for (const r of rules.buildingRules.values()) {
                    if (!buildings.some(b => b.name === r.name) && prod.isAvailableForProduction(r)) {
                        add(r); changed = true;
                    }
                }
            }
            const units = [rules.infantryRules, rules.vehicleRules, rules.aircraftRules]
                .flatMap(map => [...map.values()]).filter(r => prod.isAvailableForProduction(r)).map(r => r.name).sort();
            assert(buildings.some(b => b.name === side.lab), `${edition}/${house}: lab must remain reachable`);
            return { superWeapons, buildings: buildings.map(b => b.name).sort(), units };
        });
        assert.deepEqual(cases[1].buildings.filter(n => !cases[0].buildings.includes(n)).sort(), side.powers.sort());
        assert.deepEqual(cases[0].buildings.filter(n => !cases[1].buildings.includes(n)), []);
        assert.deepEqual(cases[0].units, cases[1].units, `${edition}/${house}: advanced unit production changed`);
        rows.push({ edition, house, lab: side.lab, cases });
    }
}
writeFileSync(process.argv[2], JSON.stringify({ status: 'PASS_RETAIL_PRODUCTION_OPTION_BOUNDARY', rows,
    disclosure: 'Native retail rules and Production methods with a synthetic legal building closure; runtime is validated separately.' }, null, 2) + '\n', { flag: 'wx' });
console.log('PASS', rows.length, 'country/edition pairs; only the two primary superweapon buildings change');
