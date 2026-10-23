import * as THREE from 'three';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import { getMeshLineResolution } from './MeshLineResolution';

export function nativeDiscRadius(mesh: THREE.Mesh): number {
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    const axes = [0, 1].map(axis => new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, axis));
    // VXL's ground plane is local XY. Transforming its box to world axes
    // overestimates a circular footprint at diagonal turret bearings.
    return Math.max(size.x * Math.hypot(axes[0].x, axes[0].z),
        size.y * Math.hypot(axes[1].x, axes[1].z)) / 2;
}

// Native DiskLaser is a circumference sweep followed by the outgoing ray.
// This effect owns only presentation; projectile damage/cooldown remain native.
export class DiscLaserFx {
    private container?: any;
    private group?: THREE.Group;
    private ring?: THREE.Mesh;
    private ray?: THREE.Mesh;
    private started?: number;
    phase: 'ring' | 'ray' = 'ring';
    constructor(private camera: THREE.Camera, private source: () => THREE.Vector3,
        private target: () => THREE.Vector3, private radius: number,
        private duration: number, private inner: THREE.Color, private outer: THREE.Color) {}
    setContainer(container: any): void { this.container = container; }
    get3DObject(): THREE.Group | undefined { return this.group; }
    private mesh(color: THREE.Color, width: number): THREE.Mesh {
        const line = new MeshLine(); line.setPoints([0, 0, 0, 1, 0, 0]);
        const mesh = new THREE.Mesh(line.geometry, new MeshLineMaterial({ color, lineWidth: width,
            resolution: getMeshLineResolution(this.camera), sizeAttenuation: 0, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        mesh.renderOrder = 1000000;
        return mesh;
    }
    create3DObject(): void {
        if (this.group) return;
        this.group = new THREE.Group(); this.group.name = 'fx_disc_laser';
        this.ring = this.mesh(this.inner, 3); this.ray = this.mesh(this.outer.clone().lerp(this.inner, .75), 4);
        (this.ring.material as THREE.Material).depthTest = true;
        this.group.add(this.ring, this.ray);
    }
    private points(mesh: THREE.Mesh, points: number[]): void {
        const line = new MeshLine(); line.setPoints(points);
        mesh.geometry.dispose(); mesh.geometry = line.geometry;
    }
    update(time: number): void {
        this.started ??= time;
        const progress = Math.max(0, (time - this.started) / (Math.max(.05, this.duration) * 1000));
        if (progress >= 1) { this.container?.remove(this); this.dispose(); return; }
        const source = this.source(), target = this.target(), sweep = Math.min(1, progress / .65);
        const points: number[] = [];
        for (let i = 0; i <= 64; i++) {
            const angle = i / 64 * Math.PI * 2 * sweep;
            points.push(source.x + Math.cos(angle) * this.radius, source.y,
                source.z + Math.sin(angle) * this.radius);
        }
        this.points(this.ring!, points);
        this.ring!.visible = true;
        this.phase = progress < .65 ? 'ring' : 'ray';
        this.group!.userData.phase = this.phase;
        this.group!.userData.progress = progress;
        this.ray!.visible = this.phase === 'ray';
        if (this.ray!.visible) {
            const direction = target.clone().sub(source); direction.y = 0; direction.normalize();
            const edge = source.clone().addScaledVector(direction, this.radius);
            this.points(this.ray!, [...edge.toArray(), ...target.toArray()]);
        }
    }
    dispose(): void {
        for (const mesh of [this.ring, this.ray]) if (mesh) {
            mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
        }
        this.group = undefined;
    }
}
