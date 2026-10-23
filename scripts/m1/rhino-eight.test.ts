import { test, expect } from 'bun:test';
import * as THREE from 'three';
import { ArtworkResource } from './rhino-sprite/adapter';
import { PartResources, RhinoPartsProof } from './rhino-eight/adapter';
import { supported, heading } from './rhino-eight/contract';
import { verifyBytes } from './rhino-sprite/contract';
import { Coords } from '../../src/game/Coords';

function resources() {
    return new PartResources(new Map(['body','turret'].flatMap(p=>[0,45,90,135,180,225,270,315].map(h=>`${p}-${h}`)).map(key =>
        [key, new ArtworkResource(new THREE.DataTexture(new Uint8Array(320*288*4),320,288))])), {});
}
function fixture(res = resources()) {
    const owner = { color: { r:255, g:24, b:24 } }, unit: any = { name: 'HTNK', owner, direction: 0, turretTrait: { facing: 0 } };
    const posObj = new THREE.Group(), turret = new THREE.Group();posObj.add(turret);
    const meshes = [0,1,2].map(()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()));
    const r: any = { gameObject: unit, vxlBuilders: meshes.map(m=>({sections:new Map([['DUMMY01',m]])})),
        turret, posObj, shpExtraLight: new THREE.Vector3(), mainObj:new THREE.Group(),
        tiltObj:new THREE.Group(),rockingTiltObj:new THREE.Group(),update(){},dispose(){} };
    const scale = Coords.COS_ISO_CAMERA_BETA * Coords.ISO_WORLD_SCALE;
    const camera=new THREE.OrthographicCamera(-716*scale,716*scale,434*scale,-434*scale,0,100000);
    camera.rotation.order='YXZ';camera.rotation.set(-Math.PI/6,Math.PI/4,0);camera.updateMatrixWorld();
    return { proof:new RhinoPartsProof(r,res,camera),unit,r,camera,res };
}

test('deterministic bytes validate SHA-256 and reject changed content and identity', async () => {
    // Standard SHA-256 vector, deliberately unrelated to retired accepted artwork.
    const bytes = new TextEncoder().encode('abc').buffer;
    const hash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    await verifyBytes(bytes, hash);
    await expect(verifyBytes(new TextEncoder().encode('abd').buffer, hash)).rejects.toThrow('identity');
    await expect(verifyBytes(bytes, '0'.repeat(64))).rejects.toThrow('identity');
});

test('heading eligibility is circular, quantized and fail-closed with original state exclusions',()=>{
    const f=fixture();
    for(const b of [0,45,90,135,180,225,270,315,359.9,22.49,22.5,360,-270]) for(const t of [0,45,90,135,180,225,270,315,359.9,22.49,22.5,360,-270]) expect(supported({...f.unit,direction:b,turretTrait:{facing:t}},f.unit.owner)).toBe(true);
    for(const value of [NaN,Infinity,undefined]) expect(heading(value as number)).toBeUndefined();
    for(const patch of [{isFiring:true},{isDestroyed:true},{onBridge:true},{tileElevation:1},{owner:{}},{name:'MTNK'},{tile:{rampType:1}}]) expect(supported({...f.unit,...patch},f.unit.owner)).toBe(false);
    f.proof.dispose();
});

test('two independently selected components reuse geometry, projection and exact native transform objects',()=>{
    const f=fixture(),a=f.proof;
    const refs=[...a.layers.values()].map(l=>l.batch.geometry);
    const matrices=a.originalMeshes.map(m=>m.matrix.elements.slice());
    a.setEnabled(true);
    for(const b of [0,45,90,135,180,225,270,315]) for(const t of [0,45,90,135,180,225,270,315]) {
        f.unit.direction=b;f.unit.turretTrait.facing=t;a.update();expect(a.active).toBe(true);
        expect([...a.layers].filter(([,l])=>l.batch.visible).map(([k])=>k)).toEqual([`body-${b}`,`turret-${t}`]);
        expect(a.originalMeshes.map(m=>m.matrix.elements)).toEqual(matrices);
        const points=[...a.layers.values()].map(l=>Array.from({length:l.source.geometry.attributes.position.count},(_,i)=>
            new THREE.Vector3().fromBufferAttribute(l.source.geometry.attributes.position,i).project(f.camera)));
        for(let i=0;i<points[0].length;i++) for(let j=1;j<16;j++) {
            expect(points[j][i].x).toBeCloseTo(points[0][i].x,6);expect(points[j][i].y).toBeCloseTo(points[0][i].y,6);
        }
    }
    expect([...a.layers.values()].map(l=>l.batch.geometry)).toEqual(refs);
    f.proof.dispose();
});

