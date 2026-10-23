export class DrainAnimationPlugin {
    private manager?: any;
    private animation?: any;
    constructor(private unit: any, private animationName: string) {}
    onCreate(manager: any): void { this.manager = manager; }
    update(): void {
        if (!this.manager || this.unit.isDestroyed || this.unit.warpedOutTrait.isActive() || !this.unit.drainTrait.getTarget()) {
            this.clear();
            return;
        }
        if (!this.animation) {
            this.animation = this.manager.createTransientAnim(this.animationName, (anim: any) => {
                anim.setPosition(this.unit.position.worldPosition);
                anim.create3DObject();
            });
        }
        this.animation.setPosition(this.unit.position.worldPosition);
        this.manager.getRenderableContainer().updateChild(this.animation);
    }
    private clear(): void {
        this.animation?.remove();
        this.animation?.dispose();
        this.animation = undefined;
    }
    onRemove(): void { this.clear(); this.manager = undefined; }
    dispose(): void { this.clear(); }
}
