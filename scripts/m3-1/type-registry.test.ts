import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { retailCampaignTechno } from '../../src/game/campaign/CampaignTypeRegistry';

test('missing retail type definitions keep their numeric slots while duplicate names do not allocate twice', () => {
    const ini = new IniFile('[BuildingTypes]\n0=YARD\n1=RESERVED\n2=YARD\n3=BARRACKS\n'
        + '[VehicleTypes]\n0=TRUCK\n[AircraftTypes]\n0=UNDEFINED_PLANE\n[InfantryTypes]\n0=ENGINEER');
    const engineer = { name: 'ENGINEER', marker: 'live-rules' };
    const rules = { getIni: () => ini, hasObject: (name: string) => name === 'ENGINEER', getObject: () => engineer };
    expect(retailCampaignTechno(rules, 1).name).toBe('RESERVED');
    expect(retailCampaignTechno(rules, 2).name).toBe('BARRACKS');
    expect(retailCampaignTechno(rules, 5)).toBe(engineer);
    expect(() => retailCampaignTechno(rules, 6)).toThrow('Invalid RA2 TechnoType index');
});
