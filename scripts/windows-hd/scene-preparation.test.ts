await import('./browser-test-setup');
import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Renderer } from '../../src/engine/gfx/Renderer';

test('parallel scene compilation keeps pending batch materials alive while the loading UI advances', async () => {
    const renderer = new Renderer(1, 1) as any;
    const material = new THREE.MeshBasicMaterial();
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    let updates = 0, releases = 0, uiUpdates = 0, uiDraws = 0;
    material.addEventListener('dispose', () => releases++);
    const world = { scene, camera: new THREE.Camera(), viewport: { x: 0, y: 0, width: 1, height: 1 },
        update: () => { if (updates++) material.dispose(); } };
    const ui = { ...world, scene: new THREE.Scene(), update: () => uiUpdates++ };
    renderer.scenes = new Set([world, ui]);
    let finish!: () => void;
    renderer.renderer = { compileAsync: async () => new Promise<void>(resolve => finish = resolve),
        state: { buffers: { depth: { setMask: () => {} } } }, clear: () => {}, clearDepth: () => {},
        setViewport: () => {}, render: object => { expect(object).toBe(ui.scene); uiDraws++; } };
    renderer.lastDeviceRatio = window.devicePixelRatio;
    const preparing = renderer.prepareScene(world);
    renderer.update(16); renderer.render(); renderer.update(32); renderer.render();
    expect(updates).toBe(1); expect(releases).toBe(0); expect(uiUpdates).toBe(2); expect(uiDraws).toBe(2);
    finish(); await preparing;
    renderer.update(48); expect(updates).toBe(2); expect(releases).toBe(1);
});

test('failed scene compilation releases the preparation gate for normal recovery', async () => {
    const renderer = new Renderer(1, 1) as any;
    let updates = 0;
    const world = { scene: new THREE.Scene(), camera: new THREE.Camera(), update: () => updates++ };
    renderer.scenes = new Set([world]);
    renderer.renderer = { compileAsync: async () => { throw new Error('shader failure'); } };
    await expect(renderer.prepareScene(world)).rejects.toThrow('shader failure');
    renderer.update(16); expect(updates).toBe(2); expect(renderer.preparingScenes.size).toBe(0);
});

test('actual renderer bindings settle before their replacement materials enter parallel compilation', async () => {
    const renderer = new Renderer(1, 1) as any, scene = new THREE.Scene();
    const original = new THREE.MeshBasicMaterial(), replacement = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), original); scene.add(mesh);
    let updates = 0, releases = 0, finish!: () => void;
    original.addEventListener('dispose', () => releases++);
    const world = { scene, camera: new THREE.Camera(), update: () => updates++ };
    renderer.scenes = new Set([world]);
    renderer.renderer = { compileAsync: async () => {
        expect(mesh.material).toBe(replacement); expect(releases).toBe(1); expect(updates).toBe(2);
        await Promise.resolve(); expect(mesh.material).toBe(replacement);
    } };
    const settling = renderer.prepareScene(world, () => false, async () => {
        await new Promise<void>(resolve => finish = resolve);
        original.dispose(); mesh.material = replacement;
    });
    renderer.update(16); expect(updates).toBe(1); expect(releases).toBe(0);
    finish(); await settling;
    expect(renderer.preparingScenes.size).toBe(0);
});

test('exit while initial HD bindings settle skips scene compilation and clears its gate', async () => {
    const renderer = new Renderer(1, 1) as any;
    let updates = 0, cancelled = false;
    const world = { scene: new THREE.Scene(), camera: new THREE.Camera(), update: () => updates++ };
    renderer.renderer = { compileAsync: async () => { throw Error('Cancelled scene must not compile'); } };
    await renderer.prepareScene(world, () => cancelled, async () => { cancelled = true; });
    expect(updates).toBe(1); expect(renderer.preparingScenes.size).toBe(0);
});
