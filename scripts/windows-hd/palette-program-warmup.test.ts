await import('./browser-test-setup');
import { expect, test } from 'bun:test';
import * as THREE from 'three';
const { PaletteBasicMaterial } = await import('../../src/engine/gfx/material/PaletteBasicMaterial');
const { HdSpriteMaterial } = await import('../../src/engine/gfx/material/HdSpriteMaterial');
const { PaletteSpriteProgramWarmup } = await import('../../src/engine/gfx/batch/PaletteSpriteProgramWarmup');
const { Renderer } = await import('../../src/engine/gfx/Renderer');

function fixture(hd = true) {
    const map = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const palette = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const material = hd ? new HdSpriteMaterial({ map, palette }) : new PaletteBasicMaterial({ map, palette });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    return { scene, material, map, palette, camera: new THREE.Camera(), update: () => {} };
}

test('combat owners borrow artwork without altering live geometry or draw materials', async () => {
    const world = fixture(), warmup = PaletteSpriteProgramWarmup.create(world.scene)!;
    let textureDisposals = 0, releases = 0;
    for (const texture of [world.map, world.palette]) texture.addEventListener('dispose', () => textureDisposals++);
    const materials = warmup.mesh.children.map(mesh => (mesh as THREE.Mesh).material as PaletteBasicMaterial);
    expect(materials.map(material => material.side)).toEqual([THREE.BackSide, THREE.FrontSide]);
    for (const material of materials) {
        expect(material.type).toBe('PaletteBasicMaterial'); expect(material.map).toBe(world.map);
        expect(material.palette).toBe(world.palette); expect(material.alphaTest).toBe(0.05);
        expect(material.transparent).toBe(true); expect(material.clippingPlanes).toBeNull();
        expect(material.defines).toEqual({ VERTEX_PALETTE_OFFSET: '', USE_VERTEX_COLOR_MULT: '' });
        material.addEventListener('dispose', () => releases++);
    }
    expect(warmup.mesh.parent).toBeNull(); expect(world.scene.children).toHaveLength(1);
    expect((world.scene.children[0] as THREE.Mesh).material).toBe(world.material);
    const order: string[] = [];
    await warmup.prepare({ compileAsync: async () => { await Promise.resolve(); order.push('compiled'); },
        properties: { get: () => ({ currentProgram: { getUniforms: () => order.push('validated') } }) }
    } as unknown as THREE.WebGLRenderer, world.camera, world.scene);
    expect(order).toEqual(['compiled', 'validated', 'validated']);
    warmup.dispose(); expect(releases).toBe(2); expect(textureDisposals).toBe(0);
    expect(PaletteSpriteProgramWarmup.create(new THREE.Scene())).toBeUndefined();
});

function rendererFixture() {
    const renderer = new Renderer(1, 1) as any;
    renderer.renderer = { compileAsync: async () => {},
        properties: { get: () => ({ currentProgram: { getUniforms: () => {} } }) } };
    return renderer;
}

test('Original-only loading keeps its existing compile path and allocates no extra owners', async () => {
    const renderer = rendererFixture(), world = fixture(false);
    let compiles = 0; renderer.renderer.compileAsync = async () => compiles++;
    await renderer.prepareScene(world);
    expect(compiles).toBe(1); expect(renderer.hdProgramWarmups.size).toBe(0);
    expect(renderer.paletteProgramWarmups.size).toBe(0);
});

test('cancellation during combat preparation releases both pending and retained owners', async () => {
    const renderer = rendererFixture(), world = fixture();
    let finish!: () => void, entered!: () => void, cancelled = false, releases = 0;
    const waiting = new Promise<void>(resolve => entered = resolve);
    renderer.renderer.compileAsync = async object => {
        if (object === world.scene) return;
        object.traverse(mesh => mesh.material?.addEventListener('dispose', () => releases++));
        if (object instanceof THREE.Group) { entered(); await new Promise<void>(resolve => finish = resolve); }
    };
    const preparing = renderer.prepareScene(world, () => cancelled); await waiting;
    cancelled = true; renderer.removeScene(world); finish(); await preparing;
    expect(releases).toBe(4); expect(renderer.hdProgramWarmups.size).toBe(0);
    expect(renderer.paletteProgramWarmups.size).toBe(0);
});

test('combat validation failures release pending owners and scene cleanup releases earlier owners', async () => {
    const renderer = rendererFixture(), world = fixture(); let releases = 0;
    renderer.renderer.compileAsync = async object => {
        if (object !== world.scene) object.traverse(mesh => mesh.material?.addEventListener('dispose', () => releases++));
    };
    renderer.renderer.properties.get = material => ({ currentProgram: { getUniforms: () => {
        if (material.type === 'PaletteBasicMaterial') throw Error('combat validation failure');
    } } });
    await expect(renderer.prepareScene(world)).rejects.toThrow('combat validation failure');
    expect(releases).toBe(2); expect(renderer.paletteProgramWarmups.size).toBe(0);
    renderer.removeScene(world); expect(releases).toBe(4); expect(renderer.hdProgramWarmups.size).toBe(0);
});
