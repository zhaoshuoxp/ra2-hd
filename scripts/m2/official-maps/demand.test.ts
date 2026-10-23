import { expect, test } from 'bun:test';
import { environmentMapDemand } from '../../../src/engine/renderable/builder/environmentMapDemand';
import { sharedYuriUnitHdIdentity } from '../../../src/engine/renderable/builder/sharedYuriUnitHd';
import { ObjectType } from '../../../src/engine/type/ObjectType';

test('map demand includes native explosion decals without loading unrelated tile animations', () => {
    const rules = new Map([['CRATER01', { crater: true }], ['BURNT01', { burn: true }], ['INERT', {}]]);
    const game = { getWorld: () => ({ getAllObjects: () => [{ name: 'CAOILD' }] }),
        map: { tiles: { getAll: () => [{ tileNum: 1, subTile: 0 }, { tileNum: 2, subTile: 1 }] } },
        rules: { getIni: () => ({ getSection: () => ({ entries: new Map([...rules.keys()].map((name, i) => [i, name])) }) }),
            hasObject: (name: string, type: ObjectType) => type === ObjectType.Smudge && rules.has(name),
            getObject: (name: string) => rules.get(name) } };
    const theater = { tileSets: { getTile: (tile: number) => ({ getAnimation: () =>
        ({ name: tile === 1 ? 'WATERFALL' : 'UNPLACED_PHASE', subTile: 0 }) }) } };
    expect([...environmentMapDemand(game, theater)].sort()).toEqual(['BURNT01', 'CAOILD', 'CRATER01', 'WATERFALL']);
});

test('Yuri dog aliases borrow the accepted family only for the native member and edition', () => {
    for (const [identity, member, parent] of [['YDOG', 'dog.shp', 'DOG'], ['YADOG', 'adog.shp', 'ADOG']]) {
        expect(sharedYuriUnitHdIdentity(identity, { filename: member }, 'yr')).toBe(parent);
        expect(sharedYuriUnitHdIdentity(identity, { filename: member }, 'ra2')).toBe(identity);
        expect(sharedYuriUnitHdIdentity(identity, { filename: 'unrelated.shp' }, 'yr')).toBe(identity);
    }
});
