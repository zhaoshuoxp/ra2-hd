import { IniSection } from '@/data/IniSection';
const cache = new WeakMap<object, IniSection>();
// Retail YR moved global tags between these sections. Keep the archived INI
// untouched while presenting the same named settings to simulation consumers.
export function globalRules(rules: any): IniSection {
    const ini = rules.getIni();
    let merged = cache.get(ini);
    if (!merged) {
        merged = new IniSection('Global');
        for (const name of ['General', 'SpecialWeapons', 'AudioVisual', 'CombatDamage']) {
            const section = ini.getSection(name);
            if (section) merged.mergeWith(section);
        }
        cache.set(ini, merged);
    }
    return merged;
}
