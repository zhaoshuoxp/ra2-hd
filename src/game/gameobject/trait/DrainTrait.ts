import { RangeHelper } from '../unit/RangeHelper';
import { NotifyTick } from './interface/NotifyTick';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifyOrder } from './interface/NotifyOrder';
import { globalRules } from '@/game/rules/globalRules';
import { fnv32a } from '@/util/math';
export class DrainTrait {
    private target?: any;
    private pendingProjectile?: any;
    private pendingTarget?: any;
    private nextPayment = 0;
    private powerOwner?: any;
    private interrupted = false;
    private rangeHelper?: RangeHelper;
    constructor(private disc: any) {}
    getTarget(): any { return this.target; }
    isEngaged(): boolean { return !this.interrupted && !!(this.target || this.pendingTarget); }
    prepare(projectile: any, target: any, game: any): void {
        if (!target?.isBuilding() || !target.rules.drainable || game.areFriendly(target, this.disc)) return;
        if (this.target !== target || this.interrupted) this.stop(game);
        this.pendingProjectile = projectile;
        this.pendingTarget = target;
        this.interrupted = false;
    }
    start(target: any, game: any, projectile?: any): void {
        // A late projectile must never revive a canceled or superseded order.
        if (projectile && (this.pendingProjectile !== projectile || this.pendingTarget !== target ||
            !this.canContinue(target, game))) return;
        this.pendingProjectile = undefined;
        this.pendingTarget = undefined;
        if (!target.isBuilding() || !target.rules.drainable || game.areFriendly(target, this.disc)) return;
        if (this.target === target) return;
        this.stop(game);
        this.target = target;
        this.interrupted = false;
        target.drainedBy ??= new Set();
        target.drainedBy.add(this.disc);
        this.nextPayment = game.currentTick + globalRules(game.rules).getNumber('DrainMoneyFrameDelay');
        if (target.rules.power > 0) {
            this.powerOwner = target.owner;
            target.owner.powerTrait.setExternalBlackout(this.disc, true, game);
        }
    }
    stop(game: any): void {
        this.target?.drainedBy?.delete(this.disc);
        this.powerOwner?.powerTrait.setExternalBlackout(this.disc, false, game);
        this.target = undefined;
        this.powerOwner = undefined;
        this.pendingProjectile = undefined;
        this.pendingTarget = undefined;
    }
    private canContinue(target: any, game: any): boolean {
        const disc = this.disc;
        const current = disc.attackTrait?.currentTarget?.obj;
        this.rangeHelper ??= new RangeHelper(game.map.tileOccupation);
        const drain = disc.armedTrait.getWeapons().find((w: any) => w.rules.drainWeapon);
        return disc.isSpawned && !disc.isDestroyed && target.isSpawned && !target.isDestroyed &&
            !game.areFriendly(target, disc) && !!drain &&
            this.rangeHelper.isInWeaponRange(disc, target, drain, game.rules) && !this.interrupted &&
            (!current || current === target) && !disc.warpedOutTrait.isActive();
    }
    [NotifyTick.onTick](disc: any, game: any): void {
        const target = this.target ?? this.pendingTarget;
        if (!target) return;
        if (!this.canContinue(target, game) || (!this.target && !this.pendingProjectile?.isSpawned)) {
            this.stop(game);
            return;
        }
        if (!this.target) return;
        if (this.powerOwner && this.powerOwner !== target.owner) {
            this.powerOwner.powerTrait.setExternalBlackout(disc, false, game);
            this.powerOwner = target.owner;
            this.powerOwner.powerTrait.setExternalBlackout(disc, true, game);
        }
        if (target.rules.refinery && game.currentTick >= this.nextPayment) {
            const settings = globalRules(game.rules);
            this.nextPayment = game.currentTick + settings.getNumber('DrainMoneyFrameDelay');
            const credits = Math.min(target.owner.credits, settings.getNumber('DrainMoneyAmount'));
            target.owner.credits -= credits;
            disc.owner.credits += credits;
        }
    }
    [NotifyUnspawn.onUnspawn](_object: any, game: any): void { this.stop(game); }
    [NotifyOrder.onPush](_unit: any, _type: any, queued: boolean): void {
        if (!queued) {
            this.interrupted = true;
            this.pendingProjectile = undefined;
            this.pendingTarget = undefined;
        }
    }
    [NotifyOwnerChange.onChange](_object: any, _old: any, game: any): void { this.stop(game); }
    getHash(): number { return fnv32a([this.target?.id ?? 0, this.nextPayment, Number(this.interrupted),
        this.pendingProjectile?.id ?? 0, this.pendingTarget?.id ?? 0]); }
}
