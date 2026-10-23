import { expect, test } from 'bun:test';
import { preferredLanguage, englishLabel } from '../../src/gui/Language';
import { commandCursorFamily } from '../../src/gui/HdCommandCursor';
import { PointerType } from '../../src/engine/type/PointerType';
import { nativeHealthPipIndex } from '../../src/engine/renderable/entity/HdHealthArt';
import { scoreTheme } from '../../src/gui/screen/mainMenu/score/ScoreScene';
import { SideType } from '../../src/game/SideType';

test('interface language accepts the three supported persisted values and survives denied storage', () => {
    for (const language of ['en-US', 'zh-CN', 'zh-TW'] as const) expect(preferredLanguage({ getItem: () => language })).toBe(language);
    for (const value of [null, 'ja-JP', 'english']) expect(preferredLanguage({ getItem: () => value })).toBeUndefined();
    expect(preferredLanguage({ getItem: () => { throw Error('denied'); } })).toBeUndefined();
    expect(englishLabel('GUI:ChooseMap')).toBe('Choose Map');
});
test('every native cursor frame retains its command family and phase boundary', () => {
    const starts = Object.values(PointerType).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
    for (let frame = 0; frame <= 516; frame++) {
        const family = commandCursorFamily(frame)!;
        expect(family).toBeDefined();
        expect(family.start + family.phase).toBe(frame);
        expect(family.start).toBeLessThanOrEqual(frame);
        const next = starts.find(start => start > family.start);
        if (next !== undefined) expect(frame).toBeLessThan(next);
    }
    expect(commandCursorFamily(-1)).toBeUndefined();
    expect(commandCursorFamily(517)).toBeUndefined();
});
test('HD health uses the original pip-frame thresholds rather than an authored palette', () => {
    expect(nativeHealthPipIndex(100, .5, .25)).toBe(1);
    expect(nativeHealthPipIndex(50, .5, .25)).toBe(2);
    expect(nativeHealthPipIndex(25, .5, .25)).toBe(4);
    expect(nativeHealthPipIndex(1, .5, .25)).toBe(4);
});
test('result themes distinguish five edition/faction cases including the darker YR Soviet grade', () => {
    expect(scoreTheme('ra2', SideType.GDI)).toBe('ra2-allied');
    expect(scoreTheme('yr', SideType.GDI)).toBe('yr-allied');
    expect(scoreTheme('ra2', SideType.Nod)).toBe('ra2-soviet');
    expect(scoreTheme('yr', SideType.Nod)).toBe('yr-soviet');
    expect(scoreTheme('yr', SideType.ThirdSide)).toBe('yr-yuri');
});
