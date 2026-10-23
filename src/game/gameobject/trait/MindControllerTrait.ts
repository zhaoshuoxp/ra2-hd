import { globalRules } from '@/game/rules/globalRules';
import { NotifyUnspawn } from './interface/NotifyUnspawn';
import { NotifyDestroy } from './interface/NotifyDestroy';
import { NotifyOwnerChange } from './interface/NotifyOwnerChange';
import { NotifyTick } from './interface/NotifyTick';
import { fnv32a } from '@/util/math';

export class MindControllerTrait {
    private targets: any[] = [];
    private overloadTicks = 0;
    constructor(private gameObject: any, private maxCapacity = 1, private infinite = false) { }
    isActive(): boolean { return this.targets.length > 0; }
    isAtCapacity(): boolean { return !this.infinite && this.targets.length >= this.maxCapacity; }
    getTargets(): any[] { return this.targets; }
    control(target: any, world: any): void {
        if (!this.gameObject || target.isDisposed || target.isDestroyed || !target.mindControllableTrait) return;
        if (target.mindControllableTrait.isActive() || this.targets.includes(target)) return;
        // Retail multi-slot towers refuse new targets when full. A single-slot
        // Yuri can explicitly replace its victim; Masterminds may overload.
        if (this.maxCapacity > 1 && this.isAtCapacity()) return;
        while (!this.infinite && this.targets.length >= this.maxCapacity) {
            this.targets[0].mindControllableTrait.restore(world);
        }
        target.mindControllableTrait.controlBy(this.gameObject, world);
        this.targets.push(target);
    }
    cleanTarget(target: any): void {
        const index = this.targets.indexOf(target);
        if (index !== -1) this.targets.splice(index, 1);
    }
    private releaseAll(world: any): void {
        for (const target of [...this.targets]) target.mindControllableTrait.restore(world);
        this.targets.length = 0;
        this.overloadTicks = 0;
    }
    [NotifyUnspawn.onUnspawn](_object: any, world: any): void { this.releaseAll(world); }
    [NotifyDestroy.onDestroy](_object: any, world: any): void { this.releaseAll(world); }
    [NotifyOwnerChange.onChange](_object: any, _previousOwner: any, world: any): void { this.releaseAll(world); }
    [NotifyTick.onTick](object: any, world: any): void {
        if (object.poweredTrait && !object.poweredTrait.isPoweredOn()) {
            this.releaseAll(world);
            return;
        }
        if (!this.infinite) return;
        const general = globalRules(world.rules);
        const counts = general.getNumberArray('OverloadCount');
        const damage = general.getNumberArray('OverloadDamage');
        const frames = general.getNumberArray('OverloadFrames');
        let index = counts.findIndex((count: number) => this.targets.length <= count);
        if (index < 0) index = counts.length - 1;
        if (!damage[index] || object.invulnerableTrait.isActive()) { this.overloadTicks = 0; return; }
        if (++this.overloadTicks >= frames[index]) {
            this.overloadTicks = 0;
            const source = { obj: object, player: object.owner };
            object.healthTrait.inflictDamage(damage[index], source, world);
            if (!object.healthTrait.health) world.destroyObject(object, source);
        }
    }
    getHash(): number { return fnv32a([this.targets.length, this.overloadTicks, ...this.targets.map(t => t.id)]); }
    dispose(): void { this.gameObject = undefined; }
}
