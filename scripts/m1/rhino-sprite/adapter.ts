// Explicit diagnostic entry only. No normal game entry imports this adapter.
import * as THREE from 'three';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { createSpriteGeometry } from '../../../src/engine/gfx/SpriteUtils';
import { Coords } from '../../../src/game/Coords';
import { identity, registration, supported, verifyBytes } from './contract';

export class ArtworkResource {
    refs = 0;
    disposed = false;
    readonly remap: THREE.DataTexture;
    readonly palette: THREE.DataTexture;
    constructor(readonly texture: THREE.Texture, readonly bitmap?: ImageBitmap) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.premultiplyAlpha = false;
        texture.needsUpdate = true;
        this.remap = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        this.palette = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        this.remap.needsUpdate = this.palette.needsUpdate = true;
    }
    static async load(url: string): Promise<ArtworkResource> {
        const response = await fetch(url);
        if (!response.ok) throw Error(`Rhino image unavailable: ${response.status}`);
        const bytes = await response.arrayBuffer();
        await verifyBytes(bytes, identity.export);
        // ImageBitmap ignores Texture.flipY; perform the flip once at decode.
        const bitmap = await createImageBitmap(new Blob([bytes]), {
            imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
        });
        if (bitmap.width !== 256 || bitmap.height !== 192) { bitmap.close(); throw Error('Invalid Rhino dimensions'); }
        return new ArtworkResource(new THREE.Texture(bitmap), bitmap);
    }
    retain(): void { if (this.disposed) throw Error('Disposed Rhino image'); this.refs++; }
    release(): void {
        if (this.refs <= 0) throw Error('Unbalanced Rhino resource release');
        if (--this.refs === 0) this.dispose();
    }
    dispose(): void {
        if (this.refs) throw Error('Rhino resource still in use');
        if (this.disposed) return;
        this.disposed = true;
        this.texture.dispose(); this.remap.dispose(); this.palette.dispose(); this.bitmap?.close();
    }
    material(): HdSpriteMaterial {
        return new HdSpriteMaterial({ map: this.texture, remapMap: this.remap,
            palette: this.palette, paletteCount: 1, alphaTest: 0.05, toneMapped: false });
    }
}

export class RhinoSpriteProof {
    readonly batch: MergedSpriteMesh;
    readonly source: BatchedMesh;
    readonly depthProxy: THREE.Mesh;
    readonly originalMeshes: any[];
    readonly originals: any[];
    readonly hidden: any[];
    readonly baseLight: THREE.Vector3;
    readonly owner: any;
    readonly oldUpdate: any;
    readonly oldDispose: any;
    readonly wrappedDispose: any;
    readonly ownerColor: any;
    readonly wrappedUpdate: any;
    enabled = false;
    active = false;
    disposed = false;
    background = false;
    constructor(readonly renderable: any, readonly resource: ArtworkResource, camera: THREE.Camera) {
        const r = renderable;
        if (r.gameObject.name !== 'HTNK' || r.vxlBuilders.length !== 3) throw Error('Expected complete HTNK VXL family');
        this.originalMeshes = r.vxlBuilders.flatMap((b: any) => [...b.sections.values()]);
        if (this.originalMeshes.length !== 3) throw Error('Unsupported HTNK section layout');
        this.originals = this.originalMeshes.map(m => m.material);
        this.hidden = this.originals.map(m => { const clone = m.clone(); clone.colorWrite = false; clone.depthWrite = false; return clone; });
        this.owner = r.gameObject.owner;
        this.ownerColor = this.owner.color;
        this.baseLight = r.shpExtraLight.clone();
        const geometry = createSpriteGeometry({ camera, texture: resource.texture,
            logicalSize: { width: registration.width, height: registration.height },
            offset: { x: registration.x, y: registration.y }, align: { x: 1, y: -1 },
            scale: Coords.ISO_WORLD_SCALE, depth: true });
        // SpriteUtils' folded billboards may extend below the ground plane.
        // Move those vertices only along the view axis, preserving every screen
        // coordinate, until the approximate surface clears the ground receiver.
        const towardCamera = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
        const positions = geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < positions.count; i++) {
            const point = new THREE.Vector3().fromBufferAttribute(positions, i);
            if (point.y < 0.1) point.addScaledVector(towardCamera, (0.1 - point.y) / towardCamera.y);
            positions.setXYZ(i, point.x, point.y, point.z);
        }
        this.source = new BatchedMesh(geometry, resource.material());
        // Local sprite geometry; the actual entity position parent owns translation.
        this.source.matrixWorld.identity();
        this.batch = new MergedSpriteMesh(geometry, this.source.material as THREE.Material, 1);
        this.batch.name = 'm13c-world-rhino';
        this.batch.visible = false;
        this.batch.castShadow = false;
        this.batch.matrixAutoUpdate = false;
        // The retained source has a near-opaque alpha plateau at 252-253, below
        // C's 254 interior threshold. A separate colorless coverage proxy shields
        // it from the later ground-shadow receiver without altering color/alpha.
        // Reuse C's exact filter; only this explicit proxy uses a 0.985 cutoff.
        const depthMaterial = (this.batch.material as HdSpriteMaterial).clone();
        depthMaterial.enableFiltering('full');
        depthMaterial.transparent = false; depthMaterial.colorWrite = false;
        depthMaterial.depthWrite = true; depthMaterial.alphaTest = 0.985;
        this.depthProxy = new THREE.Mesh(this.batch.geometry, depthMaterial);
        this.depthProxy.name = 'm13c-near-opaque-depth-proxy';
        this.depthProxy.matrixAutoUpdate = false; this.depthProxy.frustumCulled = false;
        this.depthProxy.visible = false;
        r.posObj.add(this.depthProxy, this.batch);
        resource.retain();
        this.oldUpdate = r.update;
        const self = this;
        this.wrappedUpdate = function(this: any, ...args: any[]) {
            self.oldUpdate.apply(this, args); self.update();
        };
        r.update = this.wrappedUpdate;
        this.oldDispose = r.dispose;
        this.wrappedDispose = function(this: any, ...args: any[]) {
            self.dispose(); return self.oldDispose?.apply(this, args);
        };
        r.dispose = this.wrappedDispose;
    }
    update(): void {
        if (this.disposed) return;
        const r = this.renderable;
        const opacity = this.originalMeshes[0].getOpacity?.() ?? this.originals[0].opacity;
        // Non-neutral transient states use a whole-family fallback, never an invented pose.
        const valid = supported(r.gameObject, this.owner) && this.owner.color === this.ownerColor
            && !this.resource.disposed && opacity === 1
            && Math.abs(r.tiltObj.rotation.x) < 1e-6 && Math.abs(r.tiltObj.rotation.z) < 1e-6
            && Math.abs(r.rockingTiltObj.rotation.x) < 1e-6 && Math.abs(r.rockingTiltObj.rotation.z) < 1e-6;
        this.active = this.enabled && valid;
        this.batch.visible = this.active && !this.background && r.mainObj.visible;
        for (let i = 0; i < this.originalMeshes.length; i++) {
            this.hidden[i].clippingPlanes = this.originals[i].clippingPlanes;
            this.originalMeshes[i].material = this.active || this.background ? this.hidden[i] : this.originals[i];
        }
        const light = r.shpExtraLight;
        this.source.extraLight.set((1 + light.x) / (1 + this.baseLight.x) - 1,
            (1 + light.y) / (1 + this.baseLight.y) - 1, (1 + light.z) / (1 + this.baseLight.z) - 1);
        this.source.opacity = opacity;
        const material = this.batch.material as HdSpriteMaterial;
        material.clippingPlanes = this.originalMeshes[0].getClippingPlanes?.() ?? this.originals[0].clippingPlanes;
        this.batch.renderOrder = this.originalMeshes[0].renderOrder;
        this.depthProxy.visible = this.batch.visible;
        this.depthProxy.renderOrder = this.batch.renderOrder;
        (this.depthProxy.material as THREE.Material).clippingPlanes = material.clippingPlanes;
        this.batch.updateFromMeshes([this.source]);
    }
    setEnabled(enabled: boolean): void { this.enabled = enabled; this.update(); }
    dispose(): void {
        if (this.disposed) return;
        this.enabled = false; this.background = false; this.update(); this.disposed = true;
        if (this.renderable.update === this.wrappedUpdate) this.renderable.update = this.oldUpdate;
        if (this.renderable.dispose === this.wrappedDispose) this.renderable.dispose = this.oldDispose;
        this.depthProxy.removeFromParent(); (this.depthProxy.material as THREE.Material).dispose();
        this.batch.removeFromParent(); this.batch.dispose();
        this.source.geometry.dispose(); (this.source.material as THREE.Material).dispose();
        this.hidden.forEach(m => m.dispose()); this.resource.release();
    }
}

