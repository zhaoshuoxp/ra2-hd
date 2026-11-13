import { Coords } from '@/game/Coords';
import { BlobShadow } from '../unit/BlobShadow';

// This plugin is dormant for ordinary vehicles, including accepted HD poses.
// Its animation follows rendered position only and never advances simulation.
export class VehicleParachutePlugin {
    private manager?: any;
    private animation?: any;
    private shadow?: BlobShadow;
    private descending = false;
    constructor(private readonly unit: any, private readonly renderable: any,
        private readonly animationName: string, private readonly meshInstancing: boolean) {}
    onCreate(manager: any): void { this.manager = manager; }
    update(time: number): void {
        const descending = !!this.unit.campaignParadropping && !this.unit.isDestroyed;
        const parent = this.renderable.posObj;
        if (!this.manager || !parent) return;
        if (descending && !this.descending) {
            this.animation = this.manager.createAnim(this.animationName, undefined, true);
            this.animation.remapColor(this.unit.owner.color);
            this.animation.create3DObject();
            const object = this.animation.get3DObject();
            object.position.y = Coords.tileHeightToWorld(1);
            object.updateMatrix(); parent.add(object);
            this.shadow = new BlobShadow(this.unit, 5, this.meshInstancing);
            this.shadow.create3DObject(); parent.add(this.shadow.get3DObject());
        } else if (!descending && this.descending) {
            this.animation?.endAnimationLoop();
            if (this.shadow) { parent.remove(this.shadow.get3DObject()); this.shadow.dispose(); this.shadow = undefined; }
        }
        this.descending = descending;
        this.shadow?.update(time, 0);
        if (this.animation) {
            this.animation.update(time);
            if (this.animation.isAnimFinished()) this.clearAnimation();
        }
    }
    private clearAnimation(): void {
        if (!this.animation) return;
        this.renderable.posObj?.remove(this.animation.get3DObject());
        this.animation.dispose(); this.animation = undefined;
    }
    onRemove(): void { this.dispose(); this.manager = undefined; }
    dispose(): void {
        this.clearAnimation();
        if (this.shadow) {
            this.renderable.posObj?.remove(this.shadow.get3DObject());
            this.shadow.dispose(); this.shadow = undefined;
        }
        this.descending = false;
    }
}
