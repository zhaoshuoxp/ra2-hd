import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { nativePose } from '../../src/engine/renderable/rhino/pose';
import { nativeCoverage } from '../../src/engine/renderable/rhino/coverage';

function hierarchy(yaw: number, pitch = 0, slopeYaw = 0) {
    const root = new THREE.Object3D(), tiltObj = new THREE.Object3D(), dirWrapObj = new THREE.Object3D();
    const rockingTiltObj = new THREE.Object3D(), mainObj = new THREE.Object3D();
    root.add(tiltObj); tiltObj.add(dirWrapObj); dirWrapObj.add(rockingTiltObj); rockingTiltObj.add(mainObj);
    tiltObj.rotation.order = 'YXZ'; tiltObj.rotation.set(pitch, slopeYaw, 0);
    dirWrapObj.rotation.y = yaw - slopeYaw;
    root.updateMatrixWorld(true);
    return { root, tiltObj, dirWrapObj, rockingTiltObj, mainObj };
}
test('flat artwork is exactly unchanged across all intermediate body headings', () => {
    for (let degrees = 0; degrees < 360; degrees++) {
        const r = hierarchy(THREE.MathUtils.degToRad(degrees));
        expect(nativePose(new THREE.Matrix4(), new THREE.Matrix4(), r).elements).toEqual(new THREE.Matrix4().elements);
    }
});
test('coverage blends within the native bridge band without disabling depth or losing alpha', () => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, premultipliedAlpha: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    for (const order of [0,2]) {
        nativeCoverage(mesh, order);
        expect(mesh.renderOrder).toBeGreaterThan(order);
        expect(mesh.renderOrder).toBeLessThan(order+1);
        expect(material.transparent).toBe(false);
        expect(material.blending).toBe(THREE.CustomBlending);
        expect(material.depthTest).toBe(true); expect(material.depthWrite).toBe(false);
        expect(material.blendSrc).toBe(THREE.OneFactor);
        expect(material.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    }
    mesh.geometry.dispose(); material.dispose();
});
test('residual pose matches native pitched, rolled and pivot-translated geometry for independent turret headings', () => {
    for (const body of [0, Math.PI/4, Math.PI/2, Math.PI]) for (const turret of [0, Math.PI/2, Math.PI]) {
        const r = hierarchy(body, THREE.MathUtils.degToRad(25), Math.PI/2);
        r.rockingTiltObj.rotation.z = 0.11; r.rockingTiltObj.position.set(1,2,3);
        r.mainObj.position.set(0,-6,3); r.root.updateMatrixWorld(true);
        const delta = nativePose(new THREE.Matrix4(), new THREE.Matrix4(), r);
        const vertex = new THREE.Vector3(3,5,9);
        const authored = vertex.clone().applyAxisAngle(new THREE.Vector3(0,1,0), turret).applyMatrix4(delta);
        const native = vertex.clone().applyAxisAngle(new THREE.Vector3(0,1,0), turret-body).applyMatrix4(r.mainObj.matrixWorld);
        expect(authored.distanceTo(native)).toBeLessThan(1e-10);
    }
});

test('native cloak visibility accepts normal Player and boxed player references', async () => {
    const { ObjectCloakPlugin } = await import('../../src/engine/renderable/entity/plugin/ObjectCloakPlugin');
    const local={}, enemy={}, object=new THREE.Object3D();
    const unit={owner:enemy,isDestroyed:false,cloakableTrait:{isCloaked:()=>true}};
    for(const player of [local,{value:local}]) {
        const plugin=new ObjectCloakPlugin(unit,player,{haveSharedIntel:(a:any,b:any)=>a===b},{get3DObject:()=>object});
        unit.owner=enemy;plugin.update(0);expect(object.visible).toBe(false);
        unit.owner=local;plugin.update(1);expect(object.visible).toBe(true);
    }
});
