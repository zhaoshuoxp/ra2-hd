import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Vehicle } from '../../../src/engine/renderable/entity/Vehicle';
import { VxlUnitRenderer } from '../../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { TextureUtils } from '../../../src/engine/gfx/TextureUtils';
import { dockDepthOffset } from '../../../src/engine/renderable/unitVxl/dockDepth';

test('dolphin swim and attack use clockwise source bearings without changing animation phase', () => {
    for (const firing of [false, true]) for (let direction = 0; direction < 360; direction += 45) {
        let frame = -1;
        const probe: any = {
            gameObject: { name: 'DLPH' }, objectRules: { naval: true },
            objectArt: { facings: 8, walkFrames: 6, firingFrames: 6, startWalkFrame: 0, startFiringFrame: 56 },
            shpAnimRunner: { animation: { getCurrentFrame: () => 3 } },
            shpRenderable: { setFrame: (value: number) => { frame = value; } },
        };
        Vehicle.prototype.updateShapeFrame.call(probe, direction, true, firing);
        // Screen bearings: NE, N, NW, W, SW, S, SE, E.
        const bearing = [1, 0, 7, 6, 5, 4, 3, 2][direction / 45];
        expect(frame).toBe((firing ? 56 : 0) + bearing * 6 + 3);
        probe.gameObject.name = 'SQD';
        Vehicle.prototype.updateShapeFrame.call(probe, direction, true, firing);
        expect(frame).toBe((firing ? 56 : 0) + ((direction / 45 + 7) % 8) * 6 + 3);
    }
});

test('parking depth clears only the occupied sprite surface and preserves screen projection', () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 20000);
    camera.position.z = 1000; camera.updateMatrixWorld();
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial());
    surface.position.z = 30; surface.updateMatrixWorld();
    const plane = new THREE.PlaneGeometry(20, 20);
    const toward = new THREE.Vector3(0, 0, 1);
    const world = new THREE.Matrix4();
    const offset = dockDepthOffset(plane, world, surface, toward);
    expect(offset).toBeCloseTo(30.5);
    const p = new THREE.Vector3(8, -3, 0), before = p.clone().project(camera);
    const after = p.clone().addScaledVector(toward, offset).project(camera);
    expect(after.x).toBeCloseTo(before.x, 12); expect(after.y).toBeCloseTo(before.y, 12);
    expect(after.z).toBeLessThan(new THREE.Vector3(8, -3, 30).project(camera).z);
    world.makeTranslation(1000, 0, 0);
    expect(dockDepthOffset(plane, world, surface, toward)).toBe(0);
    world.makeTranslation(0, 0, 40);
    expect(dockDepthOffset(plane, world, surface, toward)).toBe(0);
    plane.dispose(); surface.geometry.dispose(); surface.material.dispose();
});


test('native depth mask is traversed only beneath a high bridge', () => {
    const texture = new THREE.Texture();
    const hash = 987654321;
    TextureUtils.cache.set(hash, texture);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    const occluder = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial());
    const parent = new THREE.Object3D(); parent.add(mesh, occluder);
    const u: any = { name: 'AMCV', rules: { isGattling: false }, zone: 0, onBridge: false,
        position: { getBridgeBelow: () => undefined } };
    const renderer: any = {
        family: { identity: 'AMCV', density: 4, parts: [] },
        disposed: false, meshes: [mesh], originals: [mesh.material], hidden: [mesh.material.clone()],
        shadowOccluders: [occluder], layers: [{mesh, frames: [], turret: false, rotor: false}],
        baseLight: new THREE.Vector3(), light: new THREE.Vector3(), shadow: {update() {}},
        r: {gameObject: u, posObj: parent, tiltObj: new THREE.Object3D(),
            palette: {hash}, shpExtraLight: new THREE.Vector3()},
    };
    try {
        for (const [bridge, onBridge, zone, expected] of [
            [undefined, false, 0, false], [false, false, 0, false],
            [true, false, 0, true], [true, true, 0, false], [true, false, 1, false],
        ] as const) {
            u.position.getBridgeBelow = () => bridge === undefined ? undefined : {isHighBridge: () => bridge};
            u.onBridge = onBridge; u.zone = zone;
            VxlUnitRenderer.prototype.update.call(renderer);
            const visited: THREE.Object3D[] = [];
            parent.traverseVisible(m => visited.push(m));
            expect(occluder.visible).toBe(expected);
            expect(visited.includes(occluder)).toBe(expected);
        }
    } finally {
        TextureUtils.cache.delete(hash); texture.dispose(); mesh.geometry.dispose();
        mesh.material.dispose(); occluder.material.dispose(); renderer.hidden[0].dispose();
    }
});
