import * as THREE from 'three';
import { isShadowOnlyMaterial } from '../ShadowOnlyMaterials';

// Only accepted HD ground-vehicle renderers register native sections here.
// The source owns its geometry/material and must unregister before disposal.
const casters = new Map<THREE.Mesh, number>();
export function registerVehicleShadowCaster(mesh: THREE.Mesh): void { casters.set(mesh, (casters.get(mesh) ?? 0) + 1); }
export function unregisterVehicleShadowCaster(mesh: THREE.Mesh): void {
    const references = casters.get(mesh) ?? 0;
    if (references > 1) casters.set(mesh, references - 1);
    else casters.delete(mesh);
}

export function supportsNativeInstancing(renderer: THREE.WebGLRenderer): boolean {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    return typeof gl.drawElementsInstanced === 'function' && typeof gl.vertexAttribDivisor === 'function';
}

class ShadowBatch {
    mesh: THREE.InstancedMesh;
    readonly material: THREE.MeshBasicMaterial;
    count = 0;
    lastUsed = 0;
    disposed = false;
    constructor(readonly scene: THREE.Scene, readonly geometry: THREE.BufferGeometry,
        source: THREE.Material, private readonly root: THREE.Group,
        readonly depth: THREE.MeshDepthMaterial, capacity = 16) {
        this.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false,
            side: source.side, shadowSide: source.shadowSide });
        this.mesh = this.createMesh(capacity);
    }
    private createMesh(capacity: number): THREE.InstancedMesh {
        const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
        mesh.name = 'vehicle-native-shadow-batch';
        mesh.customDepthMaterial = this.depth;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.matrixAutoUpdate = mesh.matrixWorldAutoUpdate = false;
        mesh.castShadow = true;
        // Culling uses each original's exact world bound and the light frustum.
        // The stored instance matrices are in light-view space, not world space.
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.count = 0;
        this.root.add(mesh);
        return mesh;
    }
    grow(): void {
        const previous = this.mesh;
        this.mesh = this.createMesh(previous.instanceMatrix.count * 2);
        this.mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
        previous.removeFromParent(); previous.dispose();
    }
    append(matrix: THREE.Matrix4): void {
        if (this.count === this.mesh.instanceMatrix.count) this.grow();
        matrix.toArray(this.mesh.instanceMatrix.array, this.count * 16);
        if (!this.count) {
            this.mesh.instanceMatrix.clearUpdateRanges();
            this.mesh.instanceMatrix.addUpdateRange(0, 0);
            this.mesh.instanceMatrix.needsUpdate = true;
        }
        this.count++;
        this.mesh.count = this.count;
        this.mesh.visible = true;
        // All source objects precede the batch subtree. Three uploads this
        // final range when its normal shadow traversal reaches the batch.
        const attribute = this.mesh.instanceMatrix;
        if (!attribute.updateRanges.length) attribute.addUpdateRange(0, this.count * 16);
        else attribute.updateRanges[0].count = this.count * 16;
    }
    dispose(): void {
        this.disposed = true;
        this.mesh.removeFromParent(); this.mesh.dispose();
        this.material.dispose();
        // Geometry belongs to the native VXL pool; the scene owns shared depth.
    }
}

