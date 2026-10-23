import { NotifyTick } from './interface/NotifyTick';
import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { BuildStatus } from '../Building';
export class PoweredUnitTrait {
    private online = true;
    [NotifyTick.onTick](unit: any, game: any): void {
        const online = [...unit.owner.buildings].some((b: any) => b.rules.powersUnit === unit.name && b.buildStatus === BuildStatus.Ready && b.isSpawned && !b.isDestroyed &&
            !b.warpedOutTrait.isActive() && (!b.poweredTrait || b.poweredTrait.isPoweredOn()));
        if (online !== this.online) {
            this.online = online;
            const disabled = !online || !!unit.magneticLiftTrait?.isActive();
            unit.moveTrait.setDisabled(disabled);
            unit.attackTrait.setDisabled(disabled);
            if (!online) { unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); }
            const sound = online ? unit.rules.activateSound : unit.rules.deactivateSound;
            if (sound) game.events.dispatch(new TriggerSoundFxEvent(sound, unit.tile));
        }
        if (!online && !unit.onBridge && !unit.magneticLiftTrait?.isActive() && game.map.getTileZone(unit.tile) === 2) {
            game.destroyObject(unit, { player: unit.owner });
        }
    }
    isOnline(): boolean { return this.online; }
    getHash(): number { return Number(this.online); }
}
