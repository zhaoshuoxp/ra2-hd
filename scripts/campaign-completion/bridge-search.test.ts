import { expect, test } from 'bun:test';
import { DirectionalTileFinder } from '../../src/game/map/tileFinder/DirectionalTileFinder';
import { Bridges } from '../../src/game/map/Bridges';

test('zero interior distance terminates before querying beyond adjacent original bridge heads', () => {
    const start: any = { rx: 82, ry: 99 }, end: any = { rx: 83, ry: 99 };
    const tiles: any = { getByMapCoords() { throw Error('An empty bridge interior has no tiles'); } };
    const bounds: any = { isWithinBounds: () => true };
    const finder = new DirectionalTileFinder(tiles, bounds, start, 1, 0, 1, 0);
    expect(finder.getNextTile()).toBeUndefined(); expect(finder.getNextTile()).toBeUndefined();
    const bridges = new Bridges({} as any, tiles, { onChange: { subscribe() {} } } as any, bounds, {} as any);
    const spec: any = { start, end, isHigh: true, type: 1 };
    expect(bridges.findBridgePieces(spec)).toEqual([]);
    expect(bridges.findAllBridgeTiles(spec)).toEqual([]);
    expect(bridges.findDestroyedPieceTiles(spec)).toEqual([]);
    expect(bridges.canBeRepaired(spec)).toBe(false);
});

test('bounded directional searches retain inclusive endpoints, holes and exhausted state', () => {
    const queried: number[] = [];
    const tiles: any = { getByMapCoords(rx: number, ry: number) { queried.push(rx); return rx === 3 ? undefined : { rx, ry }; } };
    const finder = new DirectionalTileFinder(tiles, {} as any, { rx: 1, ry: 2 } as any, 1, 3, 1, 0,
        tile => tile.rx > 1, false);
    expect(finder.getNextTile()).toEqual({ rx: 2, ry: 2 });
    expect(finder.getNextTile()).toEqual({ rx: 4, ry: 2 });
    expect(finder.getNextTile()).toBeUndefined(); expect(finder.getNextTile()).toBeUndefined();
    expect(queried).toEqual([2, 3, 4]);
});
