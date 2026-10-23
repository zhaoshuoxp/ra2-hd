import * as THREE from 'three';
import { rotateVec2 } from '@/game/math/geometry';
import { Vector2 } from '@/game/math/Vector2';

export class AirstrikeLinePlugin {
    private line?: THREE.Line;
    private manager?: any;
    private markedRenderable?: any;
    constructor(private unit: any, private renderable: any) {}
    onCreate(manager: any): void { this.manager = manager; }
    update(): void {
        const target = this.unit.airstrikeTrait.getTarget();
        const weapon = this.unit.armedTrait.getWeapons().find((w: any) => w.rules.isLine);
        if (!target || !weapon || !this.unit.isSpawned || this.unit.isDestroyed || this.unit.warpedOutTrait.isActive()) {
            this.clear();
            return;
        }
        if (!this.line) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
            this.line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
                depthTest: false, depthWrite: false, transparent: true, toneMapped: false,
            }));
            this.line.name = 'airstrike_designator';
            this.line.renderOrder = 999999;
            this.renderable.get3DObject().add(this.line);
        }
        const marked = this.manager?.getRenderableByGameObject(target);
        if (marked !== this.markedRenderable) {
            this.markedRenderable?.setAirstrikeDesignator(this, false);
            this.markedRenderable = marked;
            marked?.setAirstrikeDesignator(this, true);
        }
        const offset = rotateVec2(new Vector2(weapon.flh.lateral, weapon.flh.forward), weapon.getMuzzleFacing());
        const end = this.unit.attackTrait.currentTarget.getWorldCoords().clone().sub(this.unit.position.worldPosition);
        const positions = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        positions.setXYZ(0, offset.x, weapon.flh.vertical, -offset.y);
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        this.line.geometry.computeBoundingSphere();
        (this.line.material as THREE.LineBasicMaterial).color.setHex(weapon.rules.isHouseColor ? this.unit.owner.color.asHex() : 0xff0000);
    }
    private clear(): void {
        this.markedRenderable?.setAirstrikeDesignator(this, false);
        this.markedRenderable = undefined;
        if (!this.line) return;
        this.line.removeFromParent();
        this.line.geometry.dispose();
        (this.line.material as THREE.Material).dispose();
        this.line = undefined;
    }
    onRemove(): void { this.clear(); }
    dispose(): void { this.clear(); }
}
