import { FacingUtil } from '@/game/gameobject/unit/FacingUtil';
import { NotifyTick } from './interface/NotifyTick';
import { NotifySpawn } from './interface/NotifySpawn';
export class TurretTrait {
    static readonly SPIN_STEP = 360 / 32;
    private facing: number = 0;
    private desiredFacing: number = 0;
    isRotating(): boolean {
        return this.facing !== this.desiredFacing;
    }
    [NotifySpawn.onSpawn](target: any): void {
        if (target.isUnit()) {
            this.facing = this.desiredFacing = target.direction;
        }
    }
    [NotifyTick.onTick](gameObject: any): void {
        if (gameObject.rules.turretSpins) {
            // Continuous idle spin is separate from the fast target-turn ROT.
            this.facing = (this.facing + TurretTrait.SPIN_STEP) % 360;
            this.desiredFacing = this.facing;
            return;
        }
        if (this.desiredFacing !== this.facing) {
            const rotationSpeed = gameObject.rules.rot;
            this.facing = FacingUtil.tick(this.facing, this.desiredFacing, rotationSpeed || Number.POSITIVE_INFINITY).facing;
        }
    }
}
