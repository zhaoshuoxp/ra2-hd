import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { ArtworkResource, RhinoSpriteProof } from './rhino-sprite/adapter';
import { supported, verifyBytes } from './rhino-sprite/contract';
import { Coords } from '../../src/game/Coords';

function fixture(resource: ArtworkResource) {
    const owner = {}, root = new THREE.Group(), posObj = new THREE.Group(); root.add(posObj);
    const unit = { name: 'HTNK', owner, direction: 0, turretTrait: { facing: 0 }, tileElevation: 0 };
    const meshes = [0, 1, 2].map(() => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const r: any = { gameObject: unit, vxlBuilders: meshes.map(m => ({ sections: new Map([['DUMMY01', m]]) })),
        shpExtraLight: new THREE.Vector3(0.025, 0.025, 0.025), posObj, mainObj: new THREE.Group(),
        tiltObj: new THREE.Group(), rockingTiltObj: new THREE.Group(), update() {} };
    const height = 868, width = 1432, scale = Coords.COS_ISO_CAMERA_BETA * Coords.ISO_WORLD_SCALE;
    const camera = new THREE.OrthographicCamera(-width * scale / 2, width * scale / 2, height * scale / 2, -height * scale / 2, 0, 100000);
    camera.rotation.order = 'YXZ'; camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
    camera.updateMatrixWorld();
    return { proof: new RhinoSpriteProof(r, resource, camera), r, unit, camera, width, height };
}
function resource() { return new ArtworkResource(new THREE.DataTexture(new Uint8Array(256 * 192 * 4), 256, 192)); }

test('deterministic bytes validate SHA-256 and reject changed content and identity', async () => {
    // Standard SHA-256 vector, deliberately unrelated to retired accepted artwork.
    const bytes = new TextEncoder().encode('abc').buffer;
    const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    await verifyBytes(bytes, hash);
    await expect(verifyBytes(new TextEncoder().encode('abd').buffer, hash)).rejects.toThrow('identity');
    await expect(verifyBytes(bytes, '0'.repeat(64))).rejects.toThrow('identity');
});

test('only the complete primary pose/state is eligible, including circular headings', () => {
    const owner = {}, unit: any = { name: 'HTNK', owner, direction: 0, turretTrait: { facing: 0 } };
    expect(supported(unit, owner)).toBe(true);
    for (const patch of [{ direction: 1 }, { direction: NaN }, { turretTrait: { facing: 90 } },
        { owner: {} }, { name: 'MTNK' }, { isDestroyed: true }, { isFiring: true }, { onBridge: true },
        { tileElevation: 1 }, { warpedOutTrait: { isActive: () => true } }]) expect(supported({ ...unit, ...patch }, owner)).toBe(false);
    expect(supported({ ...unit, direction: 360 }, owner)).toBe(true);
});

test('registered world geometry projects to native 64x48 footprint and anchor at 900 reference', () => {
    const f = fixture(resource()); f.proof.update();
    const points = Array.from({ length: f.proof.source.geometry.attributes.position.count }, (_, i) => {
        const p = new THREE.Vector3().fromBufferAttribute(f.proof.source.geometry.attributes.position, i).project(f.camera);
        return [(p.x + 1) * f.width / 2 - f.width / 2, (1 - p.y) * f.height / 2 - f.height / 2];
    });
    expect(Math.min(...points.map(p => p[0]))).toBeCloseTo(-31, 4);
    expect(Math.max(...points.map(p => p[0]))).toBeCloseTo(33, 4);
    expect(Math.min(...points.map(p => p[1]))).toBeCloseTo(-32.1, 4);
    expect(Math.max(...points.map(p => p[1]))).toBeCloseTo(15.9, 4);
    f.proof.dispose();
});

test('whole-family fallback, exact material restore, shared image lifetime and buffer reuse', () => {
    const res = resource(), a = fixture(res), b = fixture(res);
    a.proof.setEnabled(true); b.proof.setEnabled(true);
    expect(a.proof.active).toBe(true); expect(a.proof.originalMeshes.every(m => !m.material.colorWrite && !m.material.depthWrite)).toBe(true);
    const geo = a.proof.batch.geometry, edge = a.proof.batch.children[0];
    for (let i = 0; i < 20; i++) a.proof.update();
    expect(a.proof.batch.geometry).toBe(geo); expect(a.proof.batch.children[0]).toBe(edge);
    expect((edge as THREE.Mesh).geometry.attributes.position).toBe(geo.attributes.position);
    a.unit.turretTrait.facing = 90; a.proof.update();
    expect(a.proof.active).toBe(false);
    expect(a.proof.originalMeshes.every((m, i) => m.material === a.proof.originals[i])).toBe(true);
    a.proof.dispose(); expect(res.refs).toBe(1); expect(res.disposed).toBe(false); expect(b.proof.active).toBe(true);
    b.proof.dispose(); expect(res.refs).toBe(0); expect(res.disposed).toBe(true);
    expect(() => res.retain()).toThrow('Disposed');
});


test('entity disposal releases its proof and restores callbacks without disposing another instance', () => {
    const res = resource(), a = fixture(res), b = fixture(res);
    const update = a.proof.oldUpdate, dispose = a.proof.oldDispose;
    a.proof.setEnabled(true); b.proof.setEnabled(true);
    a.r.dispose();
    expect(a.proof.disposed).toBe(true); expect(a.r.update).toBe(update); expect(a.r.dispose).toBe(dispose);
    expect(res.refs).toBe(1); expect(b.proof.active).toBe(true);
    b.r.dispose(); expect(res.disposed).toBe(true);
});
