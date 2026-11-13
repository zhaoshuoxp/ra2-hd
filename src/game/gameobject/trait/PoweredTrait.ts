import { PowerLevel } from '@/game/player/trait/PowerTrait';
import { GameObject } from '@/game/gameobject/GameObject';
export class PoweredTrait {
    private obj: GameObject;
    private turnedOn: boolean;
    constructor(obj: GameObject) {
        this.obj = obj;
        this.turnedOn = true;
    }
    setTurnedOn(turnedOn: boolean): void {
        this.turnedOn = turnedOn;
    }
    isCharged(): boolean {
        return (!!this.obj.isBuilding() &&
            !!this.obj.overpoweredTrait?.hasChargersToPowerOn());
    }
    isPoweredOn(checkCharged: boolean = false): boolean {
        if ((this.obj as any).drainedBy?.size) return false;
        // Original campaign buildings can start switched off yet receive real
        // ElectricAssault charge. The strict query still excludes that supply.
        if (!checkCharged && (this.obj?.owner?.campaignSemanticsVersion ?? 0) >= 7 && this.isCharged()) return true;
        return (!(!this.obj || !this.turnedOn) &&
            (!(checkCharged || !this.isCharged()) ||
                (!this.obj.rules.power && this.obj.rules.needsEngineer
                    ? !this.obj.owner.isNeutral
                    : !!this.obj.owner.powerTrait &&
                        this.obj.owner.powerTrait?.level !== PowerLevel.Low)));
    }
    dispose(): void {
        this.obj = undefined;
    }
}
