import { Coords } from '../Coords';
import { Vector3 } from '../math/Vector3';
import { Task } from '../gameobject/task/system/Task';
import { notifyCampaignParadropLanding } from './CampaignLanding';

// Campaign task forces can contain vehicles as well as infantry. Keep the
// original ground zone while descending, as the infantry paradrop task does.
export class CampaignVehicleParadropTask extends Task {
    private attackDisabled = false;
    private started = false;
    constructor(private readonly game: any, unit: any) {
        super(); this.setCancellable(false); this.onStart(unit);
    }
    onStart(unit: any): void {
        if (this.started) return;
        this.started = true;
        unit.campaignParadropping = true;
        this.attackDisabled = unit.attackTrait?.isDisabled() ?? false;
        unit.attackTrait?.setDisabled(true);
    }
    onTick(unit: any): boolean {
        const bridge = unit.tile.onBridgeLandType ? this.game.map.tileOccupation.getBridgeOnTile(unit.tile) : undefined;
        const floor = bridge?.tileElevation ?? 0, elevation = unit.tileElevation;
        const fall = Math.abs(this.game.rules.general.parachuteMaxFallRate);
        if (Coords.tileHeightToWorld(elevation) - fall > Coords.tileHeightToWorld(floor)) {
            unit.position.moveByLeptons3(new Vector3(0, -fall, 0));
            unit.moveTrait.handleElevationChange(elevation, this.game);
            return false;
        }
        unit.position.tileElevation = floor;
        unit.onBridge = !!bridge;
        if (!this.game.map.terrain.getPassableSpeed(unit.tile, unit.rules.speedType, false, unit.onBridge)) {
            this.game.destroyObject(unit, undefined, true);
        }
        else notifyCampaignParadropLanding(this.game, unit);
        return true;
    }
    onEnd(unit: any): void {
        unit.campaignParadropping = false;
        unit.attackTrait?.setDisabled(this.attackDisabled);
    }
}
