import { Timer } from '@/game/gameobject/unit/Timer';
import { NotifyTick } from './interface/NotifyTick';
import { GameObject } from '@/game/gameobject/GameObject';
import { World } from '@/game/World';
export class InvulnerableTrait {
    private timer: Timer;
    private forceShield = false;
    constructor() {
        this.timer = new Timer();
    }
    isActive(): boolean {
        return this.timer.isActive();
    }
    isForceShield(): boolean { return this.isActive() && this.forceShield; }
    setActiveFor(duration: number, tick: number, forceShield = false): void {
        this.forceShield = forceShield;
        this.timer.setActiveFor(duration, tick);
    }
    getHash(): number { return this.timer.getTicksLeft() * 2 + Number(this.forceShield); }
    [NotifyTick.onTick](gameObject: GameObject, world: World): void {
        this.timer.tick(world.currentTick);
    }
}
