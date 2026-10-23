await import('./browser-test-setup');
import { expect, test } from 'bun:test';
import * as THREE from 'three';
const { HdSpriteMaterial } = await import('../../src/engine/gfx/material/HdSpriteMaterial');
const { HdSpriteProgramWarmup } = await import('../../src/engine/gfx/batch/HdSpriteProgramWarmup');
const { Renderer } = await import('../../src/engine/gfx/Renderer');

function fixture(indexedCoverage = false) {
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const palette = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const remapMap = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const material = new HdSpriteMaterial({ map, palette, remapMap, indexedCoverage });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    return { scene, material, textures: [map, palette, remapMap] };
}

test('Original indexed coverage does not create RGBA program owners', () => {
    expect(HdSpriteProgramWarmup.create(new THREE.Scene())).toBeUndefined();
    expect(HdSpriteProgramWarmup.create(fixture(true).scene)).toBeUndefined();
});

test('fixed-color HD without a remap texture still seeds the same shader variant', () => {
    const { scene, material } = fixture(); material.uniforms.remapMap.value = null;
    const warmup = HdSpriteProgramWarmup.create(scene)!;
    expect(warmup.mesh).toBeDefined();
    expect((warmup.mesh.material as HdSpriteMaterial).uniforms.remapMap.value).toBeNull();
    warmup.dispose();
});

test('warmup borrows textures and holds only the detached measured opaque/coverage pair', async () => {
    const { scene, textures, material } = fixture();
    let textureDisposals = 0; textures.forEach(texture => texture.addEventListener('dispose', () => textureDisposals++));
    const warmup = HdSpriteProgramWarmup.create(scene)!;
    expect(warmup.mesh.parent).toBeNull(); expect(scene.children).toHaveLength(1);
    expect(warmup.mesh.children).toHaveLength(1); expect(warmup.mesh.maxInstances).toBe(1);
    const materials = [warmup.mesh.material, (warmup.mesh.children[0] as THREE.Mesh).material] as HdSpriteMaterial[];
    expect(materials.map(value => value.uniforms.hdPass.value)).toEqual([1, 2]);
    expect(materials[1].forceSinglePass).toBe(true);
    for (const value of materials) {
        expect(value.map).toBe(textures[0]); expect(value.palette).toBe(textures[1]);
        expect(value.uniforms.remapMap.value).toBe(textures[2]);
        expect(value.defines).toEqual({ VERTEX_PALETTE_OFFSET: '', USE_VERTEX_COLOR_MULT: '' });
    }
    const events: string[] = [];
    const renderer = { compileAsync: async (mesh, camera, target) => {
        expect(mesh).toBe(warmup.mesh); expect(target).toBe(scene);
        await Promise.resolve(); events.push('compile-complete');
    }, properties: { get: value => {
        expect(materials).toContain(value);
        return { currentProgram: { getUniforms: () => events.push('first-use-validation') } };
    } } } as unknown as THREE.WebGLRenderer;
    await warmup.prepare(renderer, new THREE.Camera(), scene);
    expect(events).toEqual(['compile-complete', 'first-use-validation', 'first-use-validation']);
    let ownersReleased = 0; materials.forEach(value => value.addEventListener('dispose', () => ownersReleased++));
    warmup.dispose(); expect(ownersReleased).toBe(2); expect(textureDisposals).toBe(0);
    expect(scene.children[0].material).toBe(material); expect(scene.children).toHaveLength(1);
});

test('scene preparation awaits validation, retains owners once, and releases them on exit or failure', async () => {
    const { scene } = fixture(); const calls: THREE.Object3D[] = []; const releases: number[] = [];
    const world = { scene, camera: new THREE.Camera(), update: delta => expect(delta).toBe(0) };
    const renderer = Object.create(Renderer.prototype) as any;
    renderer.scenes = new Set(); renderer.hdProgramWarmups = new Map(); renderer.paletteProgramWarmups = new Map();
    renderer.combatProgramWarmups = new Map();
    renderer.renderer = { compileAsync: async object => {
        calls.push(object);
        if (object !== scene) object.traverse(mesh => mesh.material?.addEventListener('dispose', () => releases.push(mesh.id)));
    }, properties: { get: () => ({ currentProgram: { getUniforms: () => {} } }) } };
    await renderer.prepareScene(world); await renderer.prepareScene(world);
    expect(calls.filter(object => object !== scene)).toHaveLength(3);
    expect(renderer.paletteProgramWarmups.size).toBe(1);
    expect(renderer.hdProgramWarmups.size).toBe(1); expect(releases).toHaveLength(0);
    renderer.removeScene(world); renderer.removeScene(world);
    expect(renderer.hdProgramWarmups.size).toBe(0); expect(releases).toHaveLength(12);
    expect(renderer.paletteProgramWarmups.size).toBe(0);
    renderer.scenes.add(world);
    renderer.renderer.properties.get = () => { throw Error('shader validation failure'); };
    await expect(renderer.prepareScene(world)).rejects.toThrow('shader validation failure');
    expect(renderer.hdProgramWarmups.size).toBe(0); expect(releases).toHaveLength(14);
});

test('scene exit during loading releases pending owners instead of retaining an orphan', async () => {
    const { scene } = fixture(); const world = { scene, camera: new THREE.Camera(), update: () => {} };
    let finish!: () => void, entered!: () => void, released = 0, cancelled = false;
    const compiling = new Promise<void>(resolve => entered = resolve);
    const renderer = Object.create(Renderer.prototype) as any;
    renderer.scenes = new Set([world]); renderer.hdProgramWarmups = new Map(); renderer.paletteProgramWarmups = new Map();
    renderer.combatProgramWarmups = new Map();
    renderer.renderer = { compileAsync: async object => {
        if (object === scene) return;
        object.traverse(mesh => mesh.material?.addEventListener('dispose', () => released++));
        entered(); await new Promise<void>(resolve => finish = resolve);
    }, properties: { get: () => ({ currentProgram: { getUniforms: () => {} } }) } };
    const preparation = renderer.prepareScene(world, () => cancelled); await compiling;
    cancelled = true; renderer.removeScene(world); finish(); await preparation;
    expect(renderer.hdProgramWarmups.size).toBe(0); expect(released).toBe(2);
});

test('renderer shutdown and context replacement clear all owners before releasing the old renderer', async () => {
    for (const action of ['dispose', 'handleContextRestored']) {
        const { scene } = fixture(); const world = { scene, camera: new THREE.Camera(), update: () => {} };
        const renderer = new Renderer(1, 1) as any; renderer.scenes.add(world);
        let released = 0, oldRendererDisposed = 0;
        const glRenderer = { domElement: { remove: () => {}, removeEventListener: () => {} },
            compileAsync: async object => {
                if (object !== scene) object.traverse(mesh => mesh.material?.addEventListener('dispose', () => released++));
            }, properties: { get: () => ({ currentProgram: { getUniforms: () => {} } }) },
            dispose: () => { expect(released).toBe(12); oldRendererDisposed++; } };
        renderer.renderer = glRenderer; renderer.createGlRenderer = () => ({ restored: true });
        await renderer.prepareScene(world); renderer[action]();
        expect(renderer.hdProgramWarmups.size).toBe(0); expect(oldRendererDisposed).toBe(1);
        if (action === 'handleContextRestored') expect(renderer.renderer.restored).toBe(true);
    }
});
