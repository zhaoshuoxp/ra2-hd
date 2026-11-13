// Initial scenario ships may sit outside LocalSize but inside the full source
// map. Find a physical water path to its first playable cell, without changing
// placements or admitting off-map cells to the ordinary cached terrain graph.
export function findCampaignNavalEntry(map: any, unit: any, destination: any): any[] | undefined {
    if (!unit.rules.naval || map.mapBounds.isWithinBounds(unit.tile)) return;
    const parents = new Map<any, any>([[unit.tile, undefined]]), queue = [unit.tile];
    const passable = (tile: any) => map.terrain.getPassableSpeed(tile, unit.rules.speedType, unit.isInfantry(), false, [], false, true) > 0;
    if (!passable(unit.tile)) return;
    for (let index = 0; index < queue.length; index++) {
        const tile = queue[index];
        if (map.mapBounds.isWithinBounds(tile)) {
            const path = [tile];
            for (let previous = parents.get(tile); previous; previous = parents.get(previous)) path.push(previous);
            return path;
        }
        const neighbors = map.tiles.getAllNeighbourTiles(tile).sort((a: any, b: any) =>
            Math.hypot(a.rx - destination.rx, a.ry - destination.ry) - Math.hypot(b.rx - destination.rx, b.ry - destination.ry));
        for (const neighbor of neighbors) if (!parents.has(neighbor) && Math.abs(tile.z - neighbor.z) <= 1 && passable(neighbor)) {
            parents.set(neighbor, tile); queue.push(neighbor);
        }
    }
}
