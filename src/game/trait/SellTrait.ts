import { ObjectSellEvent } from '../event/ObjectSellEvent';
import { NotifySell } from '../gameobject/trait/interface/NotifySell';
import { BuildStatus } from '../gameobject/Building';
export class SellTrait {
    private game: any;
    private generalRules: any;
    constructor(game: any, generalRules: any) {
        this.game = game;
        this.generalRules = generalRules;
    }
    sell(target: any): void {
        if (!target.isBuilding() || !target.rules.unsellable) {
            let refundValue = this.computeRefundValue(target);
            if (refundValue) {
                if (target.rules.wall) {
                    refundValue = 0;
                }
                target.traits
                    .filter(NotifySell)
                    .forEach((trait: any) => {
                    trait[NotifySell.onSell](target, this.game);
                });
                if (target.isBuilding()) {
                    this.game
                        .getConstructionWorker(target.owner)
                        .unplace(target, () => this.afterObjectUnspawned(target, refundValue));
                }
                else {
                    this.game.unspawnObject(target);
                    this.afterObjectUnspawned(target, refundValue);
                }
            }
        }
    }
    private afterObjectUnspawned(target: any, refundValue: number): void {
        target.owner.credits += refundValue;
        this.game.events.dispatch(new ObjectSellEvent(target));
        target.dispose();
    }
    private computeRefundValue(target: any): number {
        let refundValue = 0;
        if (target.rules.soylent > 0) {
            refundValue = target.rules.soylent;
        }
        else if (target.rules.cost) {
            refundValue = target.purchaseValue;
            if (!target.owner.isAi) {
                refundValue = Math.floor(refundValue * this.generalRules.refundPercent);
            }
        }
        return refundValue;
    }
    computePurchaseValue(target: any, player: any): number {
        const queue = player.production?.getQueueTypeForObject(target);
        let multiplier = player.handicap?.cost ?? 1;
        for (const building of player.buildings ?? []) {
            if (building.rules.factoryPlant && building.isSpawned && !building.isDestroyed &&
                building.buildStatus === BuildStatus.Ready && !building.warpedOutTrait.isActive() &&
                (!building.poweredTrait || building.poweredTrait.isPoweredOn())) {
                multiplier *= building.rules.productionCostBonuses[queue] ?? 1;
            }
        }
        return Math.floor(target.cost * multiplier);
    }
    dispose(): void {
        this.game = undefined;
    }
}
