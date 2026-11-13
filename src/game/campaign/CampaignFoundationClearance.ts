import { ScatterTask } from '../gameobject/task/ScatterTask';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';

export function findCampaignFoundationExit(game: any, unit: any, foundation: any[]): any {
    if (!foundation.length) return;
    const radius = Math.max(...foundation.map(tile => Math.max(Math.abs(tile.rx - unit.tile.rx),
        Math.abs(tile.ry - unit.tile.ry)))) + 2;
    return new RadialTileFinder(game.map.tiles, game.map.mapBounds, unit.tile, { width: 1, height: 1 }, 1, radius,
        tile => !foundation.includes(tile)
            && game.map.terrain.getPassableSpeed(tile, unit.rules.speedType, unit.isInfantry(), !!unit.onBridge) > 0
            && !game.map.terrain.findObstacles({ tile, onBridge: !!unit.onBridge }, unit).length
            && game.map.terrain.computePath(unit.rules.speedType, unit.isInfantry(), unit.tile, !!unit.onBridge,
                tile, !!unit.onBridge, { bestEffort: false, maxExpandedNodes: 150 })[0]?.tile === tile).getNextTile();
}

export function clearCampaignFoundation(game: any, owner: any, tiles: any[], ignore: any[] = []): void {
    const occupants = new Set<any>(tiles.flatMap(tile => game.map.getGroundObjectsOnTile(tile)));
    for (const unit of occupants) {
        if (ignore.includes(unit) || !unit.isUnit() || !unit.isSpawned || unit.isDestroyed
            || !game.areFriendly({ owner }, unit) || unit.moveTrait.isMoving() || unit.moveTrait.isDisabled()
            || unit.unitOrderTrait.getTasks().some((task: any) => task instanceof ScatterTask)) continue;
        const exit = findCampaignFoundationExit(game, unit, tiles);
        if (!exit) continue;
        // Release the old movement reservation before ordinary scatter begins.
        unit.unitOrderTrait.clearOrders();
        unit.unitOrderTrait.cancelAllTasks();
        unit.unitOrderTrait.addTask(new ScatterTask(game, { tile: exit, toBridge: !!unit.onBridge }, { excludedTiles: tiles }));
    }
}
