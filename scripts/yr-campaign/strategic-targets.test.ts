import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { Rules } from '../../src/game/rules/Rules';
import { ObjectType } from '../../src/engine/type/ObjectType';
import { CampaignSuperWeapons } from '../../src/game/campaign/CampaignSuperWeapons';
import { adaptRetailRules } from '../../src/offline/retailCompatibility';
import { retailIni } from '../test-support/resources';

function fixture(version = 33, edition = 'yr', difficulty = 'easy') {
    const rules = new Rules(adaptRetailRules(retailIni('yr')).rules);
    const game = { rules, gameOpts: { campaign: { edition, semanticsVersion: version, difficulty } } };
    const runtime = new CampaignSuperWeapons({} as any, game, () => {}, {} as any) as any;
    const object = (name: string, type = ObjectType.Building) => ({ rules: rules.getObject(name, type),
        isBuilding: () => type === ObjectType.Building, isInfantry: () => type === ObjectType.Infantry,
        isVehicle: () => type === ObjectType.Vehicle });
    return { runtime, object, rules };
}

test('YR33 classifies stock radar and aircraft factories without reading absent Tiberian Sun lists', () => {
    const { runtime, object, rules } = fixture();
    expect(rules.getIni().getSection('General')!.has('AIIonCannonTempleValue')).toBe(false);
    expect(rules.getIni().getSection('General')!.has('AIIonCannonHelipadValue')).toBe(false);
    for (const name of ['NARADR', 'GAAIRC', 'AMRADR']) expect(runtime.strategicValue(object(name))).toBe(4);
    expect(runtime.strategicValue(object('GATECH'))).toBe(100);
    expect(runtime.strategicValue(object('GAWEAP'))).toBe(100);
    expect(runtime.strategicValue(object('NAYARD'))).toBe(4);
    expect(runtime.strategicValue(object('E2', ObjectType.Infantry))).toBe(2);
});

test('actual legacy flags and difficulty lists retain their original priority', () => {
    for (const [difficulty, expected] of [['hard', 11], ['normal', 12], ['easy', 13]] as const) {
        const { runtime, rules, object } = fixture(33, 'yr', difficulty);
        rules.getIni().mergeWith(new IniFile('[General]\nAIIonCannonTempleValue=11,12,13\n[NARADR]\nIsTemple=yes'));
        expect(runtime.strategicValue(object('NARADR'))).toBe(expected);
    }
    const { runtime, object } = fixture();
    expect(runtime.strategicValue(object('SMCV', ObjectType.Vehicle))).toBe(1);
    expect(runtime.strategicValue(object('SAPC', ObjectType.Vehicle))).toBe(1);
});

test('older YR and accepted RA2 policies keep their stored classification behavior', () => {
    for (const [version, edition] of [[32, 'yr'], [33, 'ra2']] as const) {
        const { runtime, object } = fixture(version, edition);
        expect(() => runtime.strategicValue(object('NARADR'))).toThrow('AIIonCannonTempleValue');
    }
});
