import { IniFile } from '../data/IniFile';

export const retailCompatibilityVersion = 'ra2-offline-compat/1';
export function adaptRetailRules(base: IniFile): { rules: IniFile; additions: string[] } {
    const general = base.getSection('General');
    if (!general) throw new Error('Retail compatibility requires [General]');
    const rules = base.clone();
    const additions: string[] = [];
    if (!general.has('ParadropPlane')) {
        // The archived AircraftTypes registry and ParaDropWeapon identify the existing plane.
        // This supplies the engine's name lookup; it does not replace any aircraft statistics.
        const aircraft = base.getSection('AircraftTypes');
        const plane = base.getSection('PDPLANE');
        if (!aircraft || ![...aircraft.entries.values()].includes('PDPLANE') ||
            plane?.getString('Primary') !== 'ParaDropWeapon') {
            throw new Error('Retail compatibility cannot resolve registered PDPLANE/ParaDropWeapon');
        }
        rules.getOrCreateSection('General').set('ParadropPlane', 'PDPLANE');
        additions.push('General.ParadropPlane');
    }
    return { rules, additions };
}
