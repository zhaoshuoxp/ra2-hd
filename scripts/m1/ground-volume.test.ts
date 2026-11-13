import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { groundVolumeCorrection } from '../../src/engine/renderable/unitVxl/groundVolume';
import { constructionSlopePositions } from '../../src/engine/renderable/unitVxl/componentGeometry';

const screen = (geometry: THREE.BufferGeometry, pose: THREE.Matrix4) => {
    const p = geometry.getAttribute('position');
    return Array.from({ length:p.count }, (_,i) => new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(pose));
};

test('slope projection preserves every painted edge and the closest native image rotation without shear', () => {
    const camera = new THREE.OrthographicCamera();
    camera.rotation.set(-Math.PI/6, Math.PI/4, 0, 'YXZ'); camera.updateMatrixWorld();
    const view = new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion).invert();
    const image = new THREE.PlaneGeometry(30,18);
    image.applyQuaternion(camera.quaternion);
    try {
        for (let heading=0; heading<360; heading+=45) {
            const flat = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(heading));
            const surface = image.clone();
            surface.setAttribute('position',new THREE.Float32BufferAttribute(
                constructionSlopePositions(image.getAttribute('position'),flat.toArray(),camera),3));
            const original = screen(surface,view);
            for (const axis of ['x','z'] as const) for (const tilt of [-.4,-.3,-.16,.16,.3,.4]) {
                const pitch = axis==='x' ? new THREE.Matrix4().makeRotationX(tilt) : new THREE.Matrix4().makeRotationZ(tilt);
                const slope = flat.clone().multiply(pitch).multiply(flat.clone().invert());
                const correction = groundVolumeCorrection(new THREE.Matrix4(),surface,slope,camera);
                const actual = screen(surface,view.clone().multiply(correction).multiply(slope));
                for (let a=0;a<original.length;a++) for (let b=a+1;b<original.length;b++) {
                    const before = Math.hypot(original[a].x-original[b].x,original[a].y-original[b].y);
                    const after = Math.hypot(actual[a].x-actual[b].x,actual[a].y-actual[b].y);
                    expect(after).toBeCloseTo(before,4);
                }
                const native = view.clone().multiply(slope).multiply(view.clone().invert()).elements;
                const first = original[1].clone().sub(original[0]), next = actual[1].clone().sub(actual[0]);
                const observed = Math.atan2(next.y,next.x)-Math.atan2(first.y,first.x);
                const agreement = (angle: number) => Math.cos(angle)*(native[0]+native[5])
                    + Math.sin(angle)*(native[1]-native[4]);
                expect(agreement(observed)).toBeGreaterThan(agreement(observed-.01));
                expect(agreement(observed)).toBeGreaterThan(agreement(observed+.01));
                expect(new THREE.Vector3().applyMatrix4(correction).length()).toBe(0);
            }
            surface.dispose();
        }
    } finally { image.dispose(); }
});
