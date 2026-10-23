import { InfDeathType } from '@/game/gameobject/infantry/InfDeathType';
import { globalRules } from '@/game/rules/globalRules';
import { SuperWeaponEffect } from './SuperWeaponEffect';
import { RadialTileFinder } from '@/game/map/tileFinder/RadialTileFinder';
import { ObjectType } from '@/engine/type/ObjectType';
import { ZoneType } from '@/game/gameobject/unit/ZoneType';
import { Coords } from '@/game/Coords';
import { Warhead } from '@/game/Warhead';
import { CollisionType } from '@/game/gameobject/unit/CollisionType';
import { Vector2 } from '@/game/math/Vector2';
import { ParadropEffect } from './ParadropEffect';
import { MoveTask } from '@/game/gameobject/task/move/MoveTask';
import { TaskGroup } from '@/game/gameobject/task/system/TaskGroup';
import { CallbackTask } from '@/game/gameobject/task/system/CallbackTask';
import { FacingUtil } from '@/game/gameobject/unit/FacingUtil';
import { UnlandableTrait } from '@/game/gameobject/trait/UnlandableTrait';
import { TriggerAnimEvent } from '@/game/event/TriggerAnimEvent';
import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { GameSpeed } from '@/game/GameSpeed';

function groundTargets(game: any, center: any, radius: number): any[] {
    const found = new Set<any>();
    const finder = new RadialTileFinder(game.map.tiles, game.map.mapBounds, center, { width: 1, height: 1 }, 0, radius, () => true);
    let tile;
    while ((tile = finder.getNextTile())) {
        for (const object of game.map.getGroundObjectsOnTile(tile)) {
            if (object.isTechno() && object.isSpawned && !object.isDestroyed && !object.warpedOutTrait.isActive()) found.add(object);
        }
    }
    return [...found];
}
export class PsychicRevealEffect extends SuperWeaponEffect {
    onStart(game: any): void {
        const radius = globalRules(game.rules).getNumber('PsychicRevealRadius');
        for (const player of [this.owner, ...game.alliances.getAllies(this.owner)]) game.mapShroudTrait.getPlayerShroud(player)?.revealAround(this.tile, radius);
    }
}
export class ForceShieldEffect extends SuperWeaponEffect {
    private fadeAt = 0;
    private endsAt = 0;
    private faded = false;
    onStart(game: any): void {
        const general = globalRules(game.rules);
        this.endsAt = game.currentTick + general.getNumber('ForceShieldDuration');
        this.fadeAt = this.endsAt - general.getNumber('ForceShieldPlayFadeSoundTime');
        game.events.dispatch(new TriggerAnimEvent(general.getString('ForceShieldInvokeAnim'), this.tile));
        game.events.dispatch(new TriggerSoundFxEvent('ForceShieldStarting', this.tile));
        for (const object of groundTargets(game, this.tile, general.getNumber('ForceShieldRadius'))) {
            if (!object.isBuilding() || !(object.owner === this.owner || game.alliances.areAllied(object.owner, this.owner))) continue;
            object.invulnerableTrait.setActiveFor(general.getNumber('ForceShieldDuration'), game.currentTick, true);
        }
        this.owner.powerTrait.setBlackoutFor(Math.max(this.owner.powerTrait.getBlackoutDuration(), general.getNumber('ForceShieldBlackoutDuration')), game);
    }
    onTick(game: any): boolean {
        if (!this.faded && game.currentTick >= this.fadeAt) {
            this.faded = true;
            game.events.dispatch(new TriggerSoundFxEvent('ForceShieldFading', this.tile));
        }
        return game.currentTick >= this.endsAt;
    }
}
export class GeneticConverterEffect extends SuperWeaponEffect {
    private pending: { tile: any; onBridge: boolean; elevation: number; subCell: any; name: string }[] = [];
    private spawnAt = 0;
    onStart(game: any): void {
        const general = globalRules(game.rules);
        const warhead = game.rules.getWarhead(general.getString(general.getBool('MutateExplosion') ? 'MutateExplosionWarhead' : 'MutateWarhead'));
        const radius = warhead.cellSpread || 1;
        const animation = game.art.getAnimation(general.getString('InfantryMutate'));
        if (!animation.animationFrameCount) throw new Error('Mutation animation metadata was not loaded');
        this.spawnAt = game.currentTick + Math.ceil(animation.animationFrameCount * GameSpeed.BASE_TICKS_PER_SECOND / (animation.art.getNumber('Rate', 900) / 60));
        const name = general.getArray('AnimToInfantry')[animation.art.getNumber('MakeInfantry', 0)];
        for (const unit of groundTargets(game, this.tile, radius)) {
            const animal = unit.rules.natural || unit.rules.notHuman && unit.rules.organic;
            if ((!unit.isInfantry() && !animal) || unit.rules.immune || unit.invulnerableTrait.isActive() || !warhead.verses.get(unit.rules.armor)) continue;
            const tile = unit.tile, onBridge = unit.onBridge, elevation = unit.tileElevation, subCell = unit.position.subCell;
            unit.infDeathType = InfDeathType.Mutate;
            game.destroyObject(unit, { player: this.owner });
            if (!animal) this.pending.push({ tile, onBridge, elevation, subCell, name });
        }
    }
    onTick(game: any): boolean {
        if (game.currentTick < this.spawnAt) return false;
        for (const pending of this.pending) {
            const brute = game.createUnitForPlayer(game.rules.getObject(pending.name, ObjectType.Infantry), this.owner);
            brute.position.subCell = pending.subCell;
            brute.onBridge = pending.onBridge;
            brute.position.tileElevation = pending.elevation;
            game.spawnObject(brute, pending.tile);
        }
        this.pending = [];
        return true;
    }
}
export class PsychicDominatorEffect extends SuperWeaponEffect {
    private delay = 0;
    onStart(game: any): void {
        const general = globalRules(game.rules);
        const anim = game.art.getAnimation(general.getString('DominatorFirstAnim'));
        if (!anim.animationFrameCount) throw new Error('Dominator animation metadata was not loaded');
        const frames = anim.animationFrameCount - anim.art.getNumber('Start', 0);
        const ticks = frames * GameSpeed.BASE_TICKS_PER_SECOND / (anim.art.getNumber('Rate', 900) / 60);
        this.delay = Math.ceil(ticks * general.getNumber('DominatorFireAtPercentage') / 100);
        game.events.dispatch(new TriggerAnimEvent(general.getString('DominatorFirstAnim'), this.tile));
        game.events.dispatch(new TriggerSoundFxEvent(general.getString('PsychicDominatorActivateSound'), this.tile));
    }
    onTick(game: any): boolean {
        if (this.delay-- > 0) return false;
        const general = globalRules(game.rules);
        const source = { player: this.owner };
        game.events.dispatch(new TriggerAnimEvent(general.getString('DominatorSecondAnim'), this.tile));
        const damage = new Warhead(game.rules.getWarhead(general.getString('DominatorWarhead')));
        damage.detonate(game, general.getNumber('DominatorDamage'), this.tile, 0,
            Coords.tile3dToWorld(this.tile.rx + .5, this.tile.ry + .5, this.tile.z), game.map.getTileZone(this.tile), CollisionType.None,
            game.createTarget(undefined, this.tile), source as any, false, undefined);
        for (const unit of groundTargets(game, this.tile, general.getNumber('DominatorCaptureRange'))) {
            if (!unit.isUnit() || unit.bunker || !unit.mindControllableTrait || unit.rules.immuneToPsionics || unit.invulnerableTrait.isActive()) continue;
            unit.mindControllableTrait.controlPermanently(this.owner, game);
        }
        return true;
    }
}
export class SpyPlaneEffect extends SuperWeaponEffect {
    private plane?: any;
    private nextSnapshot = 0;
    onStart(game: any): void {
        const path = new ParadropEffect(this.type, this.owner, this.tile, undefined, 0);
        const size = game.map.tiles.getMapSize();
        const { fromTile, toTile } = path.computeFlightPath(new Vector2(this.tile.rx, this.tile.ry), new Vector2(Math.floor(size.width / 2), 0), game);
        const plane = this.plane = game.createUnitForPlayer(game.rules.getObject('SPYP', ObjectType.Aircraft), this.owner);
        game.spawnObject(plane, fromTile);
        plane.direction = FacingUtil.fromMapCoords(new Vector2(toTile.rx - fromTile.rx, toTile.ry - fromTile.ry));
        plane.zone = ZoneType.Air;
        plane.position.tileElevation = Coords.worldToTileHeight(plane.rules.flightLevel ?? game.rules.general.flightLevel);
        plane.traits.get(UnlandableTrait)?.setEnabled(false);
        plane.unitOrderTrait.addTask(new TaskGroup(new MoveTask(game, toTile, false, { allowOutOfBoundsTarget: true }),
            new CallbackTask(() => { game.unspawnObject(plane); plane.dispose(); })).setCancellable(false));
    }
    onTick(game: any): boolean {
        if (!this.plane?.isSpawned || this.plane.isDestroyed || this.plane.isCrashing) return true;
        const camera = game.rules.getWeapon('SpyCameraWeapon');
        const radius = camera.range;
        if (game.currentTick >= this.nextSnapshot && Math.hypot(this.plane.tile.rx - this.tile.rx, this.plane.tile.ry - this.tile.ry) <= radius) {
            this.nextSnapshot = game.currentTick + globalRules(game.rules).getNumber('SpyPlaneCameraFrames', 16);
            game.events.dispatch(new TriggerSoundFxEvent(globalRules(game.rules).getString('SpyPlaneCamera'), this.plane.tile));
            for (const player of [this.owner, ...game.alliances.getAllies(this.owner)]) game.mapShroudTrait.getPlayerShroud(player)?.revealAround(this.plane.tile, camera.damage);
        }
        return false;
    }
}