export function syntheticProof(): any {
    const data = new Uint8Array(64 * 16 * 4);
    const colors = [[128, 64, 32, 255], [128, 64, 32, 254], [128, 64, 32, 128], [255, 0, 255, 0]];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) data.set(colors[Math.floor(x / 16)], (y * 64 + x) * 4);
    const resource = new ArtworkResource(new THREE.DataTexture(data, 64, 16));
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(64, 16); renderer.setClearColor(0, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-2, 2, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;
    const source = new BatchedMesh(new THREE.PlaneGeometry(4, 1), resource.material());
    const batch = new MergedSpriteMesh(source.geometry, source.material as THREE.Material, 1);
    batch.updateFromMeshes([source]); scene.add(batch); renderer.render(scene, camera);
    const gl = renderer.getContext(), pixels = new Uint8Array(64 * 16 * 4);
    gl.readPixels(0, 0, 64, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const samples = [8, 24, 40, 56].map(x => Array.from(pixels.slice((8 * 64 + x) * 4, (8 * 64 + x) * 4 + 4)));
    const expected = [[128, 64, 32], [128, 64, 32], [64, 32, 16], [0, 0, 0]];
    if (samples.some((row, i) => row.slice(0, 3).some((v, c) => Math.abs(v - expected[i][c]) > 1)))
        throw Error(`Synthetic color/coverage failure: ${JSON.stringify(samples)}`);
    // A two-texel black/white footprint must average in linear light (188),
    // not sRGB code space (128). This checks the actual shared GPU filter.
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) data.set([x % 2 ? 255 : 0, x % 2 ? 255 : 0, x % 2 ? 255 : 0, 255], (y * 64 + x) * 4);
    resource.texture.needsUpdate = true; renderer.setSize(32, 16); renderer.render(scene, camera);
    const average = new Uint8Array(4); gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, average);
    if (Array.from(average).slice(0, 3).some(v => Math.abs(v - 188) > 1)) throw Error('Linear averaging failure');
    const result = { status: 'PASS', samples, expected, linearAverage: Array.from(average), passes: [1, 2],
        contract: 'sRGB texture decode, linear premultiplied filtering, sRGB output, one premultiplied edge blend; alpha 254 is interior', glError: gl.getError() };
    batch.dispose(); source.geometry.dispose(); (source.material as THREE.Material).dispose(); resource.dispose(); renderer.dispose();
    return result;
}
if (typeof window !== 'undefined') (window as any).__m13cModule = { ArtworkResource, RhinoSpriteProof, syntheticProof, identity, registration };
