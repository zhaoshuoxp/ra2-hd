// RA2's numeric TechnoType registry differs from each category's own index.
// YR action 115 uses an INI name instead; do not reuse this numeric order for YR.
import { ObjectType } from '../../engine/type/ObjectType';

export function retailCampaignTechno(rules: any, index: number): any {
    // Retail allocates registered names before reading their INI sections.
    // Missing definitions therefore retain slots instead of shifting later IDs.
    const categories: [string, ObjectType][] = [['BuildingTypes', ObjectType.Building], ['VehicleTypes', ObjectType.Vehicle],
        ['AircraftTypes', ObjectType.Aircraft], ['InfantryTypes', ObjectType.Infantry]];
    const types = categories.flatMap(([section, type]) => [...new Set<string>(rules.getIni().getSection(section)?.entries.values() ?? [])]
        .map(name => rules.hasObject(name, type) ? rules.getObject(name, type) : { name, type }));
    if (!Number.isSafeInteger(index) || index < 0 || !types[index]) throw new Error(`Invalid RA2 TechnoType index: ${index}`);
    return types[index];
}

// The first RA2 weapon-allocation pass precedes projectile Airburst/Shrapnel
// expansion. Keep this source order separate from the skirmish engine table.
export function retailCampaignWeapon(rules: any, index: number): any {
    const ini = rules.getIni(), names: string[] = [], seen = new Set<string>();
    const add = (name?: string) => {
        if (!name || ['none', '<none>'].includes(name.toLowerCase()) || seen.has(name.toLowerCase())) return;
        seen.add(name.toLowerCase()); names.push(name);
    };
    add(ini.getSection('CombatDamage')?.getString('DeathWeapon'));
    add(ini.getSection('General')?.getString('DropPodWeapon'));
    for (const name of new Set<string>(ini.getSection('SuperWeaponTypes')?.entries.values() ?? [])) {
        add(ini.getSection(name)?.getString('WeaponType'));
    }
    for (const category of ['BuildingTypes', 'AircraftTypes', 'VehicleTypes', 'InfantryTypes']) {
        for (const name of new Set<string>(ini.getSection(category)?.entries.values() ?? [])) {
            const section = ini.getSection(name);
            if (!section) continue;
            add(section.getString('DeathWeapon'));
            const count = section.getNumber('WeaponCount');
            if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Invalid original WeaponCount: ${name}`);
            if (count) for (let number = 1; number <= count; number++) {
                add(section.getString('Weapon' + number)); add(section.getString('EliteWeapon' + number));
            }
            else for (const key of ['Primary', 'Secondary', 'ElitePrimary', 'EliteSecondary']) add(section.getString(key));
        }
    }
    if (!Number.isSafeInteger(index) || index < 0 || !names[index]) {
        throw new Error(`RA2 weapon index ${index} is outside the qualified initial allocation pass`);
    }
    return rules.getWeapon(names[index]);
}
