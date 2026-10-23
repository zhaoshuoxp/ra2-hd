import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { componentGeometry } from '../../../src/engine/renderable/unitVxl/componentGeometry';
import { componentPose } from '../../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';

const local = test;
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const camera = new THREE.OrthographicCamera();
camera.rotation.order = 'YXZ';
camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
camera.updateMatrixWorld();

function imagePoint(geometry: THREE.BufferGeometry, u: number, v: number) {
    const uv = geometry.getAttribute('uv'), positions = geometry.getAttribute('position');
    for (let i = 0; i < uv.count; i += 3) {
        const a = new THREE.Vector2(uv.getX(i), uv.getY(i));
        const b = new THREE.Vector2(uv.getX(i + 1), uv.getY(i + 1));
        const c = new THREE.Vector2(uv.getX(i + 2), uv.getY(i + 2));
        const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(den) < 1e-12) continue;
        const x = ((b.y - c.y) * (u - c.x) + (c.x - b.x) * (v - c.y)) / den;
        const y = ((c.y - a.y) * (u - c.x) + (a.x - c.x) * (v - c.y)) / den;
        if (x < -1e-6 || y < -1e-6 || x + y > 1 + 1e-6) continue;
        return new THREE.Vector3().fromBufferAttribute(positions, i).multiplyScalar(x)
            .addScaledVector(new THREE.Vector3().fromBufferAttribute(positions, i + 1), y)
            .addScaledVector(new THREE.Vector3().fromBufferAttribute(positions, i + 2), 1 - x - y);
    }
    throw Error('Hub must be covered by the registered rotor image');
}



local('painted tandem hubs stay on native axes through yaw, spin, pitch and roll at both densities', () => {
    const manifest = read(`${resourceRoot}/` + vxlUnitIdentities.SHAD.path);
    const rotor = { axis: new THREE.Vector3(0, 0, 1), center: new THREE.Vector3(3.2, 0.5, 1.6) };
    for (const part of manifest.parts.filter((p: any) => p.frames[0].rotorAnchor))
        for (const density of [2, 4]) {
            const scale = density / 4, frame = { ...part.frames[0], rect: part.frames[0].rect.map((v: number) => v * scale) };
            const registered = { ...part, pageSize: part.pageSize.map((v: number) => v * scale),
                override: { pages: [{ base: new THREE.Texture() }] } };
            const geometry = componentGeometry(registered, frame, camera, false, 0, rotor);
            try {
                const [x, y, w, h] = frame.rect, [pw, ph] = registered.pageSize;
                const hub = imagePoint(geometry, (x + frame.rotorAnchor[0] * w) / pw,
                    1 - (y + frame.rotorAnchor[1] * h) / ph);
                const reference = new THREE.Matrix4().fromArray(frame.referenceLinear);
                for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315])
                    for (const phase of [0, 60, 120, 180, 240, 300])
                        for (const tilt of [0, 0.12]) {
                            const current = new THREE.Matrix4().makeRotationX(tilt)
                                .multiply(new THREE.Matrix4().makeRotationZ(tilt / 2))
                                .multiply(new THREE.Matrix4().makeRotationY(yaw * Math.PI / 180))
                                .multiply(reference).multiply(new THREE.Matrix4().makeRotationZ(phase * Math.PI / 180));
                            current.setPosition(new THREE.Vector3().fromArray(frame.referenceOrigin));
                            const pose = componentPose(new THREE.Matrix4(), current, frame.referenceLinear, 0, 0);
                            const expected = rotor.center.clone().projectOnVector(rotor.axis).applyMatrix4(current);
                            expect(hub.clone().applyMatrix4(pose).distanceTo(expected)).toBeLessThan(0.001);
                            const positions = geometry.getAttribute('position');
                            const axis = rotor.axis.clone().transformDirection(current);
                            for (let i = 0; i < positions.count; i++) {
                                const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(pose);
                                expect(Math.abs(point.sub(expected).dot(axis))).toBeLessThan(0.001);
                            }
                        }
            } finally { geometry.dispose(); }
        }
});
