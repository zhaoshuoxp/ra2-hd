import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { magneticFoot, magneticMuzzle } from '../../src/engine/renderable/entity/plugin/magneticBeamAttachments';

const source = () => ({ name: 'TELE', direction: 0, turretTrait: { facing: 0 },
    armedTrait: { primaryWeapon: { flh: { lateral: 2, vertical: 3, forward: 10 } } },
    art: { turretOffset: 5 }, position: { worldPosition: new THREE.Vector3(100, 20, 300) } });

test('inactive HD Magnetron uses its original muzzle without reading a frame layer', () => {
    const unit = source();
    const renderable = { unitVxlHd: { active: false, get layers(): never { throw Error('Inactive layers were read'); } } };
    expect(magneticMuzzle(unit, renderable).toArray()).toEqual([102, 23, 285]);
    expect(unit.position.worldPosition.toArray()).toEqual([100, 20, 300]);
});

test('an inactive HD lifted target retains its original VXL footprint contact', () => {
    const geometry = new THREE.BoxGeometry(10, 2, 6), body = new THREE.Mesh(geometry);
    body.position.set(10, 20, 30);
    const target = { position: { worldPosition: new THREE.Vector3(10, 20, 30) } };
    const renderable = { unitVxlHd: { active: false, layers: [] }, bodyVxlBuilder: { sections: new Map([['body', body]]) } };
    const point = magneticFoot(target, renderable, new THREE.Vector3(30, 10, 40), new THREE.OrthographicCamera());
    expect(point.toArray()).toEqual([15, 19, 32.5]);
    expect(target.position.worldPosition.toArray()).toEqual([10, 20, 30]);
    geometry.dispose();
});

test('an inactive target without original geometry returns an independent position', () => {
    const target = { position: { worldPosition: new THREE.Vector3(4, 5, 6) } };
    const point = magneticFoot(target, { unitVxlHd: { active: false, layers: [] } }, new THREE.Vector3(), new THREE.Camera());
    expect(point.toArray()).toEqual([4, 5, 6]);
    expect(point).not.toBe(target.position.worldPosition);
});

test('the active HD turret keeps its registered surface attachment', () => {
    const geometry = new THREE.PlaneGeometry(10, 10), batch = new THREE.Mesh(geometry);
    batch.position.set(50, 20, 70); batch.visible = true;
    const frame = { batch, translucent: { visible: false }, part: { member: 'teletur.vxl', pageSize: [100, 100] },
        frame: { rect: [0, 0, 100, 100], heading: 0 } };
    const renderable = { unitVxlHd: { active: true, layers: [{ turret: true, frames: [frame] }] } };
    const point = magneticMuzzle(source(), renderable);
    expect(point.x).toBeCloseTo(53.8, 5);
    expect(point.y).toBeCloseTo(23.8, 5);
    expect(point.z).toBe(70);
    geometry.dispose();
});

test('an active HD object with no turret frame retains its native muzzle', () => {
    expect(magneticMuzzle(source(), { unitVxlHd: { active: true, layers: [] } }).toArray()).toEqual([102, 23, 285]);
});
