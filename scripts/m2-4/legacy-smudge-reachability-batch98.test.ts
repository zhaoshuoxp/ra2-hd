import { retailIni } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { AnimTerrainEffect } from '../../src/game/gameobject/common/AnimTerrainEffect';
import { LandType } from '../../src/game/type/LandType';
import { isGeneratedGroundSmudge } from '../../src/offline/smudgeDependency';

const ini = retailIni('yr');
const audit = { smudges: [...ini.getSection('SmudgeTypes')!.entries.values()].map(id => {
    const section = ini.getOrCreateSection(String(id));
    return { id: String(id), crater: section.getBool('Crater'), burn: section.getBool('Burn'),
        width: section.getNumber('Width', 1), height: section.getNumber('Height', 1) };
}) };
const legacy = audit.smudges.filter((rule: any) => !isGeneratedGroundSmudge(rule));

test('the 22 declared legacy names retain their identity without receiving generated-art credit', () => {
    expect(legacy.map((rule: any) => rule.id)).toEqual([
        ...Array.from({ length: 6 }, (_, n) => `CR${n + 1}`),
        ...Array.from({ length: 16 }, (_, n) => `BURN${String(n + 1).padStart(2, '0')}`),
    ]);
    for (const row of legacy) {
        expect(row.crater).toBe(false); expect(row.burn).toBe(false);
    }
});

for (const [scorch, big] of [[false, false], [false, true], [true, false], [true, true]]) {
    test(`native effect selection excludes legacy names: scorch=${scorch}, big=${big}`, () => {
        const rules = audit.smudges.map((rule: any) => ({ ...rule, name: rule.id }));
        const size = big ? 2 : 1;
        const expected = rules.filter((rule: any) => rule.crater && rule.width === size && rule.height === size
            || scorch && rule.burn).map((rule: any) => rule.name);
        const selected: string[] = [];
        const effect = new AnimTerrainEffect();
        const tile = { landType: LandType.Clear, rampType: 0 };
        for (let choice = 0; choice < expected.length; choice++) {
            const game = {
                art: { hasObject: () => true, getAnimation: () => ({ crater: true, forceBigCraters: big, scorch }) },
                rules: { smudgeRules: new Map(rules.map((rule: any) => [rule.name, rule])) },
                map: { mapBounds: { isWithinBounds: () => true }, getObjectsOnTile: () => [],
                    tiles: { getNeighbourTile: () => tile } },
                generateRandomInt: (low: number, high: number) => { expect(high).toBe(expected.length - 1); return choice; },
                createObject: (_type: number, name: string) => ({ name }),
                spawnObject: (object: { name: string }) => selected.push(object.name),
            };
            effect.spawnSmudges('EXPLOSION', tile, game);
        }
        expect(selected).toEqual(expected);
        expect(selected.length).toBeGreaterThan(0);
        expect(selected.every(name => !legacy.some((rule: any) => rule.id === name))).toBe(true);
    });
}

test('an effective override enabling either flag is a real generated dependency', () => {
    expect(isGeneratedGroundSmudge({})).toBe(false);
    expect(isGeneratedGroundSmudge({ crater: true })).toBe(true);
    expect(isGeneratedGroundSmudge({ burn: true })).toBe(true);
});
