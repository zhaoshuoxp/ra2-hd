import { expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { uiArt } from '../../src/gui/hd/UiArt';
import { UiArtSpriteBuilder } from '../../src/gui/hd/UiArtSpriteBuilder';
import { UiObjectSprite } from '../../src/gui/UiObjectSprite';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';

test('Allied repeated rails use a seamless strip at retail registration and fall back cleanly', () => {
    const savedManifest = (uiArt as any).manifest, savedEnabled = (uiArt as any).readEnabled;
    let enabled = true, released = 0;
    (uiArt as any).manifest = { revision: 'bar', assets: [{ id: 'allied-bttnbkgd', logicalWidth: 52, logicalHeight: 32 }] };
    (uiArt as any).readEnabled = () => enabled;
    const texture = new THREE.Texture({ width: 208, height: 128 } as any);
    const options = { camera: new THREE.PerspectiveCamera(), texture,
        textureArea: { x: 0, y: 0, width: 52, height: 32 }, align: { x: 1, y: -1 } };
    const original = new THREE.Mesh(SpriteUtils.createSpriteGeometry(options), new THREE.MeshBasicMaterial());
    const native = { build: () => original, getFrame: () => 0, setFrame: () => {}, getSpriteGeometryOptions: () => options,
        dispose: () => {}, getSize: () => ({ width: 52, height: 32 }) };
    const acquire = spyOn(uiArt, 'acquire').mockImplementation((_id, ready) => {
        ready({ bitmap: { width: 208, height: 128 } as ImageBitmap, texture, bytes: 208 * 128 * 4 });
        return () => { released++; };
    });
    const builder = new UiArtSpriteBuilder(native, [{ id: 'allied-bttnbkgd', width: 52, height: 32 }],
        { getImage: () => ({ x: 0, y: 0 }) });
    try {
        const group = builder.build(), overlay = group.children[1] as THREE.Mesh;
        const uv = overlay.geometry.getAttribute('uv');
        const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
        expect(Math.min(...us)).toBeCloseTo(0.5);
        expect(Math.max(...us)).toBeCloseTo(27 / 52);
        expect(Array.from(overlay.geometry.getAttribute('position').array))
            .toEqual(Array.from(original.geometry.getAttribute('position').array));
        expect(overlay.position.y).toBe(2);
        expect(original.visible).toBe(true);
        enabled = false;
        builder.setFrame(0);
        expect(builder.isHdActive).toBe(false);
        expect(group.children).toEqual([original]);
        expect(original.visible).toBe(true);
        expect(released).toBe(1);
    } finally {
        builder.dispose(); acquire.mockRestore(); texture.dispose();
        original.geometry.dispose(); original.material.dispose();
        (uiArt as any).manifest = savedManifest; (uiArt as any).readEnabled = savedEnabled;
    }
});

test('fractional command-bar span scales integral pixels without changing its vertical anchor', () => {
    const geometry = new THREE.PlaneGeometry(52, 32), material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const sprite = new UiObjectSprite({ build: () => mesh, dispose: () => {} });
    const remainder = 29.379310344827672;
    sprite.setPosition(1016, 868);
    sprite.setHorizontalScale(remainder / 52);
    sprite.create3DObject();
    mesh.updateMatrixWorld(true);
    expect(mesh.matrixWorld.elements[0] * 52).toBeCloseTo(remainder, 10);
    expect(mesh.matrixWorld.elements[5]).toBe(1);
    expect(mesh.position.y).toBe(868);
    expect(geometry.getAttribute('position').count).toBe(4);
    sprite.setHorizontalScale(1);
    expect(mesh.scale.x).toBe(1);
    sprite.destroy(); geometry.dispose(); material.dispose();
});

test('Allied command icons exclude their background rails in every native frame', () => {
    const savedManifest = (uiArt as any).manifest, savedEnabled = (uiArt as any).readEnabled;
    (uiArt as any).manifest = { revision: 'icons', assets: [{ id: 'allied-button00', logicalWidth: 156, logicalHeight: 32 }] };
    (uiArt as any).readEnabled = () => true;
    const texture = new THREE.Texture({ width: 624, height: 128 } as any);
    const options = { camera: new THREE.PerspectiveCamera(), texture,
        textureArea: { x: 0, y: 0, width: 52, height: 32 }, align: { x: 1, y: -1 } };
    const original = new THREE.Mesh(SpriteUtils.createSpriteGeometry(options), new THREE.MeshBasicMaterial());
    const pixels = new Uint8Array(52 * 32);
    for (let y = 8; y < 24; y++) for (let x = 12; x < 40; x++) pixels[y * 52 + x] = 1;
    let frame = 0;
    const native = { build: () => original, getFrame: () => frame, setFrame: (f: number) => { frame = f; },
        getSpriteGeometryOptions: () => options, dispose: () => {} };
    const palette = { getColor: (index: number) => index ? { r: 24, g: 120, b: 240 } : { r: 0, g: 0, b: 0 } };
    const acquire = spyOn(uiArt, 'acquire').mockImplementation((_id, ready) => {
        ready({ bitmap: { width: 624, height: 128 } as ImageBitmap, texture, bytes: 624 * 128 * 4 });
        return () => {};
    });
    const builder = new UiArtSpriteBuilder(native, [0, 1, 2].map(i => ({ id: 'allied-button00', width: 52, height: 32,
        atlas: { width: 156, height: 32, x: i * 52, y: 0 } })),
        { getImage: () => ({ x: 0, y: 0, width: 52, height: 32, imageData: pixels }) }, palette as any);
    try {
        const group = builder.build();
        for (let i = 0; i < 3; i++) {
            builder.setFrame(i);
            const material = (group.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;
            const shader = { uniforms: {}, fragmentShader: '#include <map_fragment>' } as any;
            material.onBeforeCompile(shader, {} as any);
            const clip = shader.uniforms.commandIconClip.value;
            expect(clip.x).toBeCloseTo((52 * i + 11) / 156);
            expect(clip.z).toBeCloseTo((52 * i + 41) / 156);
            expect(clip.y).toBeCloseTo(7 / 32);
            expect(clip.w).toBeCloseTo(25 / 32);
            expect(shader.fragmentShader).toContain('discard');
            expect(original.visible).toBe(false);
        }
    } finally {
        builder.dispose(); acquire.mockRestore(); texture.dispose(); original.geometry.dispose(); original.material.dispose();
        (uiArt as any).manifest = savedManifest; (uiArt as any).readEnabled = savedEnabled;
    }
});
