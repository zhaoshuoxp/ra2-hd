import { MapLighting } from '@/data/map/MapLighting';
import { GameSpeed } from '@/game/GameSpeed';
import { LightingFx, LightingFxPriority } from './LightingFx';

export class DominatorLightingFx extends LightingFx {
    private original?: MapLighting;
    constructor(private duration: number, private target: MapLighting, private changeRate: number, private step: number) {
        super();
        this.priority = LightingFxPriority.High;
    }
    update(time: number, speed: number): { done: boolean; updated: boolean } {
        this.original ??= new MapLighting().copy(this.mapLighting);
        const elapsed = (time - this.startTime!) / 1000 * speed;
        const interval = Math.max(1 / GameSpeed.BASE_TICKS_PER_SECOND, this.changeRate * 60);
        const fade = Math.max(interval, Math.ceil(Math.abs(this.target.ambient - this.original.ambient) / Math.max(.001, this.step)) * interval);
        const blend = elapsed < this.duration ? Math.min(1, elapsed / fade) : Math.max(0, 1 - (elapsed - this.duration) / fade);
        for (const key of ['ambient', 'red', 'green', 'blue', 'ground', 'level'] as const) {
            this.mapLighting[key] = this.original[key] + (this.target[key] - this.original[key]) * blend;
        }
        this.mapLighting.forceTint = true;
        return { done: elapsed >= this.duration + fade, updated: true };
    }
}
