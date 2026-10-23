// Opt-in four-combination experiment. No application entry imports this module.
import * as THREE from 'three';
import { ArtworkResource, syntheticProof } from '../rhino-sprite/adapter';
import { verifyBytes } from '../rhino-sprite/contract';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';
import { createSpriteGeometry } from '../../../src/engine/gfx/SpriteUtils';
import { Coords } from '../../../src/game/Coords';
import { registration, supported, heading, referenceColor } from './contract';
import { manifestHash } from './identity';

export class PartResources {
    constructor(readonly parts: Map<string, ArtworkResource>, readonly manifest: any) {}
    static async load(prefix = '/rhino-parts'): Promise<PartResources> {
        const parts = new Map<string, ArtworkResource>();
        try {
            const response = await fetch(`${prefix}/manifest.json`);
            if (!response.ok) throw Error('Missing part manifest');
            const bytes = await response.arrayBuffer(); await verifyBytes(bytes, manifestHash);
            const manifest = JSON.parse(new TextDecoder().decode(bytes));
            for (const key of ['body-0', 'body-90', 'turret-0', 'turret-90']) {
                const entry = manifest.parts[key], response = await fetch(`${prefix}/${entry.file}`);
                if (!response.ok) throw Error(`Missing part ${key}`);
                const bytes = await response.arrayBuffer(); await verifyBytes(bytes, entry.sha256);
                const bitmap = await createImageBitmap(new Blob([bytes]), {
                    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
                });
                if (bitmap.width !== 256 || bitmap.height !== 224) { bitmap.close(); throw Error('Part dimensions'); }
                parts.set(key, new ArtworkResource(new THREE.Texture(bitmap), bitmap));
            }
            return new PartResources(parts, manifest);
        } catch (error) { for (const p of parts.values()) p.dispose(); throw error; }
    }
}

export class PartLayer {
    readonly source: BatchedMesh;
    readonly batch: MergedSpriteMesh;
    readonly proxy: THREE.Mesh;
    constructor(readonly key: string, readonly resource: ArtworkResource, camera: THREE.Camera, parent: THREE.Object3D) {
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
        this.batch.name = `m13d-${key}`; this.batch.matrixAutoUpdate = false; this.batch.visible = false;
        const mat = (this.batch.material as HdSpriteMaterial).clone();
        mat.enableFiltering('full'); mat.transparent = false; mat.colorWrite = false;
        mat.depthWrite = true; mat.alphaTest = 0.985;
        this.proxy = new THREE.Mesh(this.batch.geometry, mat);
        this.proxy.name = `m13d-${key}-depth`; this.proxy.matrixAutoUpdate = false;
        this.proxy.frustumCulled = false; this.proxy.visible = false;
        parent.add(this.proxy, this.batch); resource.retain();
    }
    update(visible: boolean, light: THREE.Vector3, order: number, clipping: any, translation: THREE.Vector3): void {
        this.batch.visible = this.proxy.visible = visible;
        this.source.matrixWorld.makeTranslation(translation.x, translation.y, translation.z);
        this.source.extraLight.copy(light);
        this.batch.renderOrder = this.proxy.renderOrder = order;
        (this.batch.material as THREE.Material).clippingPlanes = clipping;
        (this.proxy.material as THREE.Material).clippingPlanes = clipping;
        this.batch.updateFromMeshes([this.source]);
    }
    dispose(): void {
        this.proxy.removeFromParent(); (this.proxy.material as THREE.Material).dispose();
        this.batch.removeFromParent(); this.batch.dispose();
        this.source.geometry.dispose(); (this.source.material as THREE.Material).dispose(); this.resource.release();
    }
}

