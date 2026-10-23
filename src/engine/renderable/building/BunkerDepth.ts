import * as THREE from 'three';
import { Coords } from '../../../game/Coords';

// A bunker rear wall is a background layer for its native docked vehicle. Map
// its depth to the dock deck along camera rays, retaining every projected pixel.
export function rearWallDeckGeometry(source: THREE.BufferGeometry, world: THREE.Matrix4,
    towardCamera: THREE.Vector3, deckHeight: number): THREE.BufferGeometry {
    const geometry = source.clone(), positions = geometry.getAttribute('position');
    const inverse = world.clone().invert(), point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(world);
        point.addScaledVector(towardCamera, (deckHeight - point.y) / towardCamera.y).applyMatrix4(inverse);
        positions.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

export class BunkerDepth {
    private previous?: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
    private cached?: { key: string; geometry: THREE.BufferGeometry };
    constructor(private readonly building: any) {}
    update(): void {
        this.restore();
        const r = this.building, unit = r.gameObject.bunkerTrait?.unit;
        const rear = r.animObjects.get(3)?.[1];
        if (!unit || !rear?.builder?.hdOverride) return;
        const wall = rear.getShapeMesh() as THREE.Mesh;
        if (!wall) return;
        wall.updateWorldMatrix(true, false);
        const toward = new THREE.Vector3(0, 0, 1).applyQuaternion(r.camera.quaternion);
        const deck = r.gameObject.position.worldPosition.y + Coords.ISO_WORLD_SCALE;
        const key = `${wall.geometry.uuid}/${wall.matrixWorld.elements}/${toward.toArray()}/${deck}`;
        if (this.cached?.key !== key) {
            this.cached?.geometry.dispose();
            this.cached = { key, geometry: rearWallDeckGeometry(wall.geometry, wall.matrixWorld, toward, deck) };
        }
        this.previous = { mesh: wall, geometry: wall.geometry };
        wall.geometry = this.cached.geometry;
    }
    restore(): void {
        if (!this.previous) return;
        this.previous.mesh.geometry = this.previous.geometry;
        this.previous = undefined;
    }
    dispose(): void {
        this.restore();
        this.cached?.geometry.dispose();
        this.cached = undefined;
    }
}
