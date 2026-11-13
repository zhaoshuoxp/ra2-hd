import { EnterBuildingTask } from '../gameobject/task/EnterBuildingTask';
import { BuildStatus } from '../gameobject/Building';
import { UnitRecycleEvent } from '../event/UnitRecycleEvent';
import { MovementZone } from '../type/MovementZone';
import { LocomotorType } from '../type/LocomotorType';

// YR team actions60/62 permit allied facilities. The ordinary player-order
// restrictions and older campaign policies stay unchanged.
export class CampaignEnterBuildingTask extends EnterBuildingTask {
    constructor(game: any, target: any, private mode: 'grinder' | 'reactor') { super(game, target); }
    protected isAllowed(unit: any): boolean {
        const building = this.target;
        if (building.isDestroyed || building.buildStatus !== BuildStatus.Ready || !this.game.areFriendly(unit, building)) return false;
        if (this.mode === 'reactor') return unit.isInfantry() && !!building.absorberTrait
            && building.absorberTrait.units.length < building.rules.passengers;
        return building.rules.grinding && unit.rules.movementZone !== MovementZone.Fly
            && unit.rules.locomotor !== LocomotorType.Chrono && !unit.rules.engineer && this.game.sellTrait.computeRefundValue(unit) > 0;
    }
    protected onEnter(unit: any): void {
        if (this.mode === 'reactor') this.target.absorberTrait.enter(unit, this.game);
        else { this.game.sellTrait.sell(unit); this.game.events.dispatch(new UnitRecycleEvent(unit, this.target)); }
    }
}
