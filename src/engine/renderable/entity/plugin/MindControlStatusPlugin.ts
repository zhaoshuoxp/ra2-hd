import * as THREE from 'three';
import { mindControlSource } from './mindControlSource';

// The victim's persistent retail marker is independent of selected control links.
export class MindControlStatusPlugin {
    private manager?: any;
    private animation?: any;
    private animationName?: string;
    constructor(private unit: any, private controlledAnimation: string,
                private permanentAnimation: string, private camera: THREE.Camera,
                private viewer: any, private alliances: any) {}
    onCreate(manager: any): void { this.manager = manager; }
    update(): void {
        const trait = this.unit.mindControllableTrait;
        const viewer = this.viewer && 'value' in this.viewer ? this.viewer.value : this.viewer;
        const hiddenCloak = this.unit.cloakableTrait?.isCloaked() && viewer &&
            !this.alliances.haveSharedIntel(viewer, this.unit.owner);
        if (!this.manager || !trait?.isActive() || this.unit.isSpawned === false ||
            this.unit.isDestroyed || this.unit.isCrashing || this.unit.warpedOutTrait?.isActive() || hiddenCloak) {
            this.clear();
            return;
        }
        const name = trait.getController() ? this.controlledAnimation : this.permanentAnimation;
        if (!name) { this.clear(); return; }
        if (name !== this.animationName) this.clear();
        const renderable = this.manager.getRenderableByGameObject(this.unit);
        const position = mindControlSource(this.unit, renderable, this.camera);
        if (!this.animation) {
            this.animation = this.manager.createTransientAnim(name, (anim: any) => {
                anim.setPosition(position);
                anim.create3DObject();
            });
            this.animationName = name;
        }
        this.animation.setPosition(position);
        this.manager.getRenderableContainer().updateChild(this.animation);
    }
    private clear(): void {
        this.animation?.remove();
        this.animation?.dispose();
        this.animation = undefined;
        this.animationName = undefined;
    }
    onRemove(): void { this.clear(); this.manager = undefined; }
    dispose(): void { this.clear(); }
}
