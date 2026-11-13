import { Task } from '../gameobject/task/system/Task';
import { EvacuateTransportTask } from '../gameobject/task/EvacuateTransportTask';
import { MoveTask } from '../gameobject/task/move/MoveTask';
import { WaitMinutesTask } from '../gameobject/task/system/WaitMinutesTask';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';

// Scripted deliveries wait for a usable exit and approach a nearby free coast.
// Emergency evacuation's destructive fallback is reserved for dying transports.
export class CampaignUnloadTask extends Task {
    constructor(private readonly game: any) {
        super();
        // Locomotors inspect the root task, not the evacuation child. A source
        // hover transport must be able to descend before passengers can leave.
        if ((game.gameOpts?.campaign?.semanticsVersion ?? 0) >= 19) this.preventLanding = false;
    }
    onStart(): void { this.children.push(new EvacuateTransportTask(this.game, true)); }
    onTick(transport: any): boolean {
        if (this.isCancelling() || !transport.transportTrait.units.length) return true;
        const evacuation = new EvacuateTransportTask(this.game, true), map = this.game.map;
        if (!evacuation.canUnloadFrom(transport)) {
            const target = new RadialTileFinder(map.tiles, map.mapBounds, transport.tile, { width: 1, height: 1 }, 1, 6,
                tile => map.terrain.getPassableSpeed(tile, transport.rules.speedType, false, transport.onBridge) > 0
                    && !map.terrain.findObstacles({ tile, onBridge: transport.onBridge }, transport).length
                    && evacuation.canUnloadFrom({ tile, direction: transport.direction, onBridge: transport.onBridge,
                        transportTrait: transport.transportTrait } as any)).getNextTile();
            if (!target) { this.children.push(new WaitMinutesTask(1 / 60)); return false; }
            this.children.push(new MoveTask(this.game, target, transport.onBridge, { closeEnoughTiles: 0 }));
        }
        this.children.push(evacuation);
        return false;
    }
}
