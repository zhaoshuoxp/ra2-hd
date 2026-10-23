import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { RhinoShadow } from '../../src/engine/renderable/rhino/RhinoShadow';

test('Rhino shadow coverage is private, reversible and does not mutate native caster settings', () => {
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
    const meshes = Array.from({ length: 3 }, () => new THREE.Mesh(geometry, material));
    const nativeDepth = new THREE.MeshDepthMaterial();
    meshes[1].customDepthMaterial = nativeDepth;
    meshes[0].castShadow = true;
    const other = new RhinoShadow([new THREE.Mesh(geometry, material)]);
    const shadow = new RhinoShadow(meshes);
    let disposed = 0;
    shadow.material.addEventListener('dispose', () => disposed++);
    for (const opacity of [0, 0.25, 0.5, 0.75]) {
        shadow.update(true, opacity);
        expect(shadow.opacity.value).toBe(opacity);
        expect(meshes.every(m => m.customDepthMaterial === shadow.material)).toBe(true);
        expect(other.opacity.value).toBe(1);
        shadow.update(false, opacity);
        expect(meshes.map(m => m.customDepthMaterial)).toEqual([undefined, nativeDepth, undefined]);
    }
    shadow.update(true, 1);
    expect(meshes.map(m => m.customDepthMaterial)).toEqual([undefined, nativeDepth, undefined]);
    shadow.update(true, 0.5);
    shadow.dispose();
    expect(disposed).toBe(1);
    expect(meshes.map(m => m.customDepthMaterial)).toEqual([undefined, nativeDepth, undefined]);
    expect(meshes.map(m => m.castShadow)).toEqual([true, false, false]);
    expect(meshes.every(m => m.material === material)).toBe(true);
    other.dispose(); nativeDepth.dispose(); geometry.dispose(); material.dispose();
});
