import * as THREE from 'three';
import { MagneticBeamFx } from '../../fx/MagneticBeamFx';
import { magneticFoot, magneticMuzzle } from './magneticBeamAttachments';

// A locomotor beam follows the live victim throughout lifting and pulling,
// and stops at release. One fire-time endpoint cannot represent that motion.
export class MagneticLiftBeamPlugin {
    private manager?: any;
    private effect?: MagneticBeamFx;
    private controller?: any;
    constructor(private unit: any, private camera: THREE.Camera, private color: THREE.Color) {}
    onCreate(manager: any): void { this.manager = manager; }
    update(): void {
        const controller = this.unit.magneticLiftTrait?.getController();
        if (!this.manager || !controller?.isSpawned || controller.isDestroyed || this.unit.isDestroyed) {
            this.clear(); return;
        }
        if (controller !== this.controller) {
            this.clear(); this.controller = controller;
            const source = () => magneticMuzzle(controller, this.manager?.getRenderableByGameObject?.(controller));
            this.effect = new MagneticBeamFx(this.camera, source, () => magneticFoot(this.unit,
                this.manager?.getRenderableByGameObject?.(this.unit), source(), this.camera), this.color);
            this.manager.addEffect(this.effect);
        }
    }
    private clear(): void { this.effect?.removeAndDispose(); this.effect = undefined; this.controller = undefined; }
    onRemove(): void { this.clear(); this.manager = undefined; }
    dispose(): void { this.clear(); }
}
