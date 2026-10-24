import * as THREE from 'three';
import { ShpBuilder } from '../builder/ShpBuilder';
import { AnimationType } from '../entity/building/AnimationType';

const BASIN_TOP = 62;

// Cut the quad in native image coordinates, interpolating positions and UVs
// together. Frame trimming and atlas padding therefore cannot move the cut.
export function fountainBandGeometry(source: THREE.BufferGeometry, top: number, height: number,
    basin: boolean): THREE.BufferGeometry {
    const geometry = source.clone(), uv = source.getAttribute('uv'), position = source.getAttribute('position');
    const targetUv = geometry.getAttribute('uv'), targetPosition = geometry.getAttribute('position');
    let low = Infinity, high = -Infinity;
    for (let index = 0; index < uv.count; index++) {
        low = Math.min(low, uv.getY(index)); high = Math.max(high, uv.getY(index));
    }
    const fraction = THREE.MathUtils.clamp((BASIN_TOP - top) / height, 0, 1);
    const cut = high - (high - low) * fraction;
    const bottom = new THREE.Vector3(), upper = new THREE.Vector3();
    for (let index = 0; index < uv.count; index++) {
        const x = uv.getX(index), y = basin ? Math.min(uv.getY(index), cut) : Math.max(uv.getY(index), cut);
        for (let other = 0; other < uv.count; other++) if (Math.abs(uv.getX(other) - x) < 1e-6) {
            if (Math.abs(uv.getY(other) - low) < 1e-6) bottom.fromBufferAttribute(position, other);
            if (Math.abs(uv.getY(other) - high) < 1e-6) upper.fromBufferAttribute(position, other);
        }
        const point = bottom.clone().lerp(upper, (y - low) / (high - low));
        targetPosition.setXYZ(index, point.x, point.y, point.z); targetUv.setXY(index, x, y);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
}

// The last two authored frames contain a different stone basin. Keep one
// complete reference basin and animate only the water above its rear rim.
export class FountainSurface {
    private hidden?: { object: THREE.Object3D; visible: boolean };
    private previous?: { mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
    private waterGeometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    private reference?: { active: any; override: any; builder: ShpBuilder; mesh: THREE.Mesh; geometry: THREE.BufferGeometry };
    constructor(private readonly building: any) { }
    restore(): void {
        if (this.hidden) this.hidden.object.visible = this.hidden.visible;
        if (this.previous) this.previous.mesh.geometry = this.previous.geometry;
        if (this.reference) this.reference.mesh.visible = false;
        this.hidden = this.previous = undefined;
    }
    private clearReference(): void {
        const reference = this.reference;
        if (reference) {
            reference.mesh.removeFromParent(); reference.builder.dispose(); reference.geometry.dispose();
            this.reference = undefined;
        }
        for (const geometry of this.waterGeometry.values()) geometry.dispose();
        this.waterGeometry.clear();
    }
    private createReference(active: any): void {
        this.clearReference();
        const source = active.builder;
        const builder = new ShpBuilder(source.shpFile, source.palette, source.camera, source.scale, source.depth, source.depthOffset);
        builder.setOffset(source.offset); builder.setSize(source.shpSize); builder.flat = source.flat;
        builder.setFrameOffset(source.frameOffset);
        builder.hdDepthOffset = source.hdDepthOffset; builder.setHdOverride(source.hdOverride);
        if (source.extraLight) builder.setExtraLight(source.extraLight);
        const mesh = builder.build() as THREE.Mesh, first = source.frameOffset;
        const frame = source.shpFile.getImage(first);
        const geometry = fountainBandGeometry(mesh.geometry, frame.y, source.atlas.getTextureArea(first).height, true);
        mesh.geometry = geometry; mesh.renderOrder = active.getShapeMesh().renderOrder;
        active.getShapeMesh().parent.add(mesh);
        this.reference = { active, override: source.hdOverride, builder, mesh, geometry };
    }
    update(): void {
        this.restore();
        const r = this.building;
        if (r.gameObject.name !== 'CAWASH18') return;
        const base = r.mainObj?.get3DObject();
        const active = r.animObjects.get(AnimationType.ACTIVE)?.find(sprite =>
            sprite.builder?.hdOverride && sprite.get3DObject()?.visible);
        if (!base?.visible || !active) { this.clearReference(); return; }
        if (this.reference?.active !== active || this.reference?.override !== active.builder.hdOverride)
            this.createReference(active);
        const reference = this.reference!, mesh = active.getShapeMesh() as THREE.Mesh;
        reference.builder.setPalette(active.builder.palette);
        if (active.builder.extraLight) reference.builder.setExtraLight(active.builder.extraLight);
        reference.mesh.visible = true;
        const source = mesh.geometry;
        let geometry = this.waterGeometry.get(source);
        if (!geometry) {
            const frame = active.builder.getFrame() + active.builder.frameOffset;
            const image = active.builder.shpFile.getImage(frame);
            geometry = fountainBandGeometry(source, image.y, active.builder.atlas.getTextureArea(frame).height, false);
            this.waterGeometry.set(source, geometry);
        }
        this.previous = { mesh, geometry: source }; mesh.geometry = geometry;
        this.hidden = { object: base, visible: base.visible }; base.visible = false;
    }
    dispose(): void { this.restore(); this.clearReference(); }
}
