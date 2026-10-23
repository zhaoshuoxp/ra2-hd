import { readFileSync, writeFileSync } from 'node:fs';
import { IniFile } from '../../src/data/IniFile';
import { CountryRules } from '../../src/game/rules/CountryRules';
import { SuperWeaponRules } from '../../src/game/rules/SuperWeaponRules';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { Rules } from '../../src/game/rules/Rules';
const root = process.argv[2] ?? '.artifacts/editions/audit';
const results: any[] = [];
for (const edition of ['ra2', 'yr']) {
    const ini = new IniFile(readFileSync(`${root}/${edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini'}`, 'utf8'));
    const result: any = { edition, countries: [], superWeapons: [] };
    for (const id of ini.getSection('Countries')!.entries.values()) {
        const section = ini.getSection(String(id))!;
        try { new CountryRules(String(id)).readIni(section); result.countries.push({ id, parsed: true, side: section.getString('Side') }); }
        catch (e: any) { result.countries.push({ id, parsed: false, error: e.message }); }
    }
    for (const [index, id] of [...ini.getSection('SuperWeaponTypes')!.entries.values()].entries()) {
        const parsed = new SuperWeaponRules(index).readIni(ini.getSection(String(id))!);
        result.superWeapons.push({ id, declared: ini.getSection(String(id))!.getString('Type'), parsed: parsed.type !== undefined });
    }
    try { new Rules(adaptRetailRules(ini).rules); result.completeRulesParser = 'PASS'; }
    catch (e: any) { result.completeRulesParser = 'FAIL'; result.parserError = e.message; }
    results.push(result);
}
writeFileSync(`${root}/engine-probe.json`, JSON.stringify({ status: 'YR_SKIRMISH_NOT_IMPLEMENTED', results }, null, 2));
console.log(JSON.stringify(results));
