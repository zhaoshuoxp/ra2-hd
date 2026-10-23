import { NotifyTick } from './interface/NotifyTick';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifyDestroy } from './interface/NotifyDestroy';
import { ObjectType } from '@/engine/type/ObjectType';
import { ZoneType } from '../unit/ZoneType';
import { Coords } from '@/game/Coords';
import { Vector2 } from '@/game/math/Vector2';
import { FacingUtil } from '../unit/FacingUtil';
import { ParadropEffect } from '@/game/superweapon/ParadropEffect';
import { AttackTask } from '../task/AttackTask';
import { MoveTask } from '../task/move/MoveTask';
import { TaskGroup } from '../task/system/TaskGroup';
import { CallbackTask } from '../task/system/CallbackTask';
import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { globalRules } from '@/game/rules/globalRules';
import { fnv32a } from '@/util/math';
export class AirstrikeTrait {
    private planes: any[] = [];
    private readyAt = 0;
    private target?: any;
    constructor(private spotter: any) {}
    getTarget(): any {
        return this.planes.length && !this.spotter.moveTrait.isMoving() && !this.target?.isDestroyed &&
            this.spotter.attackTrait.currentTarget?.obj === this.target ? this.target : undefined;
    }
    start(target: any, game: any): void {
        if (!target?.isBuilding() || target.isDestroyed || this.planes.length || game.currentTick < this.readyAt) return;
        this.target = target;
        const elite = this.spotter.veteranTrait?.isElite(), rules = this.spotter.rules;
        const type = elite ? rules.eliteAirstrikeTeamType : rules.airstrikeTeamType;
        const count = elite ? rules.eliteAirstrikeTeam : rules.airstrikeTeam;
        const path = new ParadropEffect(0, this.spotter.owner, target.tile, undefined, 0);
        const size = game.map.tiles.getMapSize();
        const { fromTile, toTile } = path.computeFlightPath(new Vector2(target.tile.rx, target.tile.ry), new Vector2(Math.floor(size.width / 2), 0), game);
        for (let i = 0; i < count; i++) {
            const plane = game.createUnitForPlayer(game.rules.getObject(type, ObjectType.Aircraft), this.spotter.owner);
            plane.zone = ZoneType.Air;
            plane.position.tileElevation = Coords.worldToTileHeight(plane.rules.flightLevel ?? game.rules.general.flightLevel);
            plane.direction = FacingUtil.fromMapCoords(new Vector2(toTile.rx - fromTile.rx, toTile.ry - fromTile.ry));
            game.spawnObject(plane, fromTile);
            if (elite) plane.armedTrait.toggleEliteWeapons(true);
            const attack = new AttackTask(game, game.createTarget(target, target.tile), plane.primaryWeapon);
            plane.unitOrderTrait.addTask(new TaskGroup(attack,
                new MoveTask(game, toTile, false, { allowOutOfBoundsTarget: true }),
                new CallbackTask(() => { game.unspawnObject(plane); plane.dispose(); })).setCancellable(false));
            this.planes.push({ plane, attack });
        }
        game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('AirstrikeAttackVoice'), target.tile));
    }
    [NotifyTick.onTick](spotter: any, game: any): void {
        if (!this.planes.length) return;
        if (spotter.moveTrait.isMoving() || spotter.attackTrait?.currentTarget?.obj !== this.target || this.target?.isDestroyed) {
            for (const { attack } of this.planes) attack.cancel();
        }
        this.planes = this.planes.filter(({ plane }) => plane.isSpawned && !plane.isDestroyed);
        if (!this.planes.length) {
            this.readyAt = game.currentTick + (spotter.veteranTrait?.isElite() ? spotter.rules.eliteAirstrikeRechargeTime : spotter.rules.airstrikeRechargeTime);
            this.target = undefined;
        }
    }
    getHash(): number { return fnv32a([this.readyAt, this.target?.id ?? 0, ...this.planes.map(p => p.plane.id)]); }
    private abort(): void { for (const { attack } of this.planes) attack.cancel(); }
    [NotifyDestroy.onDestroy](): void { this.abort(); }
    [NotifyUnspawn.onUnspawn](): void { this.abort(); }
    [NotifyOwnerChange.onChange](): void { this.abort(); }
}
