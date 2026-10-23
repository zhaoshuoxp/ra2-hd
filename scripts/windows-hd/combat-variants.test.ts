await import('./browser-test-setup');
import { expect, test } from 'bun:test';
import * as THREE from 'three';
const { CombatProgramWarmup } = await import('../../src/engine/gfx/batch/CombatProgramWarmup');
const { HdSpriteMaterial } = await import('../../src/engine/gfx/material/HdSpriteMaterial');
const { Renderer } = await import('../../src/engine/gfx/Renderer');

function fixture() {
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const palette = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const material = new HdSpriteMaterial({ map, palette });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    return { scene, map, palette, material, camera: new THREE.Camera(), update: () => {} };
}

test('eight detached Windows variants borrow textures, preserve live art, and release once', async () => {
    const world = fixture(), owner = CombatProgramWarmup.create(world.scene)!;
    const materials: THREE.Material[] = []; let released = 0, geometryReleased = 0, texturesReleased = 0;
    owner.mesh.traverse((object: any) => {
        if (object.material) {
            materials.push(object.material);
            object.material.addEventListener('dispose', () => released++);
            object.geometry.addEventListener('dispose', () => geometryReleased++);
        }
    });
    [world.map, world.palette].forEach(value => value.addEventListener('dispose', () => texturesReleased++));
    expect(owner.mesh.parent).toBeNull(); expect(materials).toHaveLength(8);
    const hd = materials.slice(0, 7) as HdSpriteMaterial[];
    expect(hd.map(value => value.uniforms.hdPass.value)).toEqual([1, 2, 3, 1, 2, 1, 2]);
    expect(hd.map(value => value.customProgramCacheKey())).toEqual([
        'm15-sprite-coverage-v2/lossless-remap-tiles-v1/lossless-tiles-v1',
        'm15-sprite-coverage-v2/lossless-remap-tiles-v1/lossless-tiles-v1',
        'm15-sprite-coverage-v2/embedded-shadow-v1',
        'm15-sprite-coverage-v2/embedded-shadow-v1',
        'm15-sprite-coverage-v2/embedded-shadow-v1',
        'm15-sprite-coverage-v2/lossless-tiles-v1/embedded-shadow-v1',
        'm15-sprite-coverage-v2/lossless-tiles-v1/embedded-shadow-v1']);
    expect(hd[2].defines).toEqual({ INDEXED_COVERAGE: '', EMBEDDED_SHP_SHADOW: '',
        NEAREST_INDEXED_BODY: '', VERTEX_PALETTE_OFFSET: '', USE_VERTEX_COLOR_MULT: '' });
    // Untiled HD page with an embedded shadow: batched opaque body plus sorted coverage.
    for (const value of hd.slice(3, 5)) expect(value.defines).toEqual({ EMBEDDED_SHP_SHADOW: '',
        VERTEX_PALETTE_OFFSET: '', USE_VERTEX_COLOR_MULT: '' });
    // Pooled-tile HD page (lookup tiles, untiled remap) with an embedded shadow.
    for (const value of hd.slice(5)) expect(value.defines).toEqual({ EMBEDDED_SHP_SHADOW: '', HD_TILE_POOL: '',
        VERTEX_PALETTE_OFFSET: '', USE_VERTEX_COLOR_MULT: '' });
    expect(hd.map(value => value.alphaTest)).toEqual([0.05, 0.001, 0.001, 0.05, 0.001, 0.05, 0.001]);
    expect(hd.map(value => value.transparent)).toEqual([false, true, false, false, true, false, true]);
    const smoke = materials[7] as THREE.ShaderMaterial;
    expect(smoke.uniforms.particleTexture.value).toBe(world.map);
    expect(smoke.defines.SHOULD_CALCULATE_SPRITE).toBe(true);
    expect(smoke.defines.HAS_PERSPECTIVE).toBe(false);
    let validated = 0;
    await owner.prepare({ compileAsync: async () => {}, properties: { get: () =>
        ({ currentProgram: { getUniforms: () => validated++ } }) } } as any, world.camera, world.scene);
    expect(validated).toBe(8);
    owner.dispose(); owner.dispose(); expect(released).toBe(8); expect(geometryReleased).toBe(8);
    expect(texturesReleased).toBe(0); expect(world.scene.children).toHaveLength(1);
    expect((world.scene.children[0] as THREE.Mesh).material).toBe(world.material);
    expect(CombatProgramWarmup.create(new THREE.Scene())).toBeUndefined();
});

test('cancellation and validation failure release pending variants; earlier owners remain scene-owned', async () => {
    for (const failure of [false, true]) {
        const renderer = new Renderer(1, 1) as any, world = fixture();
        let groups = 0, cancelled = false, releases = 0;
        renderer.renderer = { compileAsync: async object => {
            if (object === world.scene) return;
            object.traverse(mesh => mesh.material?.addEventListener('dispose', () => releases++));
            if (object instanceof THREE.Group && ++groups === 2 && !failure) cancelled = true;
        }, properties: { get: material => ({ currentProgram: { getUniforms: () => {
            if (failure && material.type === 'ShaderMaterial') throw Error('smoke validation failure');
        } } }) } };
        if (failure) await expect(renderer.prepareScene(world)).rejects.toThrow('smoke validation failure');
        else await renderer.prepareScene(world, () => cancelled);
        expect(renderer.combatProgramWarmups.size).toBe(0); expect(releases).toBe(8);
        renderer.removeScene(world); renderer.removeScene(world); expect(releases).toBe(12);
        expect(renderer.hdProgramWarmups.size).toBe(0); expect(renderer.paletteProgramWarmups.size).toBe(0);
    }
});
