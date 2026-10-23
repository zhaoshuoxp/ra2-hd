import { BuildStatus } from '../Building';
import { NotifyDestroy } from './interface/NotifyDestroy';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifySell } from './interface/NotifySell';
import { RadialTileFinder } from '@/game/map/tileFinder/RadialTileFinder';
import { ScatterTask } from '../task/ScatterTask';
import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { globalRules } from '@/game/rules/globalRules';
import { fnv32a } from '@/util/math';
export class AbsorberTrait {
    readonly units: any[] = [];
    constructor(private building: any) {}
    canEnter(unit: any): boolean {
        return this.building.buildStatus === BuildStatus.Ready && !this.building.isDestroyed && unit.isInfantry() && unit.owner === this.building.owner && this.units.length < this.building.rules.passengers;
    }
    enter(unit: any, game: any): void {
        unit.absorbedBy = this.building;
        game.limboObject(unit, { selected: false });
        this.units.push(unit);
        this.building.owner.powerTrait.updateFrom(this.building, 'update', game);
        game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('EnterBioReactorSound'), this.building.tile));
    }
    getExtraPower(): number { return this.units.length * this.building.rules.extraPower; }
    evacuate(game: any): void {
        for (const unit of [...this.units]) {
            const b = this.building;
            const finder = new RadialTileFinder(game.map.tiles, game.map.mapBounds, b.tile, b.art.foundation, 1, 3,
                t => game.map.terrain.getPassableSpeed(t, unit.rules.speedType, true, false) > 0 && !game.map.terrain.findObstacles({ tile: t, onBridge: false }, unit).length);
            const tile = finder.getNextTile();
            if (!tile) continue;
            this.units.splice(this.units.indexOf(unit), 1);
            unit.absorbedBy = undefined;
            unit.position.tileElevation = 0;
            game.unlimboObject(unit, tile);
            unit.unitOrderTrait.addTask(new ScatterTask(game));
        }
        this.building.owner.powerTrait.updateFrom(this.building, 'update', game);
        game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('LeaveBioReactorSound'), this.building.tile));
    }
    [NotifyDestroy.onDestroy](_object: any, game: any, source: any): void {
        // The retail manual specifies evacuation when the reactor is destroyed.
        this.evacuate(game);
        for (const unit of this.units) game.destroyObject(unit, source, true);
        this.units.length = 0;
    }
    [NotifyOwnerChange.onChange](building: any, _old: any, game: any): void {
        for (const unit of this.units) game.changeObjectOwner(unit, building.owner);
    }
    [NotifySell.onSell](_building: any, game: any): void {
        this.evacuate(game);
        // A sold reactor cannot retain passengers when every exit is obstructed.
        for (const unit of this.units) game.destroyObject(unit, { player: this.building.owner }, true);
        this.units.length = 0;
    }
    getHash(): number { return fnv32a(this.units.map(u => u.getHash())); }
}
