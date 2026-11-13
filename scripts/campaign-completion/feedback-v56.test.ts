import { expect, test } from 'bun:test';
import * as THREE from 'three';
import contracts from '../../desktop/building-turret-contracts.json';
import { BuildingTurretHd, BuildingTurretRenderer } from '../../src/engine/renderable/building/BuildingTurretHd';
import { updateSceneMatrices } from '../../src/engine/gfx/SceneMatrices';
import { installCulledMatrixTraversal, setViewCulled } from '../../src/engine/gfx/ViewCulling';

function fixture(family: keyof typeof contracts) {
    const scene = new THREE.Scene(); scene.matrixAutoUpdate = scene.matrixWorldAutoUpdate = false;
    const container = new THREE.Group(); container.matrixAutoUpdate = false; installCulledMatrixTraversal(container); scene.add(container);
    const root = new THREE.Group(), turret = new THREE.Group();
    root.matrixAutoUpdate = turret.matrixAutoUpdate = false;
    root.position.set(28000, 256, 26000); turret.position.set(11, 13, 17);
    root.updateMatrix(); turret.updateMatrix(); root.add(turret); container.add(root);
    updateSceneMatrices(scene);
    const materials: THREE.Material[] = [], builders = Array.from({ length: contracts[family].builders }, () => {
        const material = new THREE.MeshBasicMaterial(); materials.push(material);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); turret.add(mesh);
        return { sections: new Map([['native', mesh]]) };
    });
    const camera = new THREE.OrthographicCamera(-500, 500, 500, -500, .1, 100000);
    camera.rotation.set(-Math.PI / 3, Math.PI / 4, 0);
    const building: any = { turret, turretBuilders: builders, camera, shpExtraLight: new THREE.Vector3(),
        gameObject: { turretTrait: { facing: 0 }, owner: { color: { r: 0, g: 0, b: 1 } }, healthTrait: { health: 100 } } };
    const resources = new BuildingTurretHd(contracts[family], 4);
    for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const base = new THREE.Texture({ width: 320, height: 360 } as any);
        resources.parts.set(heading, { base, mask: new THREE.DataTexture() });
    }
    const expected = root.matrix.clone().multiply(turret.matrix);
    return { scene, root, turret, building, resources, expected, materials };
}

test('late HD building turrets inherit settled static-world transforms for every family and heading', () => {
    for (const family of Object.keys(contracts) as (keyof typeof contracts)[]) {
        const f = fixture(family);
        let recomposed = 0;
        f.root.updateMatrix = () => { recomposed++; };
        const renderer = new BuildingTurretRenderer(f.building, f.resources);
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            f.building.gameObject.turretTrait.facing = heading;
            renderer.update(); updateSceneMatrices(f.scene);
            const [depth, color] = renderer.meshes.get(heading)!;
            expect(depth.matrixWorld.elements).toEqual(f.expected.elements);
            expect(color.matrixWorld.elements).toEqual(f.expected.elements);
            expect(color.visible).toBe(true);
        }
        expect(recomposed).toBe(0);
        expect(f.scene.matrixWorldAutoUpdate).toBe(false);
        renderer.dispose();
        f.building.turretBuilders.forEach((builder: any, i: number) => {
            expect(builder.sections.get('native').material).toBe(f.materials[i]);
            expect(f.materials[i].colorWrite).toBe(true);
        });
    }
});

test('an HD turret attached outside the view retains its dirty transform until normal cull restoration', () => {
    const f = fixture('NASAM'); setViewCulled(f.root, true);
    const renderer = new BuildingTurretRenderer(f.building, f.resources);
    renderer.update(); updateSceneMatrices(f.scene);
    const [depth, color] = renderer.meshes.get(0)!;
    expect(color.matrixWorldNeedsUpdate).toBe(true);
    expect(color.matrixWorld.elements).not.toEqual(f.expected.elements);
    setViewCulled(f.root, false); updateSceneMatrices(f.scene);
    expect(depth.matrixWorld.elements).toEqual(f.expected.elements);
    expect(color.matrixWorld.elements).toEqual(f.expected.elements);
    expect(color.matrixWorldNeedsUpdate).toBe(false);
    renderer.dispose();
});
