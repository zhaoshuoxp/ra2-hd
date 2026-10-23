import * as THREE from 'three';
import { RhinoArtwork, LoadedRhinoHd } from './loadRhinoHd';
import { RhinoMaterial, colorDelta } from './RhinoMaterial';
import { MergedSpriteMesh } from '../../gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../gfx/batch/BatchedMesh';
import { HdSpriteMaterial } from '../../gfx/material/HdSpriteMaterial';
import { createSpriteGeometry } from '../../gfx/SpriteUtils';
import { Coords } from '../../../game/Coords';
import { registration, supported, heading } from './contract';
import { nativePose } from './pose';
import { nativeCoverage } from './coverage';
import { RhinoShadow } from './RhinoShadow';

export class PartLayer {
    readonly source: BatchedMesh;
    readonly batch: MergedSpriteMesh;
    readonly proxy: THREE.Mesh;
    readonly translucent: THREE.Mesh;
    constructor(readonly key: string, readonly resource: RhinoArtwork, camera: THREE.Camera, parent: THREE.Object3D) {
        const geometry = createSpriteGeometry({ camera, texture: resource.texture,
            logicalSize: { width: registration.width, height: registration.height },
            offset: { x: registration.x, y: registration.y }, align: { x: 1, y: -1 },
            scale: Coords.ISO_WORLD_SCALE, depth: true });
        const towardCamera = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        const pos = geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(pos, i);
            if (point.y < 0.1) point.addScaledVector(towardCamera, (0.1 - point.y) / towardCamera.y);
            // Two registered surfaces: the turret lies just in front of the hull.
            // Camera-axis displacement changes depth only, never its projected pivot/scale.
            if (key.startsWith('turret')) point.addScaledVector(towardCamera, 0.5);
            pos.setXYZ(i, point.x, point.y, point.z);
        }
        this.source = new BatchedMesh(geometry, resource.material()); this.source.matrixWorld.identity();
        this.batch = new MergedSpriteMesh(geometry, this.source.material as THREE.Material, 1);
        this.batch.name = `rhino-hd-${key}`; this.batch.matrixAutoUpdate = false; this.batch.visible = false;
        const mat = (this.batch.material as HdSpriteMaterial).clone();
        mat.enableFiltering('full'); mat.transparent = false; mat.colorWrite = false;
        mat.depthWrite = true; mat.alphaTest = 0.985;
        this.proxy = new THREE.Mesh(this.batch.geometry, mat);
        this.proxy.name = `rhino-hd-${key}-depth`; this.proxy.matrixAutoUpdate = false;
        this.proxy.frustumCulled = false; this.proxy.visible = false;
        const translucentMaterial = (this.batch.material as HdSpriteMaterial).clone();
        translucentMaterial.enableFiltering('full');
        this.translucent = new THREE.Mesh(this.batch.geometry, translucentMaterial);
        this.translucent.name = `rhino-hd-${key}-translucent`;
        this.translucent.matrixAutoUpdate = false;
        this.translucent.frustumCulled = false; this.translucent.visible = false;
        parent.add(this.proxy, this.batch, this.translucent); resource.retain();
    }
    update(visible: boolean, light: THREE.Vector3, order: number, clipping: any,
        pose: THREE.Matrix4, opacity: number): void {
        this.batch.visible = this.proxy.visible = visible && opacity === 1;
        this.translucent.visible = visible && opacity > 0 && opacity < 1;
        if (!visible) return;
        this.source.extraLight.copy(light);
        for (const mesh of [this.batch, this.proxy, this.translucent]) {
            mesh.matrix.copy(pose); mesh.matrixWorldNeedsUpdate = true;
            mesh.renderOrder = order;
            (mesh.material as THREE.Material).clippingPlanes = clipping;
        }
        (this.translucent.material as THREE.Material).opacity = opacity;
        this.batch.updateFromMeshes([this.source]);
        for (const edge of this.batch.children) {
            if (edge.name === 'hd-sprite-edge') nativeCoverage(edge as THREE.Mesh, order);
        }
        nativeCoverage(this.translucent, order);
    }
    dispose(): void {
        this.proxy.removeFromParent(); (this.proxy.material as THREE.Material).dispose();
        this.translucent.removeFromParent(); (this.translucent.material as THREE.Material).dispose();
        this.batch.removeFromParent(); this.batch.dispose();
        this.source.geometry.dispose(); (this.source.material as THREE.Material).dispose(); this.resource.release();
    }
}

