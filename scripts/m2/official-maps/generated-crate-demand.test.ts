import { describe, expect, test } from 'bun:test';
import { environmentMapDemand } from '../../../src/engine/renderable/builder/environmentMapDemand';
import { ObjectType } from '../../../src/engine/type/ObjectType';

const fixture = (cratesAppear: boolean) => ({
    gameOpts: { cratesAppear },
    getWorld: () => ({ getAllObjects: () => [{ name: 'TREE01' }] }),
    map: { tiles: { getAll: () => [] } },
    rules: {
        getIni: () => ({ getSection: () => undefined }),
        crateRules: { crateImg: 'CRATE', waterCrateImg: 'WCRATE' },
        hasObject: (name: string, type: ObjectType) => type === ObjectType.Overlay
            && ['CRATE', 'WCRATE'].includes(name),
    },
});

describe('ordinary generated crate dependencies', () => {
    test('admits both native crate sources before their first spawn', () => {
        expect([...environmentMapDemand(fixture(true), {})].sort()).toEqual(['CRATE', 'TREE01', 'WCRATE']);
    });
    test('retains map demand without reserving disabled crate families', () => {
        expect([...environmentMapDemand(fixture(false), {})]).toEqual(['TREE01']);
    });
    test('ignores absent rule sources instead of inventing a crate identity', () => {
        const game = fixture(true);
        game.rules.crateRules.waterCrateImg = 'UNREGISTERED';
        expect([...environmentMapDemand(game, {})].sort()).toEqual(['CRATE', 'TREE01']);
    });
});
