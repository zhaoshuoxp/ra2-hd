import { test, expect } from 'bun:test';
import { Terrain } from '../../src/game/map/Terrain';
import { Graph } from '../../src/util/Graph';
import { SpeedType } from '../../src/game/type/SpeedType';

function fixture(withReachableFallback: boolean) {
    const tile = (rx: number, ry: number) => ({ rx, ry, z: 0, id: `${rx}_${ry}` });
    const start = tile(0, 0), target = tile(10, 10), blocked = tile(11, 11), reachable = tile(10, 11);
    const graph = new Graph<any>();
    const a = graph.addNode(start.id, { tile: start });
    if (withReachableFallback) a.addLink(graph.addNode(reachable.id, { tile: reachable }));
    // A temporarily unlabelled start and a missing node both return undefined
    // from the island lookup. Only graph membership proves a candidate exists.
    const terrain: any = Object.create(Terrain.prototype);
    terrain.computePassabilityGraph = () => graph;
    terrain.exactIslandGraphs = new WeakSet();
    terrain.tiles = { getByMapCoords: (x: number, y: number) => [blocked, reachable].find(t => t.rx === x && t.ry === y) };
    terrain.mapBounds = { isWithinBounds: () => true };
    return { terrain, graph, start, target, reachable };
}
test('blocked fallback candidates cannot escape the current terrain graph', () => {
    const { terrain, start, target, reachable, graph } = fixture(true);
    const route = terrain.computePath(SpeedType.Track, false, start, false, target, false);
    expect(route.map((n: any) => n.tile.id)).toEqual([reachable.id, start.id]);
    expect(graph.getNodeCount()).toBe(2);
});
test('an unreachable destination fails without inventing passable terrain', () => {
    const { terrain, start, target, graph } = fixture(false);
    expect(terrain.computePath(SpeedType.Track, false, start, false, target, false)).toEqual([]);
    expect(graph.getNodeCount()).toBe(1);
});
