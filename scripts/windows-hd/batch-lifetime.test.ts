import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { MeshBatchManager } from '../../src/engine/gfx/batch/MeshBatchManager';
import { BatchedMesh, BatchMode } from '../../src/engine/gfx/batch/BatchedMesh';
import { RenderableContainer } from '../../src/engine/gfx/RenderableContainer';

for (const mode of [BatchMode.Merging, BatchMode.Instancing]) {
    test(`batch replacement detaches immediately and retains one resource generation (${mode})`, () => {
        const scene = new THREE.Scene(), source = new RenderableContainer(scene);
        const manager = new MeshBatchManager(source); manager.create3DObject();
        const geometry = new THREE.PlaneGeometry(12, 18), first = new THREE.MeshBasicMaterial();
        const mesh = new BatchedMesh(geometry, first, mode); scene.add(mesh);
        mesh.position.x = 23; scene.updateMatrixWorld(true); manager.updateMeshes();
        const oldBatch = manager.getChildren()[0], oldObject = oldBatch.get3DObject()!;
        const oldMesh = oldObject.children[0] as THREE.Mesh;
        let materialReleased = 0, geometryReleased = 0;
        (oldMesh.material as THREE.Material).addEventListener('dispose', () => materialReleased++);
        oldMesh.geometry.addEventListener('dispose', () => geometryReleased++);
        const replacement = first.clone(); mesh.material = replacement;
        mesh.position.x = 61; scene.updateMatrixWorld(true); manager.updateMeshes();
        expect(oldObject.parent).toBe(null); expect(manager.getChildren()).not.toContain(oldBatch);
        expect(manager.get3DObject()!.children).toHaveLength(1);
        expect(materialReleased).toBe(0); expect(geometryReleased).toBe(0);
        const current = manager.getChildren()[0].get3DObject()!.children[0] as THREE.Mesh;
        const position = mode === BatchMode.Merging ? current.geometry.attributes.position
            : current.geometry.attributes.instanceMatrix3;
        expect(position.getX(0)).toBe(mode === BatchMode.Merging ? 55 : 61);
        manager.updateMeshes();
        expect(materialReleased).toBe(1); expect(geometryReleased).toBe(1);
        expect(manager.get3DObject()!.children).toHaveLength(1);
        manager.dispose(); manager.dispose();
        expect(materialReleased).toBe(1); expect(geometryReleased).toBe(1);
        expect(manager.getChildren()).toHaveLength(0); expect(manager.get3DObject()!.children).toHaveLength(0);
        geometry.dispose(); first.dispose(); replacement.dispose();
    });
}

test('shutdown releases both active and retired resources exactly once without another update', () => {
    const scene = new THREE.Scene(), manager = new MeshBatchManager(new RenderableContainer(scene));
    manager.create3DObject();
    const geometry = new THREE.PlaneGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new BatchedMesh(geometry, material, BatchMode.Merging); scene.add(mesh);
    const released: number[] = [];
    for (let i = 0; i < 12; i++) {
        mesh.renderOrder = i; scene.updateMatrixWorld(true); manager.updateMeshes();
        const output = manager.getChildren()[0].get3DObject()!.children[0] as THREE.Mesh;
        released.push(0); (output.material as THREE.Material).addEventListener('dispose', () => released[i]++);
        expect(released.slice(0, -2).every(count => count === 1)).toBe(true);
        expect(released.at(-1)).toBe(0);
        if (i > 0) expect(released.at(-2)).toBe(0);
        expect(manager.get3DObject()!.children).toHaveLength(1);
    }
    manager.dispose(); manager.dispose(); expect(released).toEqual(Array(12).fill(1));
    geometry.dispose(); material.dispose();
});

test('a disappearing source container still releases the previous retired generation', () => {
    const source = new RenderableContainer(new THREE.Scene()), manager = new MeshBatchManager(source);
    manager.create3DObject(); const geometry = new THREE.PlaneGeometry(), material = new THREE.MeshBasicMaterial();
    const mesh = new BatchedMesh(geometry, material, BatchMode.Merging);
    source.get3DObject()!.add(mesh); source.get3DObject()!.updateMatrixWorld(true); manager.updateMeshes();
    let released = 0;
    (manager.getChildren()[0].get3DObject()!.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => released++);
    mesh.visible = false; manager.updateMeshes(); expect(released).toBe(0);
    source.get3DObject = () => undefined; manager.updateMeshes(); expect(released).toBe(1);
    manager.dispose(); expect(released).toBe(1); geometry.dispose(); material.dispose();
});
