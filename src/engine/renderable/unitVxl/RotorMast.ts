import * as THREE from 'three';
import { BufferGeometryUtils } from '../../gfx/BufferGeometryUtils';

export interface RotorMastSpec {
    height: number;
    baseRadius: number;
}

// A stationary bearing housing belongs to the airframe, not to the spinning
// image plane. Native parent transforms retain flight pitch, yaw and roll.
export class RotorMast {
    readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
    private readonly axis = new THREE.Vector3(0, 0, 1);
    constructor(parent: THREE.Object3D, spec: RotorMastSpec) {
        const collarRadius = Math.min(2.1, spec.baseRadius);
        const pieces = [
            { top: collarRadius, bottom: spec.baseRadius, height: spec.height - 1.8,
                z: -(spec.height + 1.8) / 2, color: 0x626b79 },
            { top: collarRadius, bottom: collarRadius, height: 1.2, z: -1.2, color: 0x333a43 },
            { top: 1.1, bottom: 1.1, height: 0.6, z: -0.3, color: 0x9ba6ac },
        ].map(p => {
            const g = new THREE.CylinderGeometry(p.top, p.bottom, p.height, 16);
            g.rotateX(Math.PI / 2);
            g.translate(0, 0, p.z);
            const color = new THREE.Color(p.color), colors: number[] = [];
            for (let i = 0; i < g.getAttribute('position').count; i++) colors.push(color.r, color.g, color.b);
            g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            return g;
        });
        const geometry = BufferGeometryUtils.mergeBufferGeometries(pieces);
        pieces.forEach(g => g.dispose());
        this.mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
            vertexColors: true, shininess: 24, specular: 0x22262e,
        }));
        this.mesh.name = 'unit-vxl-rotor-bearing';
        this.mesh.matrixAutoUpdate = false;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
        parent.add(this.mesh);
    }
    update(joint: THREE.Mesh, axis: THREE.Vector3, offset: [number, number, number],
        visible: boolean, opacity: number, light: THREE.Vector3, clipping: THREE.Plane[] | null) {
        this.mesh.visible = visible && opacity > 0;
        if (!this.mesh.visible) return;
        const center = joint.geometry.boundingBox!.getCenter(new THREE.Vector3()).projectOnVector(axis);
        this.mesh.position.copy(center.applyMatrix4(joint.matrix)).add(new THREE.Vector3().fromArray(offset));
        this.mesh.quaternion.setFromUnitVectors(this.axis, axis.clone().applyQuaternion(joint.quaternion));
        this.mesh.updateMatrix();
        this.mesh.renderOrder = joint.renderOrder;
        const material = this.mesh.material;
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = opacity === 1;
        material.clippingPlanes = clipping;
        material.color.setRGB(Math.max(0, 1 + light.x), Math.max(0, 1 + light.y), Math.max(0, 1 + light.z));
    }
    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