function createDepthMaterial(): THREE.MeshDepthMaterial {
    const depth = new THREE.MeshDepthMaterial();
    // Preserve the exact CPU model-view bytes uploaded by individual casters.
    // This also avoids Float32 world/view multiplication changing edge rounding.
    depth.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
            vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
            gl_Position = projectionMatrix * mvPosition;
        `);
    };
    depth.customProgramCacheKey = () => 'vehicle-shadow-model-view-v1';
    return depth;
}

interface SceneBatches { root: THREE.Group; groups: Map<string, ShadowBatch>; depth: THREE.MeshDepthMaterial }
interface CachedBatch {
    batch: ShadowBatch; geometry: THREE.BufferGeometry; side: THREE.Side;
    shadowSide: THREE.Side | null; layers: number; order: number;
}

export class VehicleShadowBatcher {
    enabled = false;
    diagnosticTiming = false;
    private scenes = new Map<THREE.Scene, SceneBatches>();
    private cache = new WeakMap<THREE.Mesh, CachedBatch>();
    private frame = 0;
    private stats = { registered: 0, eligible: 0, instances: 0, batches: 0, uploadedBytes: 0,
        capacity: 0, growths: 0, retired: 0, updateMs: 0, preparationErrors: 0, lastError: '',
        fallbacks: {} as Record<string, number> };
    private readonly originalRender: THREE.WebGLShadowMap['render'];
    private readonly wrappedRender: THREE.WebGLShadowMap['render'];
    constructor(private readonly renderer: THREE.WebGLRenderer) {
        this.originalRender = renderer.shadowMap.render;
        const manager = this;
        this.wrappedRender = function(lights, scene, camera) {
            if (!manager.enabled || !lights.length) return manager.originalRender.call(this, lights, scene, camera);
            const batches = manager.begin(lights, scene);
            if (!batches) return manager.originalRender.call(this, lights, scene, camera);
            const direct = renderer.renderBufferDirect;
            renderer.renderBufferDirect = function(shadowCamera, sceneArg, geometry, material, object, group) {
                if (!manager.collect(scene, batches, geometry, object as THREE.Mesh, group))
                    direct.call(this, shadowCamera, sceneArg, geometry, material, object, group);
            };
            try {
                return manager.originalRender.call(this, lights, scene, camera);
            } finally {
                renderer.renderBufferDirect = direct;
                batches.root.visible = false;
                manager.finish(batches);
            }
        };
        renderer.shadowMap.render = this.wrappedRender;
    }
    private fallback(reason: string): void {
        this.stats.fallbacks[reason] = (this.stats.fallbacks[reason] ?? 0) + 1;
    }
    private begin(lights: THREE.Light[], scene: THREE.Scene): SceneBatches | undefined {
        const started = this.diagnosticTiming ? performance.now() : 0, stats = this.stats;
        stats.registered = casters.size;
        stats.eligible = stats.instances = stats.batches = stats.uploadedBytes = stats.capacity = stats.updateMs = 0;
        for (const key in stats.fallbacks) stats.fallbacks[key] = 0;
        if (!this.renderer.shadowMap.enabled || (!this.renderer.shadowMap.autoUpdate && !this.renderer.shadowMap.needsUpdate)) return;
        if (!supportsNativeInstancing(this.renderer)) { this.fallback('hardware'); return; }
        const light = lights[0] as THREE.DirectionalLight;
        if (lights.length !== 1 || !light?.isDirectionalLight || this.renderer.shadowMap.type === THREE.VSMShadowMap
            || light.shadow.getViewportCount() !== 1) { this.fallback('shadow-pass'); return; }
        if (!light.shadow.autoUpdate && !light.shadow.needsUpdate) return;
        let batches = this.scenes.get(scene);
        if (!batches) {
            const root = new THREE.Group(); root.name = 'vehicle-native-shadow-batches';
            root.matrixAutoUpdate = root.matrixWorldAutoUpdate = false;
            // Three's native path reuses one depth material. Sharing here keeps
            // its uniform-refresh behavior across compatible geometry batches.
            batches = { root, groups: new Map(), depth: createDepthMaterial() }; this.scenes.set(scene, batches);
        }
        // Append once per shadow pass if another root was added. All original
        // casters are processed before the batches, including newly spawned ones.
        if (scene.children[scene.children.length - 1] !== batches.root) scene.add(batches.root);
        batches.root.visible = true;
        for (const batch of batches.groups.values()) { batch.count = 0; batch.mesh.visible = false; }
        this.frame++;
        if (this.diagnosticTiming) stats.updateMs += performance.now() - started;
        return batches;
    }
    private collect(scene: THREE.Scene, batches: SceneBatches, geometry: THREE.BufferGeometry,
        mesh: THREE.Mesh, group: { start: number; count: number; materialIndex?: number } | null): boolean {
        if (!casters.has(mesh)) return false;
        const started = this.diagnosticTiming ? performance.now() : 0, stats = this.stats;
        try {
            const material = mesh.material;
            if (Array.isArray(material) || !isShadowOnlyMaterial(material)) { this.fallback('original-colour'); return false; }
            if ((mesh as any).isBatchedMesh || (mesh as any).isInstancedMesh || (mesh as any).isSkinnedMesh
                || mesh.morphTargetInfluences || group) {
                this.fallback('geometry-layout'); return false;
            }
            for (const attribute in geometry.morphAttributes) {
                this.fallback('geometry-layout'); return false;
            }
            if (mesh.customDepthMaterial || mesh.customDistanceMaterial) { this.fallback('custom-depth'); return false; }
            if (mesh.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow
                || mesh.onAfterShadow !== THREE.Object3D.prototype.onAfterShadow) { this.fallback('shadow-callback'); return false; }
            if (material.clippingPlanes?.length) { this.fallback('clipping-planes'); return false; }
            if (material.alphaTest || material.alphaHash || material.alphaToCoverage || (material as any).displacementMap
                || (material as any).wireframe || material.stencilWrite) { this.fallback('material-state'); return false; }
            if (!mesh.modelViewMatrix.elements.every(Number.isFinite) || mesh.matrixWorld.determinant() <= 0) {
                this.fallback('transform'); return false;
            }
            let cached = this.cache.get(mesh);
            if (!cached || cached.batch.disposed || cached.batch.scene !== scene || cached.geometry !== geometry
                || cached.side !== material.side || cached.shadowSide !== material.shadowSide
                || cached.layers !== mesh.layers.mask || cached.order !== mesh.renderOrder) {
                const key = `${geometry.id}:${material.side}:${material.shadowSide}:${mesh.layers.mask}:${mesh.renderOrder}`;
                let batch = batches.groups.get(key);
                if (!batch) {
                    batch = new ShadowBatch(scene, geometry, material, batches.root, batches.depth);
                    batch.mesh.layers.mask = mesh.layers.mask; batch.mesh.renderOrder = mesh.renderOrder;
                    batches.groups.set(key, batch);
                }
                cached = { batch, geometry, side: material.side, shadowSide: material.shadowSide,
                    layers: mesh.layers.mask, order: mesh.renderOrder };
                this.cache.set(mesh, cached);
            }
            const batch = cached.batch;
            if (!batch.count) stats.batches++;
            if (batch.count === batch.mesh.instanceMatrix.count) stats.growths++;
            batch.append(mesh.modelViewMatrix); batch.lastUsed = this.frame;
            stats.eligible++; stats.instances++; stats.uploadedBytes += 64;
            return true;
        } catch (error) {
            stats.preparationErrors++; stats.lastError = String(error); this.fallback('preparation-error');
            return false;
        } finally { if (this.diagnosticTiming) stats.updateMs += performance.now() - started; }
    }
    private finish(batches: SceneBatches): void {
        const started = this.diagnosticTiming ? performance.now() : 0, stats = this.stats;
        for (const [key, batch] of batches.groups) {
            if (!batch.count && this.frame - batch.lastUsed > 120) {
                batch.dispose(); batches.groups.delete(key); stats.retired++; continue;
            }
            stats.capacity += batch.mesh.instanceMatrix.count;
        }
        if (this.diagnosticTiming) stats.updateMs += performance.now() - started;
    }
    diagnostics() {
        return { enabled: this.enabled, supported: supportsNativeInstancing(this.renderer), ...this.stats,
            ...(!this.enabled ? { eligible: 0, instances: 0, batches: 0, uploadedBytes: 0, capacity: 0, updateMs: 0 } : {}),
            registered: casters.size, fallbacks: { ...this.stats.fallbacks }, scenes: this.scenes.size,
            ownedBatches: [...this.scenes.values()].reduce((n, batches) => n + batches.groups.size, 0),
            timingEnabled: this.diagnosticTiming, culling: 'Unchanged Three shadow traversal, original bounds and light frustum' };
    }
    removeScene(scene: THREE.Scene): void {
        const batches = this.scenes.get(scene);
        for (const batch of batches?.groups.values() ?? []) batch.dispose();
        batches?.depth.dispose();
        batches?.root.removeFromParent();
        this.scenes.delete(scene);
    }
    clear(): void { for (const scene of this.scenes.keys()) this.removeScene(scene); }
    dispose(): void {
        this.clear();
        if (this.renderer.shadowMap.render === this.wrappedRender) this.renderer.shadowMap.render = this.originalRender;
    }
}
