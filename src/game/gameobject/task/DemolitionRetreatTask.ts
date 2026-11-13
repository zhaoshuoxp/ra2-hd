import { Task } from './system/Task';
import { MoveTask } from './move/MoveTask';
import { MoveOutsideTask } from './move/MoveOutsideTask';
import { RadialTileFinder } from '../../map/tileFinder/RadialTileFinder';

export function demolitionRetreatEnabled(game: any): boolean {
    return (game.gameOpts?.campaign ?? game.gameOpts)?.demolitionSafetyVersion === 1;
}

// A real retreat order follows planting, including naval sabotage. It uses
// normal terrain/path checks, including the normal building-exit phase.
export class DemolitionRetreatTask extends Task {
    readonly demolitionRetreat = true;
    constructor(private game: any, private target: any) { super(); }
    onStart(unit: any): void {
        const map = this.game.map, origin = this.target.tile;
        const foundation = this.target.getFoundation(), ignoredBlockers = [this.target];
        const distance = (tile: any) => Math.hypot(
            Math.max(origin.rx - tile.rx, 0, tile.rx - origin.rx - foundation.width + 1),
            Math.max(origin.ry - tile.ry, 0, tile.ry - origin.ry - foundation.height + 1));
        const finder = new RadialTileFinder(map.tiles, map.mapBounds, unit.tile, { width: 1, height: 1 }, 1, 5,
            tile => distance(tile) >= 3 && map.terrain.getPassableSpeed(tile, unit.rules.speedType, true, false, ignoredBlockers) > 0
                && !map.terrain.findObstacles({ tile, onBridge: undefined }, unit).some((o: any) => o.obj !== this.target));
        const candidates: any[] = [];
        for (let tile = finder.getNextTile(); tile; tile = finder.getNextTile()) candidates.push(tile);
        candidates.sort((a, b) => Math.hypot(a.rx - unit.tile.rx, a.ry - unit.tile.ry)
            - Math.hypot(b.rx - unit.tile.rx, b.ry - unit.tile.ry) || a.rx - b.rx || a.ry - b.ry);
        for (const tile of candidates.slice(0, 12)) {
            const path = map.terrain.computePath(unit.rules.speedType, true, unit.tile, !!unit.onBridge, tile, false,
                { bestEffort: false, ignoredBlockers, maxExpandedNodes: 256 });
            if (!path.some((node: any) => node.tile === tile)) continue;
            this.children.push(this.target.isBuilding() ? new MoveOutsideTask(this.game, this.target, tile)
                : new MoveTask(this.game, tile, false, { strictCloseEnough: true, closeEnoughTiles: 0 }));
            return;
        }
        if (this.target.isBuilding()) this.children.push(new MoveOutsideTask(this.game, this.target));
    }
    onTick(): boolean { return true; }
}
