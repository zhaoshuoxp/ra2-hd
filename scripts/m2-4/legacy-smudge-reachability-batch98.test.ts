import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { AnimTerrainEffect } from '../../src/game/gameobject/common/AnimTerrainEffect';
import { LandType } from '../../src/game/type/LandType';
import { isGeneratedGroundSmudge } from '../../src/offline/smudgeDependency';

const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const audit = JSON.parse(readFileSync(`${root}/original-sequences-and-smudges-v1.json`, 'utf8'));
const legacy = audit.smudges.filter((rule: any) => !isGeneratedGroundSmudge(rule));

test('the 22 declared legacy names retain their identity without receiving generated-art credit', () => {
    expect(legacy.map((rule: any) => rule.id)).toEqual([
        ...Array.from({ length: 6 }, (_, n) => `CR${n + 1}`),
        ...Array.from({ length: 16 }, (_, n) => `BURN${String(n + 1).padStart(2, '0')}`),
    ]);
    const old = JSON.parse(readFileSync('.artifacts/m2-4/newurban-remaining-actors-batch97-20261021/inventory-newurban-v1/inventory.json', 'utf8'));
    const rows = old.rows.filter((row: any) => row.kind === 'smudge' && legacy.some((rule: any) => rule.id === row.id));
    expect(rows.length).toBe(22);
    for (const row of rows) {
        expect(row.nativeRules.Crater).toBeUndefined();
        expect(row.nativeRules.Burn).toBeUndefined();
        expect(Object.keys(row.usage).length).toBe(8);
        for (const usage of Object.values<any>(row.usage)) expect(usage.count).toBe(0);
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
