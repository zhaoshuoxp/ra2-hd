import { Task } from './system/Task';
import { MoveTask } from './move/MoveTask';
import { MoveOutsideTask } from './move/MoveOutsideTask';
import { MoveResult } from '../trait/MoveTrait';
import { EnterObjectEvent } from '@/game/event/EnterObjectEvent';
import { Coords } from '@/game/Coords';
import { Vector2 } from '@/game/math/Vector2';
import { TurnTask } from './TurnTask';

export class EnterBunkerTask extends Task {
    public preventOpportunityFire = true;
    private moveStarted = false;
    private clearingFoundation = false;
    private aligning = false;
    constructor(private game: any, public target: any) { super(); }
    onTick(unit: any): boolean {
        if (this.children.length) return false;
        if (this.clearingFoundation || unit.moveTrait.isDisabled()) return true;
        if (this.isCancelling() || this.target.isDestroyed || !this.target.bunkerTrait.canEnter(unit)) {
            return this.clearFoundation(unit);
        }
        if (!this.moveStarted) {
            const tile = this.target.dockTrait.getDockTile(0);
            const dock = this.target.dockTrait.getDockOffset(0);
            const offset = new Vector2(dock.x, dock.z).add(this.target.position.getMapPosition())
                .sub(new Vector2(tile.rx, tile.ry).multiplyScalar(Coords.LEPTONS_PER_TILE));
            this.children.push(new MoveTask(this.game, tile, false, {
                targetOffset: offset, ignoredBlockers: [this.target], strictCloseEnough: true, closeEnoughTiles: 0,
            }));
            this.moveStarted = true;
            return false;
        }
        if (!this.isCancelling() && unit.moveTrait.lastMoveResult === MoveResult.Success) {
            if (!this.aligning) {
                // The native wheel strips run along the map's north/south
                // axis. Arrival direction depends on the path, so finish
                // turning before the walls rise and movement is disabled.
                const facing = unit.direction;
                const distance = (target: number) => Math.abs((facing - target + 540) % 360 - 180);
                const aligned = distance(0) <= distance(180) ? 0 : 180;
                this.aligning = true;
                if (facing !== aligned) {
                    this.children.push(new TurnTask(aligned));
                    return false;
                }
            }
            this.game.events.dispatch(new EnterObjectEvent(this.target, unit));
            this.target.bunkerTrait.enter(unit, this.game);
            return true;
        }
        return this.clearFoundation(unit);
    }
    private clearFoundation(unit: any): boolean {
        if (this.moveStarted && !this.target.isDestroyed &&
            this.game.map.tileOccupation.isTileOccupiedBy(unit.tile, this.target)) {
            this.children.push(new MoveOutsideTask(this.game, this.target));
            this.clearingFoundation = true;
            return false;
        }
        return true;
    }
    getTargetLinesConfig() { return { target: this.target, pathNodes: [] }; }
}
