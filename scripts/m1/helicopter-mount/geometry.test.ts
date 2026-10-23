import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as THREE from 'three';
import { componentGeometry } from '../../../src/engine/renderable/unitVxl/componentGeometry';
import { RotorMast } from '../../../src/engine/renderable/unitVxl/RotorMast';
import { vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const local = test;
const camera = new THREE.OrthographicCamera();
camera.rotation.order = 'YXZ';
camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
camera.updateMatrixWorld();

local('fuselage depth stays inside physical height without moving pixels or cropping the belly', () => {
    const m = read(`${resourceRoot}/` + vxlUnitIdentities.SHAD.path);
    const part = m.parts.find((p: any) => p.section === 'DUMMY01');
    let previouslyAboveRoof = 0;
    for (const frame of part.frames) {
        const registered = { ...part, override: { pages: [{ base: new THREE.Texture() }] } };
        const originY = frame.referenceOrigin[1];
        const bounds: [number, number] = [originY + 0.632, originY + 154.522];
        const before = componentGeometry(registered, frame, camera, true, 0);
        const after = componentGeometry(registered, frame, camera, true, 0, undefined, false, bounds);
        const a = before.getAttribute('position'), b = after.getAttribute('position');
        expect(Array.from(before.getAttribute('uv').array)).toEqual(Array.from(after.getAttribute('uv').array));
        expect(a.count).toBe(b.count);
        for (let i = 0; i < a.count; i++) {
            const old = new THREE.Vector3().fromBufferAttribute(a, i);
            const current = new THREE.Vector3().fromBufferAttribute(b, i);
            if (old.y + originY > bounds[1]) previouslyAboveRoof++;
            expect(current.y + originY).toBeGreaterThanOrEqual(bounds[0] - 0.0001);
            expect(current.y + originY).toBeLessThanOrEqual(bounds[1] + 0.0001);
            old.applyMatrix4(camera.matrixWorldInverse);
            current.applyMatrix4(camera.matrixWorldInverse);
            expect(Math.hypot(old.x - current.x, old.y - current.y)).toBeLessThan(0.0001);
        }
        before.dispose(); after.dispose();
    }
    expect(previouslyAboveRoof).toBeGreaterThan(0);
});

test('bearing stays fixed to the airframe while its rotor spins and follows native attitude', () => {
    const parent = new THREE.Object3D();
    parent.rotation.set(0.1, 0.8, -0.06); parent.scale.setScalar(6.034);
    const joint = new THREE.Mesh(new THREE.BoxGeometry(60, 60, 2), new THREE.MeshBasicMaterial());
    joint.geometry.translate(0, 0, 2); joint.geometry.computeBoundingBox();
    joint.position.set(-35, 0, 28.5); parent.add(joint);
    const mast = new RotorMast(parent, { height: 12, baseRadius: 4.2 });
    const axis = new THREE.Vector3(0, 0, 1), light = new THREE.Vector3();
    let first: number[] | undefined;
    for (let phase = 0; phase < 360; phase += 30) {
        joint.quaternion.setFromAxisAngle(axis, phase * Math.PI / 180); joint.updateMatrix();
        mast.update(joint, axis, [9.75, 0, -3.5], true, 1, light, null);
        parent.updateMatrixWorld(true);
        const matrix = mast.mesh.matrixWorld.toArray();
        if (!first) first = matrix;
        matrix.forEach((v, i) => expect(Math.abs(v - first![i])).toBeLessThan(1e-10));
    }
    mast.mesh.geometry.computeBoundingBox();
    expect(mast.mesh.geometry.boundingBox!.max.z).toBeCloseTo(0, 5);
    expect(mast.mesh.geometry.boundingBox!.min.z).toBeCloseTo(-12, 5);
    mast.update(joint, axis, [9.75, 0, -3.5], false, 1, light, null);
    expect(mast.mesh.visible).toBeFalse();
    mast.dispose(); expect(parent.children).toEqual([joint]);
    joint.geometry.dispose(); joint.material.dispose();
});

const sovietLocal = test;
sovietLocal('accepted Soviet family retains pinned body, deployment, tail rotor and atlas records', () => {
    const file = `${resourceRoot}/` + vxlUnitIdentities.SCHP.path;
    const bytes = readFileSync(file);
    const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
    expect(digest(bytes)).toBe(vxlUnitIdentities.SCHP.hash);
    const current = JSON.parse(bytes.toString('utf8'));
    expect(Object.keys(current.sources).sort()).toEqual([
        'schd.hva', 'schd.vxl', 'schdtur.hva', 'schdtur.vxl', 'schp.hva', 'schp.vxl',
    ]);
    expect(current.parts.map((p: any) => [p.member, p.section])).toEqual([
        ['schp.vxl', 'CYLINDER19'], ['schp.vxl', 'CYLINDER57'], ['schp.vxl', 'DUMMY01'],
        ['schd.vxl', 'DUMMY01'], ['schdtur.vxl', 'DUMMY01'],
    ]);
    current.parts.forEach((p: any) => {
        expect(p.frames).toHaveLength(8);
        for (const asset of Object.values(p.files) as { file: string; bytes: number; sha256: string }[]) {
            const data = readFileSync(join(dirname(file), asset.file));
            expect(data.length).toBe(asset.bytes);
            expect(digest(data)).toBe(asset.sha256);
        }
        if (p.section === 'CYLINDER19') {
            expect(p.rotorMast).toEqual({ height: 5, baseRadius: 2.6 });
            for (const f of p.frames) expect(f.rotorMountOffset).toEqual([0, 0, 6]);
        } else expect(p.rotorMast).toBeUndefined();
    });
});
