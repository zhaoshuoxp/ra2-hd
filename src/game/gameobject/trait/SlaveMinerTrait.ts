import { TriggerSoundFxEvent } from '@/game/event/TriggerSoundFxEvent';
import { globalRules } from '@/game/rules/globalRules';
import { fnv32a } from '@/util/math';
import { NotifyTick } from './interface/NotifyTick';
import { NotifyDestroy } from './interface/NotifyDestroy';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { ObjectType } from '@/engine/type/ObjectType';
import { BuildStatus } from '../Building';
import { Infantry } from '../Infantry';
import { TiberiumTrait } from './TiberiumTrait';
import { MoveTask } from '../task/move/MoveTask';
import { DeployIntoTask } from '../task/morph/DeployIntoTask';
import { UndeployIntoTask } from '../task/morph/UndeployIntoTask';
import { RadialTileFinder } from '@/game/map/tileFinder/RadialTileFinder';

interface SlaveSlot {
    unit?: any;
    nextSpawn: number;
    nextHarvest: number;
    cargo: Map<number, number>;
    returning: boolean;
}
export class SlaveMinerTrait {
    private slots: SlaveSlot[];
    private reloadAt = 0;
    private nextScan = 0;
    constructor(private miner: any) {
        this.slots = Array.from({ length: miner.rules.slavesNumber }, () => ({ nextSpawn: 0, nextHarvest: 0, cargo: new Map(), returning: false }));
    }
    detachForMorph(): SlaveSlot[] {
        const slots = this.slots;
        this.slots = [];
        return slots;
    }
    adopt(slots: SlaveSlot[]): void {
        this.slots = slots;
        for (const slot of slots) if (slot.unit) slot.unit.slaveMaster = this.miner;
    }
    releaseSlave(unit: any, world: any): void {
        const slot = this.slots.find(slot => slot.unit === unit);
        if (!slot) return;
        slot.unit = undefined;
        slot.cargo.clear();
        slot.returning = false;
        slot.nextSpawn = world.currentTick + this.miner.rules.slaveRegenRate;
        unit.slaveMaster = undefined;
        unit.slaveWorkState = undefined;
        unit.attackTrait?.setDisabled(false);
        unit.unitOrderTrait.clearOrders();
        unit.unitOrderTrait.cancelAllTasks();
    }
    getSlaves(): any[] { return this.slots.flatMap(s => s.unit && !s.unit.isDestroyed ? [s.unit] : []); }
    getHash(): number {
        return fnv32a([this.reloadAt, this.nextScan, ...this.slots.flatMap(s => [s.unit?.id ?? 0,
            s.nextSpawn, s.nextHarvest, Number(s.returning), ...[...s.cargo].flat()])]);
    }
    private findTile(world: any, center: any, radius: number, predicate: (tile: any) => boolean): any {
        return new RadialTileFinder(world.map.tiles, world.map.mapBounds, center, { width: 1, height: 1 }, 0, radius, predicate).getNextTile();
    }
    private ore(world: any, tile: any): any {
        return world.map.getObjectsOnTile(tile).find((o: any) => o.isOverlay() && o.isTiberium());
    }
    private passable(world: any, unit: any, tile: any): boolean {
        return world.map.terrain.getPassableSpeed(tile, unit.rules.speedType, unit.isInfantry(), false) > 0
            && !world.map.terrain.findObstacles({ tile, onBridge: false }, unit).length;
    }
    [NotifyTick.onTick](miner: any, world: any): void {
        if (miner.isDestroyed || miner.warpedOutTrait.isActive()) return;
        const deployed = miner.isBuilding() && miner.buildStatus === BuildStatus.Ready;
        const tick = world.currentTick;
        for (const slot of this.slots) {
            if (slot.unit?.isDestroyed || slot.unit?.isDisposed) {
                slot.unit = undefined;
                slot.cargo.clear();
                slot.returning = false;
                slot.nextSpawn = tick + miner.rules.slaveRegenRate;
            }
            if (!slot.unit && deployed && tick >= slot.nextSpawn && tick >= this.reloadAt) {
                const unit = world.createUnitForPlayer(world.rules.getObject(miner.rules.enslaves, ObjectType.Infantry), miner.owner);
                const tile = this.findTile(world, miner.tile, 4, t => this.passable(world, unit, t));
                if (!tile) {
                    unit.owner.removeOwnedObject(unit);
                    unit.dispose();
                    slot.nextSpawn = tick + miner.rules.slaveReloadRate;
                    continue;
                }
                slot.unit = unit;
                unit.slaveMaster = miner;
                unit.position.subCell = Infantry.SUB_CELLS[0];
                unit.attackTrait?.setDisabled(true);
                world.spawnObject(unit, tile);
                this.reloadAt = tick + miner.rules.slaveReloadRate;
            }
            if (slot.unit?.isSpawned) this.work(slot, world, deployed);
        }
        if (tick < this.nextScan || !miner.unitOrderTrait.isIdle()) return;
        this.nextScan = tick + globalRules(world.rules).getNumber('SlaveMinerKickFrameDelay', 150);
        const general = globalRules(world.rules);
        const near = this.findTile(world, miner.tile, general.getNumber('SlaveMinerShortScan', 8), t => !!this.ore(world, t));
        if (!deployed && miner.isVehicle()) {
            const canDeploy = world.getConstructionWorker(miner.owner).canPlaceAt(miner.rules.deploysInto, miner.tile, { ignoreAdjacent: true, ignoreObjects: [miner] });
            if (near && canDeploy) miner.unitOrderTrait.addTask(new DeployIntoTask(world));
            else {
                const ore = near ?? this.findTile(world, miner.tile, general.getNumber('SlaveMinerLongScan', 48), t => !!this.ore(world, t) && this.passable(world, miner, t));
                if (ore) {
                    const worker = world.getConstructionWorker(miner.owner);
                    const site = this.findTile(world, ore, general.getNumber('SlaveMinerShortScan', 8), t =>
                        this.passable(world, miner, t) && worker.canPlaceAt(miner.rules.deploysInto, t, { ignoreAdjacent: true, ignoreObjects: [miner] }));
                    if (site) miner.unitOrderTrait.addTask(new MoveTask(world, site, false, { closeEnoughTiles: 0, strictCloseEnough: true }));
                    else if (!near) miner.unitOrderTrait.addTask(new MoveTask(world, ore, false, { closeEnoughTiles: 4 }));
                }
            }
        } else if (deployed && !near && this.slots.every(s => !s.unit || !s.cargo.size)) {
            miner.unitOrderTrait.addTask(new UndeployIntoTask(world));
        }
    }
    private work(slot: SlaveSlot, world: any, deployed: boolean): void {
        const unit = slot.unit, miner = this.miner;
        const count = [...slot.cargo.values()].reduce((a, b) => a + b, 0);
        unit.slaveWorkState = count > 0 ? "carry" : undefined;
        if (!unit.unitOrderTrait.isIdle()) return;
        if (count >= unit.rules.storage || !deployed) slot.returning = true;
        if (slot.returning) {
            const tile = this.findTile(world, miner.tile, 4, t => this.passable(world, unit, t));
            if (!tile) return;
            const distance = Math.hypot(unit.tile.rx - tile.rx, unit.tile.ry - tile.ry);
            if (distance > 1.5) { unit.unitOrderTrait.addTask(new MoveTask(world, tile, false, { closeEnoughTiles: 1 })); return; }
            if (!deployed) return;
            const oreValue = [...slot.cargo].reduce((sum, [type, bails]) => sum + world.rules.getTiberium(type).value * bails, 0);
            const purifiers = [...miner.owner.buildings].filter((b: any) => b.rules.orePurifier && b.isSpawned &&
                b.buildStatus === BuildStatus.Ready && !b.warpedOutTrait.isActive() && (!b.poweredTrait || b.poweredTrait.isPoweredOn())).length;
            miner.owner.credits += oreValue + purifiers * Math.floor(oreValue * world.rules.general.purifierBonus);
            slot.cargo.clear();
            slot.returning = false;
            slot.nextHarvest = world.currentTick + miner.rules.slaveReloadRate;
            return;
        }
        const overlay = this.ore(world, unit.tile);
        if (!overlay) {
            const radius = globalRules(world.rules).getNumber('SlaveMinerSlaveScan', 14);
            const target = this.findTile(world, miner.tile, radius, t => !!this.ore(world, t) && this.passable(world, unit, t));
            if (target) unit.unitOrderTrait.addTask(new MoveTask(world, target, false, { closeEnoughTiles: 0, strictCloseEnough: true }));
            else slot.returning = count > 0;
            return;
        }
        unit.slaveWorkState = "shovel";
        if (world.currentTick < slot.nextHarvest) return;
        const ore = overlay.traits.get(TiberiumTrait), type = ore.collectBail();
        if (!ore.getBailCount()) world.unspawnObject(overlay);
        if (type !== undefined) slot.cargo.set(type, (slot.cargo.get(type) ?? 0) + 1);
        slot.nextHarvest = world.currentTick + unit.rules.harvestRate;
    }
    private release(world: any, owner?: any): void {
        for (const unit of this.getSlaves()) {
            unit.slaveMaster = undefined;
            unit.slaveWorkState = undefined;
            unit.attackTrait?.setDisabled(false);
            unit.unitOrderTrait.clearOrders();
            unit.unitOrderTrait.cancelAllTasks();
            if (owner && owner !== unit.owner) world.changeObjectOwner(unit, owner);
        }
        this.slots = [];
    }
    [NotifyDestroy.onDestroy](_miner: any, world: any, source: any): void {
        if (this.getSlaves().length) world.events.dispatch(new TriggerSoundFxEvent(globalRules(world.rules).getString('SlavesFreeSound'), this.miner.tile));
        this.release(world, source?.player);
    }
    [NotifyUnspawn.onUnspawn](_miner: any, world: any): void { this.release(world); }
    [NotifyOwnerChange.onChange](miner: any, _previous: any, world: any): void {
        for (const slave of this.getSlaves()) world.changeObjectOwner(slave, miner.owner);
    }
}