export class RhinoRenderer {
    readonly layers: Map<string, PartLayer>;
    readonly originalMeshes: any[];
    readonly originals: any[];
    readonly hidden: any[];
    readonly shadow: RhinoShadow;
    readonly baseLight: THREE.Vector3;
    readonly light = new THREE.Vector3();
    readonly pose = new THREE.Matrix4();
    private readonly yawInverse = new THREE.Matrix4();
    private colorKey = '';
    active = false;
    disposed = false;
    constructor(readonly renderable: any, readonly resources: LoadedRhinoHd, camera: THREE.Camera) {
        const r = renderable;
        if (r.objectArt.imageName.toUpperCase() !== 'HTNK' || !r.objectArt.isVoxel
            || r.objectArt.turretOffset || r.objectRules.turretCount !== 1 || r.objectArt.noHva)
            throw Error('Unsupported Rhino art layout');
        if (r.gameObject.name !== 'HTNK' || r.vxlBuilders.length !== 3 || !r.turret) throw Error('Expected HTNK');
        this.originalMeshes = r.vxlBuilders.flatMap((b: any) => [...b.sections.values()]);
        if (this.originalMeshes.length !== 3) throw Error('Incomplete original family');
        this.originals = this.originalMeshes.map(m => m.material);
        this.hidden = this.originals.map(m => { const c = m.clone(); c.colorWrite = c.depthWrite = false; return c; });
        this.shadow = new RhinoShadow(this.originalMeshes);
        this.baseLight = r.baseShpExtraLight.clone();
        this.layers = new Map([...resources.parts].map(([key, resource]) => [key, new PartLayer(key, resource, camera, r.posObj)]));
    }
    update(): void {
        if (this.disposed) return;
        const r = this.renderable, u = r.gameObject;
        const opacity = this.originalMeshes[0].getOpacity?.() ?? this.originals[0].opacity;
        nativePose(this.pose, this.yawInverse, r);
        this.active = this.resources.enabled.value && supported(u) && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
            // Batched casters share a depth draw; use complete-original fallback
            // rather than applying one Rhino's opacity to a whole batch.
            && !(opacity < 1 && this.originalMeshes.some(m => m.isBatchedMesh))
            && this.pose.elements.every(Number.isFinite)
            && [...this.resources.parts.values()].every(p => !p.disposed);
        const color = u.owner.color, key = `${color.r},${color.g},${color.b}`;
        if (this.colorKey !== key) {
            this.colorKey = key;
            const delta = colorDelta(color);
            for (const layer of this.layers.values())
                (layer.source.material as RhinoMaterial).uniforms.rhinoColorDelta.value.copy(delta);
        }
        for (let i = 0; i < this.originalMeshes.length; i++) {
            this.hidden[i].clippingPlanes = this.originals[i].clippingPlanes;
            this.hidden[i].opacity = this.originals[i].opacity;
            this.originalMeshes[i].material = this.active ? this.hidden[i] : this.originals[i];
        }
        this.shadow.update(this.active, opacity);
        this.light.set((1 + r.shpExtraLight.x) / (1 + this.baseLight.x) - 1,
            (1 + r.shpExtraLight.y) / (1 + this.baseLight.y) - 1,
            (1 + r.shpExtraLight.z) / (1 + this.baseLight.z) - 1);
        // The SHP multiplier above preserves authored detail during Iron Curtain.
        // Follow the actual interpolated native body transform, including in-place turns.
        const bodyFacing = r.dirWrapObj ? THREE.MathUtils.radToDeg(r.dirWrapObj.rotation.y + r.tiltObj.rotation.y) : u.direction;
        const turretFacing = r.dirWrapObj ? Math.floor(u.turretTrait?.facing) : u.turretTrait?.facing;
        const body = `body-${heading(bodyFacing)}`, turret = `turret-${heading(turretFacing)}`;
        const clipping = this.originalMeshes[0].getClippingPlanes?.() ?? this.originals[0].clippingPlanes;
        for (const [key, layer] of this.layers) {
            const isTurret = key.startsWith('turret');
            const selected = key === (isTurret ? turret : body);
            layer.update(this.active && r.mainObj.visible && selected, this.light,
                this.originalMeshes[0].renderOrder, clipping, this.pose, opacity);
        }
    }
    dispose(): void {
        if (this.disposed) return;
        this.originalMeshes.forEach((mesh, i) => mesh.material = this.originals[i]);
        this.shadow.dispose();
        this.active = false; this.disposed = true;
        this.layers.forEach(p => p.dispose()); this.hidden.forEach(m => m.dispose());
    }
}
