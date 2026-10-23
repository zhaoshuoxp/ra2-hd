import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { componentGeometry } from '../../src/engine/renderable/unitVxl/componentGeometry';
import { componentPose } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';

test('missile surface preserves level artwork and follows its native longitudinal axis through a dive', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.rotation.set(-Math.atan(1 / Math.sqrt(2)), Math.PI / 4, 0, 'YXZ');
    const cameraRotation = new THREE.Matrix4().makeRotationFromEuler(camera.rotation);
    const view = cameraRotation.clone().invert();
    const toward = new THREE.Vector3(0, 0, 1).transformDirection(cameraRotation);
    const nativeBasis = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const texture = new THREE.Texture({width: 256, height: 256} as any);
    const part: any = {pageSize: [256, 256], override: {pages: [{base: texture}]}};
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const radians = THREE.MathUtils.degToRad(yaw);
        const reference = new THREE.Matrix4().makeRotationY(radians).multiply(nativeBasis);
        const frame: any = {rect: [0, 0, 256, 256], logicalSize: [80, 80], offset: [-40, -40],
            referenceLinear: reference.toArray(), referenceOrigin: [0, 0, 0]};
        const original = componentGeometry(part, frame, camera, false, 0);
        const missile = componentGeometry(part, frame, camera, false, 0, undefined, true);
        const before = original.getAttribute('position'), after = missile.getAttribute('position');
        expect(after.count).toBe(before.count);
        for (let i = 0; i < after.count; i++) {
            const a = new THREE.Vector3().fromBufferAttribute(before, i).applyMatrix4(view);
            const b = new THREE.Vector3().fromBufferAttribute(after, i).applyMatrix4(view);
            expect(b.x).toBeCloseTo(a.x, 4);
            expect(b.y).toBeCloseTo(a.y, 4);
        }
        expect(Array.from(missile.getAttribute('uv').array)).toEqual(Array.from(original.getAttribute('uv').array));
        const axis = new THREE.Vector3(1, 0, 0).transformDirection(reference);
        const material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
        const mesh = new THREE.Mesh(missile, material);
        const nose = axis.clone().multiplyScalar(20);
        const hits = new THREE.Raycaster(nose.clone().addScaledVector(toward, 10000), toward.clone().negate()).intersectObject(mesh);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].point.distanceTo(nose)).toBeLessThan(0.001);
        for (const offset of [-20, 0, 20]) for (const pitch of [60, 0, -30, -60, -85]) {
            const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), radians + THREE.MathUtils.degToRad(offset), 0, 'YXZ'));
            const pose = componentPose(new THREE.Matrix4(), rotation.clone().multiply(nativeBasis), reference.toArray(), yaw, yaw);
            const displayedAxis = hits[0].point.clone().applyMatrix4(pose).normalize();
            const nativeAxis = new THREE.Vector3(0, 0, -1).transformDirection(rotation);
            expect(displayedAxis.dot(nativeAxis)).toBeCloseTo(1, 7);
        }
        original.dispose(); missile.dispose(); material.dispose();
    }
    texture.dispose();
});
