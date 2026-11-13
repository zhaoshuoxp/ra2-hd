import { DeployIntoTask } from '../gameobject/task/morph/DeployIntoTask';
import { ObjectType } from '../../engine/type/ObjectType';
import { ScatterTask } from '../gameobject/task/ScatterTask';
import { clearCampaignFoundation } from './CampaignFoundationClearance';
export { findCampaignFoundationExit } from './CampaignFoundationClearance';

// A source deployment mission remains active while passing units temporarily
// occupy its foundation. Placement and morphing still use the normal executor.
export class CampaignDeployIntoTask extends DeployIntoTask {
    onTick(unit: any): boolean {
        if (this.isCancelling()) return true;
        const worker = this.game.getConstructionWorker(unit.owner);
        if (!worker.canPlaceAt(unit.rules.deploysInto, unit.tile, { ignoreAdjacent: true, ignoreObjects: [unit] })) {
            if (unit.owner.isAi) this.clearFoundation(unit, worker);
            return false;
        }
        return super.onTick(unit);
    }

    private clearFoundation(unit: any, worker: any): void {
        const art = this.game.art.getObject(unit.rules.deploysInto, ObjectType.Building);
        const origin = worker.normalizePlacementTileCoords(art, unit.tile), tiles: any[] = [];
        for (let x = 0; x < art.foundation.width; x++) for (let y = 0; y < art.foundation.height; y++) {
            const tile = this.game.map.tiles.getByMapCoords(origin.rx + x, origin.ry + y);
            if (tile) tiles.push(tile);
        }
        if ((this.game.gameOpts?.campaign?.baseActivationVersion ?? 0) >= 2) {
            clearCampaignFoundation(this.game, unit.owner, tiles, [unit]);
            return;
        }
        const occupants = new Set<any>(tiles.flatMap(tile => this.game.map.getGroundObjectsOnTile(tile)));
        for (const other of occupants) {
            if (other === unit || !other.isUnit() || !other.isSpawned || other.isDestroyed
                || !this.game.areFriendly(unit, other) || other.moveTrait.isMoving() || other.moveTrait.isDisabled()
                || other.unitOrderTrait.getTasks().some((task: any) => task instanceof ScatterTask)) continue;
            // End the old movement before starting the scatter movement: a
            // front-inserted move would keep the old path reservation active.
            other.unitOrderTrait.clearOrders();
            other.unitOrderTrait.cancelAllTasks();
            other.unitOrderTrait.addTask(new ScatterTask(this.game, undefined, { excludedTiles: tiles }));
        }
    }
}
