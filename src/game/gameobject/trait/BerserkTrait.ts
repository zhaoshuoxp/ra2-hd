import { NotifyTick } from './interface/NotifyTick';
import { fnv32a } from '@/util/math';
export class BerserkTrait {
    private expires = 0;
    constructor(private unit: any) {}
    isActive(): boolean { return this.expires > 0; }
    apply(duration: number, game: any): void {
        if (duration <= 0 || this.unit.rules.immuneToPsionics || this.unit.invulnerableTrait.isActive()) return;
        this.expires = Math.max(this.expires, game.currentTick + Math.ceil(duration));
        this.unit.unitOrderTrait.clearOrders();
        this.unit.unitOrderTrait.cancelAllTasks();
        this.unit.attackTrait?.expirePassiveScanCooldown();
    }
    [NotifyTick.onTick](unit: any, game: any): void {
        if (this.expires && game.currentTick >= this.expires) {
            this.expires = 0;
            unit.unitOrderTrait.cancelAllTasks();
            unit.attackTrait?.cancelOpportunityFire();
        }
    }
    getHash(): number { return fnv32a([this.expires]); }
}
