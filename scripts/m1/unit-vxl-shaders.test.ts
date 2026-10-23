import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Coords } from '../../src/game/Coords';
import { warmVxlShaders } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { vxlUnitIdentities } from '../../desktop/hd-profile.mjs';

const local = test;
function family(identity: string) {
    const manifest = JSON.parse(readFileSync(`${resourceRoot}/` + vxlUnitIdentities[identity].path, 'utf8'));
    return { identity, dispose() {}, parts: manifest.parts.map((part: any) => ({ ...part,
        override: { pages: [{ base: new THREE.DataTexture(new Uint8Array(4), 1, 1), data: new THREE.DataTexture(new Uint8Array(4), 1, 1) }] },
    })) };
}

local('accepted VXL families compile native geometry and all coverage programs without replacing atlas pages', async () => {
    for (const identity of Object.keys(vxlUnitIdentities)) {
        const value = family(identity), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>();
        const atlas = value.parts.flatMap((part: any) => [part.override.pages[0].base, part.override.pages[0].data]);
        let releasedMaterials = 0, releasedGeometries = 0, releasedAtlas = 0;
        for (const texture of atlas) texture.addEventListener('dispose', () => releasedAtlas++);
        const renderer = { compileAsync: async (scene: THREE.Scene, camera: THREE.Camera) => {
            expect(camera.rotation.x).toBe(-Coords.ISO_CAMERA_ALPHA);
            expect(camera.rotation.y).toBe(Coords.ISO_CAMERA_BETA);
            scene.traverse(object => {
                if (!(object instanceof THREE.Mesh)) return;
                const geometry = object.geometry, material = object.material as any;
                const positions = geometry.getAttribute('position');
                expect(positions.count).toBeGreaterThan(0);
                expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
                expect(atlas.includes(material.map)).toBe(true);
                expect(object.visible && object.parent?.visible).toBe(false);
                materials.add(material); geometries.add(geometry);
            });
            const keys = [...materials].map(material => material.customProgramCacheKey());
            if (identity === 'YTNK') expect(keys.some(key => key.includes('/gattling-face-spin-v1'))).toBe(true);
            if (identity === 'DISK') expect([...materials].some((material: any) => material.uniforms.discPhase)).toBe(true);
            if (identity === 'SHAD' || identity === 'V3')
                expect([...materials].some(material => material.side === THREE.DoubleSide)).toBe(true);
            for (const material of materials) material.addEventListener('dispose', () => releasedMaterials++);
            for (const geometry of geometries) geometry.addEventListener('dispose', () => releasedGeometries++);
        } } as unknown as THREE.WebGLRenderer;
        const release = await warmVxlShaders(value, renderer);
        expect(releasedMaterials).toBe(0);
        expect(releasedGeometries).toBe(0);
        release();
        expect(releasedMaterials).toBe(materials.size);
        expect(releasedGeometries).toBe(geometries.size);
        expect(releasedAtlas).toBe(0);
    }
});

local('failed compilation releases detached coverage programs while preserving family textures', async () => {
    const value = family('YTNK'), materials = new Set<THREE.Material>();
    let released = 0;
    const renderer = { compileAsync: async (scene: THREE.Scene) => {
        scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            materials.add(object.material as THREE.Material);
        });
        for (const material of materials) material.addEventListener('dispose', () => released++);
        throw Error('context unavailable');
    } } as unknown as THREE.WebGLRenderer;
    await expect(warmVxlShaders(value, renderer)).rejects.toThrow('context unavailable');
    expect(released).toBe(materials.size);
});
