import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { BatchedMesh, BatchMode } from '../../src/engine/gfx/batch/BatchedMesh';
import { MeshMergingBatch } from '../../src/engine/gfx/batch/MeshMergingBatch';
import { MergedSpriteMesh } from '../../src/engine/gfx/batch/MergedSpriteMesh';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';

function fixture(transparent = true, nearestIndexedBody = false) {
    const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    const material = new HdSpriteMaterial({ map: texture, transparent,
        embeddedShadowMap: nearestIndexedBody ? texture : undefined, nearestIndexedBody });
    const geometry = new THREE.PlaneGeometry(12, 18);
    if (nearestIndexedBody) geometry.setAttribute('shadowFrameRect',
        new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
    const mesh = new BatchedMesh(geometry, material, BatchMode.Merging);
    mesh.position.set(23, 31, 47); mesh.updateMatrixWorld(true);
    const batch = new MeshMergingBatch(4); batch.create3DObject();
    return { mesh, batch, material, release: () => {
        batch.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
    } };
}
function output(batch: MeshMergingBatch): MergedSpriteMesh {
    return batch.get3DObject()!.children[0] as MergedSpriteMesh;
}

test('hidden HD body leaves live sorted coverage and moving shared buffers across filtering toggles', () => {
    const f = fixture();
    try {
        f.batch.renderOrder = 17; f.batch.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 5)];
        f.batch.setMeshes([f.mesh]);
        const merged = output(f.batch), material = merged.material as HdSpriteMaterial;
        const coverage = merged.children[0] as THREE.Mesh;
        expect(material.visible).toBe(false); expect(merged.visible).toBe(true);
        expect(coverage.material.visible).toBe(true); expect(coverage.renderOrder).toBe(17);
        expect(coverage.geometry.attributes.position).toBe(merged.geometry.attributes.position);
        expect(coverage.geometry.attributes.hdFrameRect).toBe(merged.geometry.attributes.hdFrameRect);
        expect((coverage.material as THREE.Material).clippingPlanes).toBe(material.clippingPlanes);
        const initialX = merged.geometry.attributes.position.getX(0);
        for (const filtering of [false, true, false, true]) {
            material.uniforms.hdFiltering.value = filtering;
            f.mesh.position.x += 10; f.mesh.updateMatrixWorld(true); f.batch.setMeshes([f.mesh]);
            expect(material.visible).toBe(!filtering);
            expect((coverage.material as HdSpriteMaterial).uniforms.hdFiltering.value).toBe(filtering);
            const reachable: THREE.Object3D[] = []; merged.traverseVisible(object => reachable.push(object));
            expect(reachable).toContain(coverage); expect(coverage.material.visible).toBe(true);
            expect(coverage.geometry.attributes.position.getX(0)).toBeGreaterThan(initialX);
            expect(merged.geometry.drawRange.count).toBe(f.mesh.geometry.index!.count);
        }
    } finally { f.release(); }
});

test('preconfigured and changed shadow casters retain their body before rendering', () => {
    const f = fixture();
    try {
        f.batch.castShadow = true; f.batch.setMeshes([f.mesh]);
        const merged = output(f.batch), material = merged.material as HdSpriteMaterial;
        expect(merged.castShadow).toBe(true); expect(material.visible).toBe(true);
        f.batch.castShadow = false; f.batch.setMeshes([f.mesh]); expect(material.visible).toBe(false);
        f.batch.castShadow = true; f.batch.setMeshes([f.mesh]); expect(material.visible).toBe(true);
    } finally { f.release(); }
});

test('opaque HD bodies and Original nearest infantry remain renderable', () => {
    for (const [transparent, nearest] of [[false, false], [true, true]]) {
        const f = fixture(transparent, nearest);
        try {
            f.batch.setMeshes([f.mesh]); const merged = output(f.batch);
            expect(merged.material.visible).toBe(true);
            expect((merged.material as HdSpriteMaterial).uniforms.hdPass.value).not.toBe(0);
            if (nearest) expect(merged.children).toHaveLength(0);
            else expect(merged.children).toHaveLength(1);
        } finally { f.release(); }
    }
});
