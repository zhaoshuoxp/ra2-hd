import { expect, test } from 'bun:test';
import { IniSection } from '../../src/data/IniSection';
import { readLightTint } from '../../src/game/rules/readLightTint';

test('retail blue lamps retain low green without changing generic comma lists', () => {
    const ini = new IniSection('INBLULMP');
    ini.set('LightRedTint', '0.01');
    ini.set('LightGreenTint', '0,01');
    ini.set('LightBlueTint', '0.7');
    expect(['LightRedTint', 'LightGreenTint', 'LightBlueTint'].map(k => readLightTint(ini, k)))
        .toEqual([.01, .01, .7]);
    expect(ini.getNumberArray('LightGreenTint')).toEqual([0, 1]);
});

test('map overrides, negative tint, percentages and omitted defaults retain their values', () => {
    const ini = new IniSection('MAPLAMP');
    for (const [text, number] of [['0.20', .2], ['-1.5', -1.5], ['5%', .05], [' 0,01 ', .01]] as const) {
        ini.set('LightGreenTint', text);
        expect(readLightTint(ini, 'LightGreenTint')).toBe(number);
    }
    expect(readLightTint(ini, 'LightRedTint')).toBe(1);
});
