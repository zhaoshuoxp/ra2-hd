import { NotifyTick } from './interface/NotifyTick';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { Coords } from '@/game/Coords';
import { ZoneType } from '../unit/ZoneType';
import { globalRules } from '@/game/rules/globalRules';
import { fnv32a } from '@/util/math';

// Victim-owned state continues to tick after the beam owner disappears, so an
// interrupted lift falls and restores movement instead of leaving a stuck unit.
export class MagneticLiftTrait {
    private controller?: any;
    private weapon?: any;
    private sourceOwner?: any;
    private falling = false;
    private fallSpeed = 0;
    private attackDisabled = false;
    private moveDisabled = false;
    constructor(private unit: any) {}
    isActive(): boolean { return !!this.controller || this.falling; }
    getController(): any { return this.controller; }
    lift(controller: any, weapon: any, game: any): void {
        if (this.isActive() || this.unit.isDestroyed || this.unit.bunker || this.unit.invulnerableTrait.isActive()) return;
        this.controller = controller;
        this.weapon = weapon;
        this.sourceOwner = controller.owner;
        this.attackDisabled = this.unit.attackTrait?.isDisabled() ?? false;
        this.moveDisabled = this.unit.moveTrait.isDisabled();
        this.unit.unitOrderTrait.clearOrders();
        this.unit.unitOrderTrait.cancelAllTasks();
        this.unit.moveTrait.setDisabled(true);
        this.unit.attackTrait?.setDisabled(true);
        this.unit.zone = ZoneType.Air;
        this.unit.onBridge = false;
    }
    release(): void {
        if (!this.controller) return;
        this.controller = undefined;
        this.falling = true;
        this.fallSpeed = 0;
    }
    [NotifyTick.onTick](unit: any, game: any): void {
        if (!this.isActive() || unit.isDestroyed) return;
        const oldTile = unit.tile, oldElevation = unit.tileElevation;
        if (this.controller) {
            const source = this.controller, target = source.attackTrait?.currentTarget;
            const distance = Math.hypot(unit.tile.rx - source.tile.rx, unit.tile.ry - source.tile.ry);
            if (!source.isSpawned || source.isDestroyed || source.warpedOutTrait.isActive() ||
                source.owner !== this.sourceOwner || target?.obj !== unit || distance < this.weapon.minRange || distance > this.weapon.range) {
                this.release();
            } else {
                const jump = game.rules.getIni().getSection('JumpjetControls');
                const cruise = jump.getNumber('CruiseHeight');
                const height = Coords.tileHeightToWorld(unit.tileElevation);
                const rise = Math.min(jump.getNumber('Climb'), Math.max(0, cruise - height));
                unit.position.tileElevation += Coords.worldToTileHeight(rise);
                if (height >= cruise) {
                    const from = unit.position.getMapPosition(), to = source.position.getMapPosition();
                    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
                    const step = Math.min(jump.getNumber('Speed'), length);
                    if (length) unit.position.moveByLeptons(dx / length * step, dy / length * step);
                }
            }
        }
        if (this.falling) {
            this.fallSpeed += globalRules(game.rules).getNumber('Gravity', 6);
            const bridge = game.map.tileOccupation.getBridgeOnTile(unit.tile);
            const floor = bridge?.tileElevation ?? 0;
            unit.position.tileElevation = Math.max(floor, unit.tileElevation - Coords.worldToTileHeight(this.fallSpeed));
            if (unit.tileElevation <= floor) this.land(game, bridge);
        }
        if (!unit.isDestroyed) {
            if (oldTile !== unit.tile) unit.moveTrait.handleTileChange(oldTile, undefined, false, game);
            if (oldElevation !== unit.tileElevation) unit.moveTrait.handleElevationChange(oldElevation, game);
        }
    }
    private land(game: any, bridge: any): void {
        const unit = this.unit;
        this.falling = false;
        unit.zone = bridge ? ZoneType.Ground : game.map.getTileZone(unit.tile);
        unit.onBridge = !!bridge;
        unit.moveTrait.setDisabled(this.moveDisabled || unit.poweredUnitTrait?.isOnline() === false);
        unit.attackTrait?.setDisabled(this.attackDisabled || unit.poweredUnitTrait?.isOnline() === false);
        const source = { player: this.sourceOwner, weapon: this.weapon };
        const general = globalRules(game.rules);
        const obstacles = game.map.getGroundObjectsOnTile(unit.tile).filter((o: any) => o !== unit && o.isTechno() && !o.isDestroyed);
        const strength = general.getBool('CurrentStrengthDamage') ? unit.healthTrait.getHitPoints() : unit.healthTrait.maxHitPoints;
        for (const object of obstacles) {
            if (object.invulnerableTrait.isActive()) continue;
            object.healthTrait.inflictDamage(Math.floor(strength * general.getNumber('FallingDamageMultiplier', 1)), source, game);
            if (!object.healthTrait.health) game.destroyObject(object, source);
        }
        if (obstacles.length || game.map.terrain.getPassableSpeed(unit.tile, unit.rules.speedType, false, !!bridge) <= 0) game.destroyObject(unit, source);
        this.weapon = undefined;
    }
    [NotifyUnspawn.onUnspawn](): void { this.controller = undefined; this.falling = false; }
    getHash(): number { return fnv32a([this.controller?.id ?? 0, Number(this.falling), this.fallSpeed]); }
}
