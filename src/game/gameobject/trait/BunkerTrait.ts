import { NotifyDestroy } from './interface/NotifyDestroy';
import { NotifyTick } from './interface/NotifyTick';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifySell } from './interface/NotifySell';
import { MoveOutsideTask } from '../task/move/MoveOutsideTask';
import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { globalRules } from '@/game/rules/globalRules';
import { BuildStatus } from '../Building';
import { ZoneType } from '../unit/ZoneType';
export class BunkerTrait {
    unit?: any;
    readonly damageMultiplier: number;
    readonly rofMultiplier: number;
    readonly rangeBonus: number;
    constructor(private building: any, rules: any) {
        const settings = globalRules(rules);
        this.damageMultiplier = settings.getNumber('BunkerDamageMultiplier', 1);
        this.rofMultiplier = settings.getNumber('BunkerROFMultiplier', 1);
        this.rangeBonus = settings.getNumber('BunkerWeaponRangeBonus');
    }
    canEnter(unit: any): boolean {
        return !this.unit && this.building.buildStatus === BuildStatus.Ready && unit.owner === this.building.owner &&
            unit.isVehicle() && unit.rules.bunkerable && unit.rules.turret && !unit.rules.organic && !unit.bunker && unit.zone !== ZoneType.Air;
    }
    enter(unit: any, game: any): void {
        this.unit = unit;
        unit.bunker = this.building;
        unit.moveTrait.setDisabled(true);
        game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('BunkerWallsUpSound'), this.building.tile));
    }
    evacuate(game: any): void {
        const unit = this.unit;
        if (!unit) return;
        this.unit = undefined;
        unit.bunker = undefined;
        if (unit.isSpawned && !unit.isDestroyed) {
            unit.moveTrait.setDisabled(unit.poweredUnitTrait?.isOnline() === false);
            unit.unitOrderTrait.cancelAllTasks();
            unit.unitOrderTrait.addTask(new MoveOutsideTask(game, this.building));
        }
        game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('BunkerWallsDownSound'), this.building.tile));
    }
    [NotifyTick.onTick](_building: any, game: any): void {
        if (this.unit && (!this.unit.isSpawned || this.unit.isDestroyed || this.unit.owner !== this.building.owner)) this.evacuate(game);
    }
    [NotifyDestroy.onDestroy](_building: any, game: any): void { this.evacuate(game); }
    [NotifySell.onSell](_building: any, game: any): void { this.evacuate(game); }
    [NotifyOwnerChange.onChange](_building: any, _previous: any, game: any): void { this.evacuate(game); }
    getHash(): number { return this.unit?.id ?? 0; }
}
