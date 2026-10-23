import { expect, test } from 'bun:test';
import { Terrain } from '../../src/game/map/Terrain';
import { TileDirection } from '../../src/game/map/TileCollection';
import { SpeedType } from '../../src/game/type/SpeedType';

// Grid terrain whose passability comes from a mutable blocker map, driving the
// real graph, incremental update and island code of Terrain.
function grid(size: number, reuseExactIslands: boolean) {
    const tiles: any[] = [];
    for (let ry = 0; ry < size; ry++) for (let rx = 0; rx < size; rx++) tiles.push({ rx, ry, z: 0, id: `${rx}_${ry}` });
    const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size ? tiles[y * size + x] : undefined);
    const offsets: Record<number, [number, number]> = {
        [TileDirection.Bottom]: [1, 1], [TileDirection.Top]: [-1, -1], [TileDirection.Left]: [-1, 1], [TileDirection.Right]: [1, -1],
        [TileDirection.BottomLeft]: [0, 1], [TileDirection.BottomRight]: [1, 0], [TileDirection.TopLeft]: [-1, 0], [TileDirection.TopRight]: [0, -1],
    };
    const blockers = new Map<string, object>();
    const terrain: any = Object.create(Terrain.prototype);
    Object.assign(terrain, {
        passabilityGraphs: new Map(),
        invalidatedTiles: new Map(),
        // Disabled reuse reproduces the previous always-recompute behaviour.
        exactIslandGraphs: reuseExactIslands ? new WeakSet() : { has: () => false, add() {}, delete() {} },
        tiles: {
            forEach: (fn: (t: any) => void) => tiles.forEach(fn),
            getByMapCoords: at,
            getNeighbourTile: (t: any, d: TileDirection) => at(t.rx + offsets[d][0], t.ry + offsets[d][1]),
        },
        mapBounds: { isWithinBounds: () => true },
        tileOccupation: { getBridgeOnTile: () => undefined, calculateTilesForGameObject: (_: any, b: any) => b.tiles },
        getPassableSpeed: (tile: any, _s: any, _o: any, bridgeLevel: boolean, ignored: object[] = []) => {
            const blocker = blockers.get(tile.id);
            return bridgeLevel || (blocker && !ignored.includes(blocker)) ? 0 : 1;
        },
    });
    let recomputes = 0;
    const compute = terrain.computeIslandIds;
    terrain.computeIslandIds = function (graph: any) { recomputes++; return compute.call(this, graph); };
    terrain.computePassabilityGraph(SpeedType.Track, false);
    return {
        terrain, tiles, at, blockers,
        recomputes: () => recomputes,
        // Occupation update for these tiles (blocker state already applied).
        invalidate: (changed: any[]) => terrain.invalidateTiles(changed),
        // Island IDs only ever feed equality checks; compare them as a relation.
        islands: () => {
            const graph = terrain.computePassabilityGraph(SpeedType.Track, false);
            const names = new Map<number | undefined, string>();
            return tiles.map(t => {
                const node = graph.getNode(t.id);
                if (!node) return '-';
                const id = node.data.islandId;
                if (id === undefined) return '?';
                if (!names.has(id)) names.set(id, 'i' + names.size);
                return names.get(id)!;
            }).join(' ');
        },
        path: (from: any, to: any, ignoredBlockers: object[] = [], bestEffort = true) =>
            terrain.computePath(SpeedType.Track, false, from, false, to, false, { ignoredBlockers, bestEffort }).map((n: any) => n.tile.id).join(' '),
    };
}

function fromScratch(size: number, blocked: Map<string, object>) {
    const g = grid(size, false);
    blocked.forEach((b, id) => g.blockers.set(id, b));
    g.terrain.passabilityGraphs.clear();
    return g.islands();
}

