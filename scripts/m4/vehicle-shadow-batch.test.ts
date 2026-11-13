import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { VehicleShadowBatcher, registerVehicleShadowCaster, unregisterVehicleShadowCaster,
    supportsNativeInstancing } from '../../src/engine/gfx/batch/VehicleShadowBatcher';
import { installShadowOnlyPass, registerShadowOnlyMaterial, unregisterShadowOnlyMaterial }
    from '../../src/engine/gfx/ShadowOnlyMaterials';

function fixture(count = 3) {
    const scene = new THREE.Scene(), camera = new THREE.Camera(), light = new THREE.DirectionalLight();
    light.position.set(0, 100, 0); light.updateMatrixWorld();
    light.shadow.camera.left = light.shadow.camera.bottom = -200;
    light.shadow.camera.right = light.shadow.camera.top = 200;
    light.shadow.camera.updateProjectionMatrix();
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    registerShadowOnlyMaterial(material);
    const parent = new THREE.Group(); parent.position.set(12, 0, -8); parent.scale.set(1.2, .75, 2);
    scene.add(parent);
    const meshes = Array.from({ length: count }, (_, i) => {
        const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true;
        mesh.position.set(i * 2, 0, 3); mesh.rotation.set(.1, i * .12, .03);
        parent.add(mesh); registerVehicleShadowCaster(mesh); return mesh;
    });
    scene.updateMatrixWorld(true);
    let observed: THREE.Mesh[] = [], failure = false;
    const depth = new THREE.MeshDepthMaterial();
    const renderer = { getContext: () => ({ drawElementsInstanced() {}, vertexAttribDivisor() {} }),
        renderBufferDirect(_camera: any, _scene: any, _geometry: any, _material: any, mesh: THREE.Mesh) { observed.push(mesh); },
        shadowMap: { enabled: true, autoUpdate: true, needsUpdate: false, type: THREE.PCFShadowMap,
            render() {
                observed = [];
                light.shadow.updateMatrices(light);
                scene.traverseVisible(object => {
                    const mesh = object as THREE.Mesh;
                    if (mesh.isMesh && mesh.castShadow && mesh.layers.test(camera.layers) && !Array.isArray(mesh.material)
                        && mesh.material.visible && (!mesh.frustumCulled || light.shadow.getFrustum().intersectsObject(mesh))) {
                        mesh.modelViewMatrix.multiplyMatrices(light.shadow.camera.matrixWorldInverse, mesh.matrixWorld);
                        renderer.renderBufferDirect(light.shadow.camera, null, mesh.geometry, depth, mesh, null);
                    }
                });
                if (failure) throw Error('driver failure');
            } } } as unknown as THREE.WebGLRenderer;
    installShadowOnlyPass(renderer);
    const manager = new VehicleShadowBatcher(renderer);
    const render = () => { renderer.shadowMap.render([light], scene, camera); return observed; };
    const cleanup = () => {
        manager.dispose(); meshes.forEach(unregisterVehicleShadowCaster); unregisterShadowOnlyMaterial(material);
        material.dispose(); geometry.dispose(); depth.dispose();
    };
    return { scene, camera, light, geometry, material, parent, meshes, renderer, manager, render, cleanup,
        fail: () => { failure = true; } };
}

test('WebGL2 capability is independent of legacy extension availability and admission', () => {
    const f = fixture();
    try {
        expect(supportsNativeInstancing(f.renderer)).toBe(true);
        expect(supportsNativeInstancing({ getContext: () => ({}) } as any)).toBe(false);
        expect(f.manager.enabled).toBe(false);
        expect(f.render()).toEqual(f.meshes);
        expect(f.manager.diagnostics().ownedBatches).toBe(0);
    } finally { f.cleanup(); }
});

test('shadow instances preserve the original CPU model-view bytes, geometry and pass visibility', () => {
    const f = fixture();
    try {
        f.manager.enabled = true;
        const rows = f.render(); expect(rows.length).toBe(1);
        const batch = rows[0] as THREE.InstancedMesh;
        expect(batch.isInstancedMesh).toBe(true); expect(batch.count).toBe(3);
        expect(batch.geometry).toBe(f.geometry); expect(batch.parent?.visible).toBe(false);
        expect(batch.frustumCulled).toBe(false);
        for (let i = 0; i < f.meshes.length; i++) {
            const expected = new THREE.Matrix4().multiplyMatrices(f.light.shadow.camera.matrixWorldInverse, f.meshes[i].matrixWorld);
            expect(Array.from(batch.instanceMatrix.array.slice(i * 16, i * 16 + 16))).toEqual(expected.elements.map(Math.fround));
        }
        expect(f.meshes.every(mesh => mesh.castShadow)).toBe(true); expect(f.material.visible).toBe(false);
        expect(f.manager.diagnostics().instances).toBe(3);
    } finally { f.cleanup(); }
});

