import type { IniSection } from '@/data/IniSection';

// Retail BLUELAMP/INBLULMP use a decimal comma in LightGreenTint.
// Keep this compatibility rule local to tint scalars, leaving INI lists intact.
export function readLightTint(ini: IniSection, key: string): number {
    const value = ini.getString(key).trim();
    if (/^[+-]?\d+,\d+$/.test(value)) return Number(value.replace(',', '.'));
    return ini.getNumber(key, 1);
}