test('a wall that splits the map and its removal that merges it are both detected', () => {
    const g = grid(6, true);
    const wall = [0, 1, 2, 3, 4, 5].map(y => g.at(2, y));
    expect(new Set(g.islands().split(' ')).size).toBe(1);
    // Partial wall: still one component.
    wall.slice(0, 5).forEach(t => g.blockers.set(t.id, {}));
    g.invalidate(wall.slice(0, 5));
    expect(g.islands()).toBe(fromScratch(6, g.blockers));
    // Closing the wall splits left from right.
    g.blockers.set(wall[5].id, {});
    g.invalidate([wall[5]]);
    const split = g.islands();
    expect(split).toBe(fromScratch(6, g.blockers));
    expect(split.split(' ')[0]).not.toBe(split.split(' ')[5]);
    // Opening one tile merges them again.
    g.blockers.delete(wall[3].id);
    g.invalidate([wall[3]]);
    const merged = g.islands();
    expect(merged).toBe(fromScratch(6, g.blockers));
    expect(merged.split(' ')[0]).toBe(merged.split(' ')[5]);
});

test('occupation updates that keep nodes and links reuse the exact island IDs', () => {
    const g = grid(8, true);
    const before = g.recomputes();
    // E.g. ore harvested or a non-blocking overlay changed: same passability.
    g.invalidate([g.at(3, 3), g.at(4, 4), g.at(7, 0)]);
    expect(g.islands()).toBe(fromScratch(8, g.blockers));
    expect(g.recomputes()).toBe(before);
    g.blockers.set(g.at(3, 3).id, {});
    g.invalidate([g.at(3, 3)]);
    expect(g.islands()).toBe(fromScratch(8, g.blockers));
    expect(g.recomputes()).toBe(before + 1);
});

test('random splits, merges and temporary path edits match the always-recompute behaviour', () => {
    const size = 10;
    let seed = 12345;
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const fast = grid(size, true), slow = grid(size, false);
    for (let step = 0; step < 400; step++) {
        const op = rand(4);
        if (op < 2) {
            // Toggle a small cluster of tiles, sometimes without any change.
            const changed: any[] = [];
            const x = rand(size), y = rand(size), block = rand(3);
            for (let i = 0; i < 1 + rand(3); i++) {
                const t = fast.at(Math.min(size - 1, x + i), y);
                changed.push(t);
                for (const g of [fast, slow]) {
                    if (block === 0) g.blockers.delete(t.id);
                    else if (block === 1) g.blockers.set(t.id, fast.blockers.get(t.id) ?? { id: t.id });
                }
            }
            // Both copies share blocker identities so ignored blockers agree.
            slow.blockers.clear(); fast.blockers.forEach((b, id) => slow.blockers.set(id, b));
            fast.invalidate(changed.map(t => fast.at(t.rx, t.ry)));
            slow.invalidate(changed.map(t => slow.at(t.rx, t.ry)));
        }
        else {
            const [ax, ay, bx, by] = [rand(size), rand(size), rand(size), rand(size)];
            const blocker = op === 3 ? fast.blockers.get(fast.at(ax, ay).id) : undefined;
            const ignore = (g: typeof fast) => blocker ? [Object.assign(blocker, { tiles: [g.at(ax, ay)] })] : [];
            expect(fast.path(fast.at(ax, ay), fast.at(bx, by), ignore(fast)))
                .toBe(slow.path(slow.at(ax, ay), slow.at(bx, by), ignore(slow)));
        }
        const islands = fast.islands();
        expect(islands).toBe(slow.islands());
    }
    expect(fast.recomputes()).toBeLessThan(slow.recomputes());
});

test('a path search that relabels an existing end node forces the next recompute', () => {
    const fast = grid(6, true), slow = grid(6, false);
    for (const g of [fast, slow]) {
        g.blockers.set(g.at(0, 0).id, {});
        g.invalidate([g.at(0, 0)]);
        g.islands();
        // Not yet invalidated: the end node exists but its tile reads impassable,
        // so the search re-adds the node without an island ID.
        g.blockers.set(g.at(4, 4).id, {});
        g.path(g.at(0, 0), g.at(4, 4), [], false);
        g.invalidate([g.at(2, 1)]);
    }
    expect(fast.islands()).toBe(slow.islands());
    expect(fast.islands()).not.toContain('?');
});
