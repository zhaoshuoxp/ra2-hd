import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';

const fixture = () => new IniFile({
    General: { SyntheticBalance: '123' }, AircraftTypes: { '7': 'PDPLANE' },
    PDPLANE: { Primary: 'ParaDropWeapon', Strength: '321', Speed: '19' },
    SyntheticUnit: { Cost: '765', Soylent: '12' },
    SyntheticWeapon: { Damage: '17', Range: '4.5' },
    MultiplayerDialogSettings: { Crates: 'yes', SuperWeapons: 'yes' },
});
test('adapter adds only the missing identity and preserves every archived rule entry', () => {
    const base = fixture(); const before = base.toString();
    const { rules, additions } = adaptRetailRules(base);
    expect(additions).toEqual(['General.ParadropPlane']);
    expect(rules.getSection('General')?.getString('ParadropPlane')).toBe('PDPLANE');
    for (const [name, section] of base.sections) {
        for (const [key, value] of section.entries) expect(rules.getSection(name)?.get(key)).toEqual(value);
    }
    rules.getSection('General')!.entries.delete('ParadropPlane');
    expect(rules.toString()).toBe(before);
    expect(base.toString()).toBe(before);
});
test('existing explicit configuration is preserved and malformed prerequisites fail', () => {
    const base = fixture(); base.getSection('General')!.set('ParadropPlane','EXPLICIT');
    expect(adaptRetailRules(base).rules.toString()).toBe(base.toString());
    expect(adaptRetailRules(base).additions).toEqual([]);
    const missing = fixture(); missing.sections.delete('PDPLANE');
    expect(() => adaptRetailRules(missing)).toThrow('cannot resolve');
    const unregistered = fixture(); unregistered.getSection('AircraftTypes')!.entries.clear();
    expect(() => adaptRetailRules(unregistered)).toThrow('cannot resolve');
});
