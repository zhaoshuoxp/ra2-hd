import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { updateSceneMatrices } from '../../src/engine/gfx/SceneMatrices';
import { setCachedMeshVisibility } from '../../src/engine/gfx/CachedMeshVisibility';
import { WorldScene } from '../../src/engine/renderable/WorldScene';
import { UiScene } from '../../src/gui/UiScene';
import { BoxedVar } from '../../src/util/BoxedVar';
import { ShadowQuality } from '../../src/engine/renderable/entity/unit/ShadowQuality';
import { RenderableContainer } from '../../src/engine/gfx/RenderableContainer';
import { MeshBatchManager } from '../../src/engine/gfx/batch/MeshBatchManager';
import { BatchedMesh, BatchMode } from '../../src/engine/gfx/batch/BatchedMesh';

test('manual world updates preserve translated roots, moving joints and camera listeners before batching', () => {
    const world = WorldScene.factory({ x: 0, y: 0, width: 800, height: 600 },
        new BoxedVar(false), new BoxedVar(ShadowQuality.Off));
    world.create3DObject();
    const joint = new THREE.Group(), child = new THREE.Object3D();
    child.position.set(7, 2, 5); joint.add(child); world.scene.add(joint);
    world.onCameraUpdate.subscribe(() => { joint.position.x += 10; joint.rotation.y += 0.25; });
    for (let i = 0; i < 3; i++) {
        world.update(16);
        const expected = world.scene.matrix.clone().multiply(joint.matrix).multiply(child.matrix);
        expect(child.matrixWorld.elements).toEqual(expected.elements);
        expect(world.scene.matrixWorld.elements).toEqual(world.scene.matrix.elements);
        expect(world.scene.matrixWorldAutoUpdate).toBe(false);
        expect(child.matrixWorldAutoUpdate).toBe(true);
    }
    world.dispose();
});

test('manual UI updates preserve root placement, sprite scale and changes after the first frame', () => {
    const ui = UiScene.factory({ x: 10, y: 20, width: 800, height: 600 });
    ui.getHtmlContainer()!.render = () => {};
    ui.create3DObject();
    const child = new THREE.Object3D(); ui.getScene().add(child);
    for (let i = 1; i <= 3; i++) {
        ui.setPosition(i * 11, i * 13); child.position.set(i, 2 * i, 0); child.scale.setScalar(i);
        ui.update(16);
        const expected = ui.getScene().matrix.clone().multiply(child.matrix);
        expect(child.matrixWorld.elements).toEqual(expected.elements);
        expect(ui.getScene().matrixWorldAutoUpdate).toBe(false);
    }
    ui.destroy();
});

test('new instancing batches have current transforms and instance data without a renderer matrix pass', () => {
    const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
    const container = new RenderableContainer(scene), batches = new MeshBatchManager(container);
    container.add(batches); container.create3DObject();
    const source = new BatchedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), BatchMode.Instancing);
    scene.add(source); source.position.set(23, 31, 47);
    updateSceneMatrices(scene); batches.updateMeshes();
    const outputs: THREE.Mesh[] = [];
    batches.get3DObject()!.traverse(object => { if (object instanceof THREE.Mesh) outputs.push(object); });
    expect(outputs).toHaveLength(1);
    const output = outputs[0], attributes = output.geometry.attributes;
    expect([attributes.instanceMatrix3.getX(0), attributes.instanceMatrix3.getY(0), attributes.instanceMatrix3.getZ(0)])
        .toEqual([23, 31, 47]);
    let updates = 0; const original = output.updateMatrix;
    output.updateMatrix = function () { updates++; return original.call(this); };
    source.position.x = 61; updateSceneMatrices(scene); batches.updateMeshes();
    expect(attributes.instanceMatrix3.getX(0)).toBe(61);
    expect(updates).toBeGreaterThan(0);
    batches.dispose(); source.geometry.dispose(); (source.material as THREE.Material).dispose();
});

test('cached heading switches retain resources and update the newly mounted pose before ray picking', () => {
    const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
    const parent = new THREE.Group(); parent.position.x = 100; scene.add(parent);
    const geometry = new THREE.BoxGeometry(10, 10, 10), material = new THREE.MeshBasicMaterial();
    const frames = Array.from({ length: 8 }, () => new THREE.Mesh(geometry, material));
    let released = 0; geometry.addEventListener('dispose', () => released++);
    const ray = new THREE.Raycaster(new THREE.Vector3(100, 0, 100), new THREE.Vector3(0, 0, -1));
    for (let heading = 0; heading < 16; heading++) {
        frames.forEach((frame, index) => {
            setCachedMeshVisibility(frame, parent, index === heading % 8);
            frame.position.z = heading; frame.updateMatrix();
        });
        updateSceneMatrices(scene);
        expect(parent.children).toHaveLength(1);
        expect(ray.intersectObjects(parent.children)[0]?.object).toBe(frames[heading % 8]);
        expect(frames[heading % 8].matrixWorld.elements[14]).toBe(heading);
        expect(released).toBe(0);
    }
    frames.forEach(frame => setCachedMeshVisibility(frame, parent, false));
    expect(parent.children).toHaveLength(0);
    geometry.dispose(); material.dispose(); expect(released).toBe(1);
});

test('failed explicit matrix updates restore the renderer opt-out flag', () => {
    const scene = new THREE.Scene(); scene.matrixWorldAutoUpdate = false;
    scene.updateMatrixWorld = () => { throw Error('failed child update'); };
    expect(() => updateSceneMatrices(scene)).toThrow('failed child update');
    expect(scene.matrixWorldAutoUpdate).toBe(false);
});
