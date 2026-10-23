import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { OctreeContainer } from '../../src/engine/gfx/OctreeContainer';
import { updateSceneMatrices } from '../../src/engine/gfx/SceneMatrices';

const fixture = () => {
    const scene = new THREE.Scene(); scene.matrixAutoUpdate = false; scene.matrixWorldAutoUpdate = false;
    scene.position.set(-10, 0, -10); scene.updateMatrix();
    const container = OctreeContainer.factory(new THREE.OrthographicCamera(-100, 100, 100, -100, 0, 1000));
    const root = container.get3DObject()!; scene.add(root);
    const actor = new THREE.Group(); actor.matrixAutoUpdate = false;
    actor.position.set(20, 0, 30); actor.updateMatrix(); root.add(actor);
    const joint = new THREE.Group(); joint.matrixAutoUpdate = false; actor.add(joint);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.matrixAutoUpdate = false; joint.add(mesh);
    return { scene, container, root, actor, joint, mesh,
        dispose: () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); } };
};

test('unchanged actor matrices are not forced by the identity octree wrapper', () => {
    const f = fixture();
    try {
        updateSceneMatrices(f.scene); const expected = [...f.mesh.matrixWorld.elements];
        let products = 0; const multiply = f.mesh.matrixWorld.multiplyMatrices;
        f.mesh.matrixWorld.multiplyMatrices = function (...args) { products++; return multiply.apply(this, args); };
        for (let i = 0; i < 3; i++) updateSceneMatrices(f.scene);
        expect(products).toBe(0); expect(f.mesh.matrixWorld.elements).toEqual(expected);
        expect(f.root.matrixWorldAutoUpdate).toBe(true);
    } finally { f.dispose(); }
});

test('movement, recoil, new children and parent translation retain current native world matrices', () => {
    const f = fixture();
    try {
        updateSceneMatrices(f.scene);
        f.actor.position.x += 17; f.actor.updateMatrix(); f.joint.rotation.y = .7; f.joint.updateMatrix();
        f.mesh.position.z = 9; f.mesh.updateMatrix();
        const automatic = new THREE.Object3D(); automatic.position.set(2, 3, 4); f.actor.add(automatic);
        const newborn = new THREE.Object3D(); newborn.matrixAutoUpdate = false;
        newborn.position.set(7, 0, 5); newborn.updateMatrix(); f.root.add(newborn);
        for (let i = 0; i < 3; i++) {
            f.scene.position.x -= 3; f.scene.updateMatrix(); automatic.position.y += 2;
            updateSceneMatrices(f.scene);
            expect(f.mesh.matrixWorld.elements).toEqual(f.scene.matrix.clone().multiply(f.actor.matrix)
                .multiply(f.joint.matrix).multiply(f.mesh.matrix).elements);
            expect(automatic.matrixWorld.elements).toEqual(f.scene.matrix.clone().multiply(f.actor.matrix)
                .multiply(automatic.matrix).elements);
            expect(newborn.matrixWorld.elements).toEqual(f.scene.matrix.clone().multiply(newborn.matrix).elements);
        }
        f.root.remove(newborn); f.joint.add(newborn); newborn.updateMatrix(); updateSceneMatrices(f.scene);
        expect(newborn.matrixWorld.elements).toEqual(f.joint.matrixWorld.clone().multiply(newborn.matrix).elements);
        expect(f.scene.matrixWorldAutoUpdate).toBe(false); expect(automatic.matrixAutoUpdate).toBe(true);
    } finally { f.dispose(); }
});
