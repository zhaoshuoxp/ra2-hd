import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';
import { VxlUnitRenderer, componentPose } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { heading } from '../../src/engine/renderable/rhino/contract';

let paletteHash = 937100;
function fixture() {
    const palette = { hash: paletteHash++ }, texture = new THREE.DataTexture(new Uint8Array(1024), 256, 1);
    TextureUtils.cache.set(palette.hash, texture);
    const root = new THREE.Object3D(), tilt = new THREE.Object3D(); root.add(tilt);
    const geometry = new THREE.BoxGeometry(), original = new THREE.MeshBasicMaterial(), hidden = original.clone();
    const mesh = new THREE.Mesh(geometry, original) as any, occluder = new THREE.Mesh(geometry, original);
    tilt.add(mesh, occluder); root.position.set(100, 20, -40); mesh.position.set(2, 3, -5);
    const clipping = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -3)];
    mesh.getClippingPlanes = () => clipping;
    const reads = Array(8).fill(0), calls: any[] = [], reference = new THREE.Matrix4().toArray();
    const frames = Array.from({ length: 8 }, (_, i) => ({
        part: { actor: 'MTNK', member: 'mtnk.vxl', section: 'BODY', frames: Array(8).fill({}) },
        frame: { heading: i * 45, get referenceLinear() { reads[i]++; return reference; } },
        update(visible: boolean, pose: THREE.Matrix4, light: THREE.Vector3, palette: THREE.Texture,
            order: number, planes: THREE.Plane[], opacity: number) {
            calls.push({ heading: i * 45, visible, pose: visible ? pose.clone() : undefined, planes, opacity });
        },
    }));
    const r = { posObj: root, tiltObj: tilt, palette, shpExtraLight: new THREE.Vector3(),
        gameObject: { name: 'MTNK', rules: { isGattling: false, missileSpawn: false },
            turretTrait: { facing: 0 }, zone: 0, position: { getBridgeBelow: () => ({ isHighBridge: () => true }) } } };
    const renderer = Object.assign(Object.create(VxlUnitRenderer.prototype), {
        r, family: { identity: 'MTNK' }, baseLight: new THREE.Vector3(), light: new THREE.Vector3(),
        pose: new THREE.Matrix4(), meshes: [mesh], layers: [{ mesh, frames, turret: false, rotor: false }],
        originals: [original], hidden: [hidden], shadowOccluders: [occluder], shadow: { update() {} },
        discRotation: { update: () => 17 }, disposed: false,
    }) as VxlUnitRenderer;
    return { renderer, r, root, tilt, mesh, frames, reads, calls, clipping, reference, occluder,
        dispose() { TextureUtils.cache.delete(palette.hash); texture.dispose(); geometry.dispose(); original.dispose(); hidden.dispose(); } };
}
function expected(f: ReturnType<typeof fixture>, yaw: number, bearing: number, actualYaw = yaw) {
    return componentPose(new THREE.Matrix4(), f.root.matrixWorld.clone().invert().multiply(f.mesh.matrixWorld),
        f.reference, actualYaw, bearing);
}
test('prepare only the displayed cached bearing and refresh it across native turns', () => {
    const f = fixture();
    try {
        for (const yaw of [0, 40, 88, 132, 179, 224, 269, 314, 359, -48]) {
            f.tilt.rotation.y = THREE.MathUtils.degToRad(yaw); f.calls.length = 0; f.reads.fill(0);
            f.renderer.update(); const bearing = heading(yaw)!;
            expect(f.reads.reduce((sum, value) => sum + value, 0)).toBe(1);
            expect(f.reads[bearing / 45]).toBe(1);
            expect(f.calls).toHaveLength(8); expect(f.calls.filter(call => call.visible)).toHaveLength(1);
            const active = f.calls.find(call => call.visible);
            expect(active.heading).toBe(bearing); expect(active.planes).toBe(f.clipping);
            expected(f, yaw, bearing).elements.forEach((value, i) => expect(active.pose.elements[i]).toBeCloseTo(value, 10));
            expect(f.occluder.visible).toBe(true);
        }
    } finally { f.dispose(); }
});
test('selected missile bearing retains continuous native attitude and joint offsets', () => {
    const f = fixture();
    try {
        f.r.gameObject.rules.missileSpawn = true; f.tilt.rotation.set(.24, THREE.MathUtils.degToRad(131), -.17, 'YXZ');
        f.mesh.position.set(4, 8, -9); f.renderer.update(); const active = f.calls.find(call => call.visible);
        expect(f.reads.reduce((sum, value) => sum + value, 0)).toBe(1);
        expected(f, 131, 135, 135).elements.forEach((value, i) => expect(active.pose.elements[i]).toBeCloseTo(value, 10));
    } finally { f.dispose(); }
});
test('disc and rotor views keep their non-bearing pose path', () => {
    const f = fixture();
    try {
        f.renderer.family.identity = 'DISK'; f.renderer.layers[0].frames = [f.frames[1]] as any;
        f.renderer.update(); expect(f.calls.find(call => call.visible).heading).toBe(45); expect(f.reads[1]).toBe(1);
        f.renderer.family.identity = 'MTNK'; f.renderer.layers[0].frames = [f.frames[0]] as any;
        f.renderer.layers[0].rotor = true; f.calls.length = 0; f.reads.fill(0); f.tilt.rotation.y = 1.8;
        f.renderer.update(); expect(f.calls.find(call => call.visible).heading).toBe(0); expect(f.reads[0]).toBe(1);
    } finally { f.dispose(); }
});