test('source culling, parent visibility, layers, Original, custom depth and clipping retain safe fallbacks', () => {
    const f = fixture(7), custom = new THREE.MeshDepthMaterial(), original = new THREE.MeshBasicMaterial();
    try {
        f.manager.enabled = true;
        f.meshes[0].customDepthMaterial = custom;
        f.meshes[1].material = original;
        f.meshes[2].layers.set(2);
        f.meshes[3].visible = false;
        f.meshes[4].scale.x = -1;
        f.meshes[5].position.x = 10000;
        f.scene.updateMatrixWorld(true); f.render();
        const state = f.manager.diagnostics();
        expect(state.instances).toBe(1); expect(state.fallbacks['custom-depth']).toBe(1);
        expect(state.fallbacks['original-colour']).toBe(1); expect(state.fallbacks.transform).toBe(1);
        f.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]; f.render();
        expect(f.manager.diagnostics().instances).toBe(0);
        expect(f.manager.diagnostics().fallbacks['clipping-planes']).toBeGreaterThan(0);
        f.parent.visible = false; f.render(); expect(f.manager.diagnostics().instances).toBe(0);
    } finally { f.cleanup(); custom.dispose(); original.dispose(); }
});

test('deletion, slot reuse, growth and scene teardown release owned resources without disposing shared geometry', () => {
    const f = fixture(35);
    let geometryDisposals = 0;
    f.geometry.addEventListener('dispose', () => geometryDisposals++);
    try {
        f.manager.enabled = true;
        const batch = f.render()[0] as THREE.InstancedMesh;
        expect(batch.count).toBe(35); expect(batch.instanceMatrix.count).toBe(64);
        expect(f.manager.diagnostics().growths).toBe(2);
        f.meshes[10].removeFromParent(); unregisterVehicleShadowCaster(f.meshes[10]);
        expect((f.render()[0] as THREE.InstancedMesh).count).toBe(34);
        f.parent.add(f.meshes[10]); registerVehicleShadowCaster(f.meshes[10]); f.scene.updateMatrixWorld(true);
        expect((f.render()[0] as THREE.InstancedMesh).count).toBe(35);
        expect(f.manager.diagnostics().growths).toBe(2);
        let matrixDisposals = 0, materialDisposals = 0, depthDisposals = 0;
        batch.addEventListener('dispose', () => matrixDisposals++);
        (batch.material as THREE.Material).addEventListener('dispose', () => materialDisposals++);
        batch.customDepthMaterial!.addEventListener('dispose', () => depthDisposals++);
        f.manager.removeScene(f.scene);
        expect([matrixDisposals, materialDisposals, depthDisposals, geometryDisposals]).toEqual([1, 1, 1, 0]);
        expect(f.manager.diagnostics().ownedBatches).toBe(0);
        f.render(); expect(f.manager.diagnostics().instances).toBe(35);
        expect(geometryDisposals).toBe(0);
    } finally { f.cleanup(); }
});

test('exceptions restore every caster and hidden material, and unsupported passes retain original draws', () => {
    const f = fixture();
    try {
        f.manager.enabled = true; f.renderer.shadowMap.type = THREE.VSMShadowMap;
        expect(f.render()).toEqual(f.meshes); expect(f.manager.diagnostics().fallbacks['shadow-pass']).toBe(1);
        f.renderer.shadowMap.type = THREE.PCFShadowMap; f.fail();
        expect(() => f.render()).toThrow('driver failure');
        expect(f.meshes.every(mesh => mesh.castShadow)).toBe(true); expect(f.material.visible).toBe(false);
        expect(f.scene.children.filter(o => o.name === 'vehicle-native-shadow-batches').every(o => !o.visible)).toBe(true);
    } finally { f.cleanup(); }
});

test('geometry batches share one depth owner through retirement and release it once on scene exit', () => {
    const f = fixture(), other = new THREE.BoxGeometry(2, 2, 2);
    try {
        f.meshes[1].geometry = other; f.manager.enabled = true;
        const rows = f.render(); expect(rows.length).toBe(2);
        expect(rows[0].customDepthMaterial).toBe(rows[1].customDepthMaterial);
        let disposed = 0;
        rows[0].customDepthMaterial!.addEventListener('dispose', () => disposed++);
        f.meshes[1].removeFromParent(); unregisterVehicleShadowCaster(f.meshes[1]);
        for (let i = 0; i < 122; i++) f.render();
        expect(f.manager.diagnostics().ownedBatches).toBe(1); expect(disposed).toBe(0);
        f.manager.removeScene(f.scene); expect(disposed).toBe(1);
    } finally { f.cleanup(); other.dispose(); }
});

test('overlapping accepted renderers retain caster registration until the last owner releases it', () => {
    const f = fixture();
    try {
        registerVehicleShadowCaster(f.meshes[0]); unregisterVehicleShadowCaster(f.meshes[0]);
        f.manager.enabled = true; f.render(); expect(f.manager.diagnostics().instances).toBe(3);
    } finally { f.cleanup(); }
});
