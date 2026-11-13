import { NotifyTick } from './interface/NotifyTick';
import { AttackTask } from '../task/AttackTask';
import { GameObject } from '@/game/gameobject/GameObject';
import { canCampaignChargeTarget } from '../../campaign/CampaignChargedWeapon';
export class OverpoweredTrait {
    private obj: GameObject;
    private chargers: Set<GameObject>;
    constructor(obj: GameObject) {
        this.obj = obj;
        this.chargers = new Set();
    }
    isOverpowered(): boolean {
        let requiredChargers = 1;
        if (!this.obj?.poweredTrait?.isPoweredOn(true)) {
            requiredChargers += 2;
        }
        return this.chargers.size >= requiredChargers;
    }
    hasChargersToPowerOn(): boolean {
        return this.chargers.size >= 2;
    }
    getChargeCount(): number { return this.chargers.size; }
    chargeFrom(charger: GameObject): void {
        this.chargers.add(charger);
        this.swapAttackTaskWeapon();
    }
    [NotifyTick.onTick](gameObject: GameObject, game?: any): void {
        if (this.chargers.size > 0) {
            let needsUpdate = false;
            this.chargers.forEach((charger) => {
                if (charger.isDestroyed ||
                    charger.isCrashing ||
                    charger.owner !== gameObject.owner && !canCampaignChargeTarget(charger, gameObject, game) ||
                    charger.attackTrait?.currentTarget?.obj !== gameObject) {
                    this.chargers.delete(charger);
                    needsUpdate = true;
                }
            });
            if (needsUpdate) {
                this.swapAttackTaskWeapon();
            }
        }
    }
    private swapAttackTaskWeapon(): void {
        const currentTask = this.obj?.unitOrderTrait.getCurrentTask();
        if (currentTask instanceof AttackTask) {
            const weapon = this.getWeapon();
            if (weapon) {
                currentTask.setWeapon(weapon);
            }
            else {
                currentTask.cancel();
            }
        }
    }
    private getWeapon(): any {
        return this.isOverpowered()
            ? this.obj?.secondaryWeapon
                ?? ((this.obj?.owner?.campaignSemanticsVersion ?? 0) >= 7 ? this.obj?.primaryWeapon : undefined)
            : this.obj?.primaryWeapon;
    }
    dispose(): void {
        this.obj = undefined as any;
        this.chargers.clear();
    }
}