export class RhinoPartsProof {
    readonly layers: Map<string, PartLayer>;
    readonly originalMeshes: any[];
    readonly originals: any[];
    readonly hidden: any[];
    readonly owner: any;
    readonly ownerColor: any;
    readonly baseLight: THREE.Vector3;
    readonly initialPivot = new THREE.Vector3();
    readonly pivot = new THREE.Vector3();
    readonly light = new THREE.Vector3();
    readonly zero = new THREE.Vector3();
    readonly oldUpdate: any;
    readonly oldDispose: any;
    readonly wrappedUpdate: any;
    readonly wrappedDispose: any;
    enabled = false;
    active = false;
    disposed = false;
    background = false;
    partView = 'both';
    constructor(readonly renderable: any, readonly resources: PartResources, camera: THREE.Camera) {
        const r = renderable;
        if (r.gameObject.name !== 'HTNK' || r.vxlBuilders.length !== 3 || !r.turret) throw Error('Expected HTNK');
        this.originalMeshes = r.vxlBuilders.flatMap((b: any) => [...b.sections.values()]);
        if (this.originalMeshes.length !== 3) throw Error('Incomplete original family');
        this.originals = this.originalMeshes.map(m => m.material);
        this.hidden = this.originals.map(m => { const c = m.clone(); c.colorWrite = c.depthWrite = false; return c; });
        this.owner = r.gameObject.owner; this.ownerColor = this.owner.color;
        this.baseLight = r.shpExtraLight.clone();
        r.turret.updateWorldMatrix(true, false);
        r.posObj.worldToLocal(r.turret.getWorldPosition(this.initialPivot));
        this.layers = new Map([...resources.parts].map(([key, resource]) => [key, new PartLayer(key, resource, camera, r.posObj)]));
        this.oldUpdate = r.update; this.oldDispose = r.dispose;
        const self = this;
        this.wrappedUpdate = function(this: any, ...args: any[]) { self.oldUpdate.apply(this, args); self.update(); };
        this.wrappedDispose = function(this: any, ...args: any[]) { self.dispose(); return self.oldDispose?.apply(this, args); };
        r.update = this.wrappedUpdate; r.dispose = this.wrappedDispose;
    }
    update(): void {
        if (this.disposed) return;
        const r = this.renderable, u = r.gameObject;
        const opacity = this.originalMeshes[0].getOpacity?.() ?? this.originals[0].opacity;
        this.active = this.enabled && supported(u, this.owner) && referenceColor(this.owner.color) && opacity === 1
            && [...this.resources.parts.values()].every(p => !p.disposed)
            && [r.tiltObj.rotation.x, r.tiltObj.rotation.z, r.rockingTiltObj.rotation.x, r.rockingTiltObj.rotation.z].every(v => Math.abs(v) < 1e-6);
        for (let i = 0; i < this.originalMeshes.length; i++) {
            this.hidden[i].clippingPlanes = this.originals[i].clippingPlanes;
            this.originalMeshes[i].material = this.active || this.background ? this.hidden[i] : this.originals[i];
        }
        this.light.set((1 + r.shpExtraLight.x) / (1 + this.baseLight.x) - 1,
            (1 + r.shpExtraLight.y) / (1 + this.baseLight.y) - 1,
            (1 + r.shpExtraLight.z) / (1 + this.baseLight.z) - 1);
        r.turret.updateWorldMatrix(true, false);
        r.posObj.worldToLocal(r.turret.getWorldPosition(this.pivot)); this.pivot.sub(this.initialPivot);
        const body = `body-${heading(u.direction)}`, turret = `turret-${heading(u.turretTrait?.facing)}`;
        const clipping = this.originalMeshes[0].getClippingPlanes?.() ?? this.originals[0].clippingPlanes;
        for (const [key, layer] of this.layers) {
            const isTurret = key.startsWith('turret');
            const selected = key === (isTurret ? turret : body) && (this.partView === 'both' || this.partView === (isTurret ? 'turret' : 'body'));
            layer.update(this.active && !this.background && r.mainObj.visible && selected, this.light,
                this.originalMeshes[0].renderOrder, clipping, isTurret ? this.pivot : this.zero);
        }
    }
    setEnabled(enabled: boolean): void { this.enabled = enabled; this.update(); }
    dispose(): void {
        if (this.disposed) return;
        this.enabled = this.background = false; this.update(); this.disposed = true;
        if (this.renderable.update === this.wrappedUpdate) this.renderable.update = this.oldUpdate;
        if (this.renderable.dispose === this.wrappedDispose) this.renderable.dispose = this.oldDispose;
        this.layers.forEach(p => p.dispose()); this.hidden.forEach(m => m.dispose());
    }
}
if (typeof window !== 'undefined') (window as any).__m13dModule = { PartResources, RhinoPartsProof, syntheticProof, registration };