test('fallback never leaves a partial vehicle, including owner and tilt',()=>{
    const f=fixture(),a=f.proof;a.setEnabled(true);
    const fallback=()=>{a.update();expect(a.active).toBe(false);expect(a.originalMeshes.every((m,i)=>m.material===a.originals[i])).toBe(true);
        expect([...a.layers.values()].every(l=>!l.batch.visible&&!l.proxy.visible)).toBe(true);};
    f.unit.turretTrait.facing=NaN;fallback();f.unit.turretTrait.facing=0;
    f.unit.owner.color.b=255;fallback();f.unit.owner.color.b=24;
    f.r.tiltObj.rotation.x=0.1;fallback();f.r.tiltObj.rotation.x=0;
    a.update();expect(a.active).toBe(true);a.dispose();
});

test('shared sixteen-part lifetime survives independent entity disposal and restores exact hooks',()=>{
    const res=resources(),a=fixture(res),b=fixture(res);a.proof.setEnabled(true);b.proof.setEnabled(true);
    const update=a.proof.oldUpdate,dispose=a.proof.oldDispose;
    a.r.dispose();expect(a.r.update).toBe(update);expect(a.r.dispose).toBe(dispose);
    expect([...res.parts.values()].every(p=>p.refs===1&&!p.disposed)).toBe(true);expect(b.proof.active).toBe(true);
    b.r.dispose();expect([...res.parts.values()].every(p=>p.refs===0&&p.disposed)).toBe(true);
});

test('octant boundaries have a maximum 22.5 degree visual error without changing native angles',()=>{
    expect(heading(22.499)).toBe(0);expect(heading(22.5)).toBe(45);expect(heading(337.5)).toBe(0);expect(heading(-22.501)).toBe(315);
    const f=fixture();f.proof.setEnabled(true);
    for(let b=-360;b<720;b+=7.3){const t=b+113.2;f.unit.direction=b;f.unit.turretTrait.facing=t;f.proof.update();
        expect(f.unit.direction).toBe(b);expect(f.unit.turretTrait.facing).toBe(t);expect(f.proof.active).toBe(true);
        expect(Math.abs((((heading(b)!-b)+540)%360+360)%360-180)).toBeLessThanOrEqual(22.500001);
    }f.proof.dispose();
});

test('native in-place turning velocity stays supported and untouched',()=>{
    const f=fixture();f.proof.setEnabled(true);
    for(const spin of [-7.03125,7.03125]) {
        f.unit.spinVelocity=spin;f.unit.direction=137.8125;f.unit.turretTrait.facing=220.5;f.proof.update();
        expect(f.proof.active).toBe(true);expect(f.unit.spinVelocity).toBe(spin);
        expect([...f.proof.layers].filter(([,l])=>l.batch.visible).map(([k])=>k)).toEqual(['body-135','turret-225']);
    }
    f.unit.spinVelocity=NaN;f.proof.update();expect(f.proof.active).toBe(false);f.proof.dispose();
});

test('presentation follows the rendered interpolated body angle, not only the last game tick',()=>{
    const f=fixture();f.r.dirWrapObj=new THREE.Group();f.r.dirWrapObj.rotation.y=THREE.MathUtils.degToRad(25);
    f.unit.direction=20;f.unit.turretTrait.facing=91.9;f.proof.setEnabled(true);
    expect([...f.proof.layers].filter(([,l])=>l.batch.visible).map(([k])=>k)).toEqual(['body-45','turret-90']);
    expect(f.unit.direction).toBe(20);expect(f.unit.turretTrait.facing).toBe(91.9);f.proof.dispose();
});
