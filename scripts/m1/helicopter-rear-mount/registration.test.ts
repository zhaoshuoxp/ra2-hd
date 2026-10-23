import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { offsetRotorMount } from '../../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';

const local = test;
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));



test('rear mount follows body attitude and cannot orbit with the spinning blade', () => {
    const joint = new THREE.Vector3(-35.1303215, -0.06269, 28.5399208);
    const offset: [number, number, number] = [9.75, 0, -3.5];
    const center = new THREE.Vector3(0, 0, 1.993475);
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315])
        for (const tilt of [0, 0.12]) {
            const parent = new THREE.Matrix4().makeRotationFromEuler(
                new THREE.Euler(tilt, yaw * Math.PI / 180, tilt / 2, 'YXZ'))
                .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
                .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
                .multiply(new THREE.Matrix4().makeScale(6.033977866, 6.033977866, 6.033977866));
            parent.setPosition(81, 22, -13);
            const expected = joint.clone().add(center).add(new THREE.Vector3().fromArray(offset)).applyMatrix4(parent);
            for (const phase of [0, 60, 120, 180, 240, 300]) {
                const current = parent.clone().multiply(new THREE.Matrix4().makeTranslation(...joint.toArray()))
                    .multiply(new THREE.Matrix4().makeRotationZ(phase * Math.PI / 180));
                offsetRotorMount(current, parent, offset);
                expect(center.clone().applyMatrix4(current).distanceTo(expected)).toBeLessThan(1e-9);
                expect(current.clone().setPosition(0, 0, 0)).toEqual(
                    parent.clone().multiply(new THREE.Matrix4().makeRotationZ(phase * Math.PI / 180))
                        .setPosition(0, 0, 0));
            }
        }
});

local('rear mount stays at one physical height through all body bearings', () => {
    const m = read(`${resourceRoot}/` + vxlUnitIdentities.SHAD.path);
    const rear = m.parts.find((p: any) => p.section === 'CYLINDER18');
    expect(rear.frames).toHaveLength(8);
    for (const frame of rear.frames) expect(frame.rotorMountOffset).toEqual([9.75, 0, -3.5]);
    expect(rear.rotorMast.height).toBeGreaterThan(1.8);
});
