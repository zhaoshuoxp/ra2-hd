import { GameSpeed } from '@/game/GameSpeed';
import { NotifyTick } from './interface/NotifyTick';

/** Native gate phases advance on simulation ticks, independently of rendering. */
export class GateTrait {
    private progress = 0;
    private holdTicks = 0;
    private readonly deployTicks: number;
    private readonly closeDelayTicks: number;

    constructor(public readonly stages: number, deployTime: number, closeDelay: number) {
        this.deployTicks = Math.max(1, Math.round(deployTime * 60 * GameSpeed.BASE_TICKS_PER_SECOND));
        this.closeDelayTicks = Math.max(0, Math.round(closeDelay * 60 * GameSpeed.BASE_TICKS_PER_SECOND));
    }

    get frame(): number {
        return Math.floor(this.progress * this.stages / this.deployTicks);
    }

    get passable(): boolean {
        return this.progress === this.deployTicks;
    }

    [NotifyTick.onTick](gate: any, game: any): void {
        if (gate.isDestroyed || !gate.isSpawned || gate.buildStatus !== 1) return;
        const { width, height } = gate.art.foundation;
        let friendlyNearby = false, occupied = false;
        for (let x = -1; x <= width; x++) {
            for (let y = -1; y <= height; y++) {
                const tile = game.map.tiles.getByMapCoords(gate.tile.rx + x, gate.tile.ry + y);
                if (!tile) continue;
                for (const unit of game.map.getGroundObjectsOnTile(tile)) {
                    if (!unit.isUnit() || !unit.isSpawned || unit.isDestroyed || unit.onBridge) continue;
                    friendlyNearby ||= game.areFriendly(gate, unit);
                    occupied ||= x >= 0 && x < width && y >= 0 && y < height;
                }
            }
        }
        if (friendlyNearby || occupied) {
            this.holdTicks = this.closeDelayTicks;
            this.progress = Math.min(this.deployTicks, this.progress + 1);
        } else if (this.holdTicks > 0) {
            this.holdTicks--;
        } else {
            this.progress = Math.max(0, this.progress - 1);
        }
    }
}
