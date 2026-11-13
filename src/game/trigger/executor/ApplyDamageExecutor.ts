import { Coords } from '@/game/Coords';
import { CollisionType } from '@/game/gameobject/unit/CollisionType';
import { Warhead } from '@/game/Warhead';
import { TriggerExecutor } from '@/game/trigger/TriggerExecutor';
export class ApplyDamageExecutor extends TriggerExecutor {
    private damage: number;
    constructor(action: any, trigger: any, damage: number) {
        super(action, trigger);
        this.damage = damage;
    }
    execute(context: any): void {
        const waypoint = Number(this.action.params[1]);
        const tile = context.map.getTileAtWaypoint(waypoint);
        if (tile) {
            const warheadRule = context.rules.getWarhead(Warhead.HE_WARHEAD_NAME);
            const warhead = new Warhead(warheadRule);
            const bridge = context.map.tileOccupation.getBridgeOnTile(tile);
            const elevation = bridge?.tileElevation ?? 0;
            const zone = context.map.getTileZone(tile);
            const center = Coords.tile3dToWorld(tile.rx + 0.5, tile.ry + 0.5, tile.z + elevation);
            // Retail action 63 applies five HE bursts, then explicitly collapses
            // a bridge at the waypoint even when ordinary bridge damage is off.
            const offset = Math.floor(Coords.LEPTONS_PER_TILE / 3);
            for (const [x, y] of [[0, 0], [offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset]]) {
                const position = center.clone(); position.x += x; position.z += y;
                warhead.detonate(context, this.damage, tile, elevation, position, zone,
                    bridge ? CollisionType.OnBridge : CollisionType.None, context.createTarget(bridge, tile), undefined, false, undefined);
            }
            if (bridge?.isSpawned && !bridge.isDestroyed) context.destroyObject(bridge);
        }
        else {
            if (context.campaign) throw new Error(`Missing damage waypoint: ${waypoint}`);
            console.warn(`No valid location found for waypoint ${waypoint}. ` +
                `Skipping action ${this.getDebugName()}.`);
        }
    }
}
