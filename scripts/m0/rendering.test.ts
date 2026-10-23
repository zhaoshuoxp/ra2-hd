await import('../windows-hd/browser-test-setup');
import { expect, test } from 'bun:test';
import * as THREE from 'three';
const { BoxedVar } = await import('../../src/util/BoxedVar');
const { WorldScene } = await import('../../src/engine/renderable/WorldScene');
const { ShadowQuality } = await import('../../src/engine/renderable/entity/unit/ShadowQuality');
const { MapSurface } = await import('../../src/engine/renderable/entity/map/MapSurface');
const { Renderer } = await import('../../src/engine/gfx/Renderer');
const { OctreeContainer } = await import('../../src/engine/gfx/OctreeContainer');

test('shadow frustum includes map-scale geometry and quality changes release the old target', () => {
    const scene=WorldScene.factory({x:0,y:0,width:1112,height:928},new BoxedVar(false),new BoxedVar(ShadowQuality.High));
    const light=new THREE.DirectionalLight();
    scene.updateShadowQuality(light,ShadowQuality.High);
    const camera=light.shadow.camera;
    const point=new THREE.Vector3(10000,10000,-1000).applyMatrix4(camera.projectionMatrix);
    expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(2/(camera.right-camera.left),8);
    const target=light.shadow.map=new THREE.WebGLRenderTarget(8192,8192);
    let disposed=false;target.addEventListener('dispose',()=>{disposed=true;});
    scene.updateShadowQuality(light,ShadowQuality.Low);
    expect(disposed).toBe(true);expect(light.shadow.map).toBeNull();
    expect(light.shadow.mapSize.toArray()).toEqual([2048,2048]);
    scene.updateShadowQuality(light,ShadowQuality.Off);expect(light.castShadow).toBe(false);
    expect(scene.camera.zoom).toBe(1);expect(scene.camera.rotation.order).toBe('YXZ');
});

test('shadow receiver has finite upward normals and cannot pollute later depth passes', () => {
    const surface=new MapSurface({tiles:[{rx:0,ry:0,z:0,rampType:0}]},{});
    surface.create3DObject();
    const mesh=surface.get3DObject() as THREE.Mesh<THREE.BufferGeometry,THREE.ShadowMaterial>;
    const normals=mesh.geometry.attributes.normal;
    for(let i=0;i<normals.count;i++)expect(normals.getY(i)).toBeCloseTo(1);
    expect(mesh.material.depthWrite).toBe(false);expect(mesh.receiveShadow).toBe(true);
    surface.dispose();
});

test('scene clear enables depth writes after a transparent previous pass', () => {
    const renderer=new Renderer(1280,960);let mask=false, clears=0;
    (renderer as any).renderer={state:{buffers:{depth:{setMask:(value:boolean)=>{mask=value;}}}},
        clear:()=>{expect(mask).toBe(true);clears++;}, clearDepth:()=>{expect(mask).toBe(true);clears++;},
        setViewport:()=>{},render:()=>{mask=false;}};
    (renderer as any).scenes=new Set([0,1].map(()=>({viewport:{x:0,y:0,width:1280,height:960}})));
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } });
    (renderer as any).lastDeviceRatio = 1;
    try { renderer.render(); expect(clears).toBe(3); }
    finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else delete (globalThis as any).window;
    }
});

test('render phase reaches units through world and octree containers', () => {
    const world=WorldScene.factory({x:0,y:0,width:1112,height:928},new BoxedVar(false),new BoxedVar(ShadowQuality.High));
    const octree=new OctreeContainer({} as any,{} as any,world.camera);octree.autoCull=false;
    let sample:number[]=[];
    octree.add({create3DObject(){},get3DObject:()=>undefined,update:(...args:number[])=>{sample=args;}});
    world.add(octree);world.update(1000,0.75);
    expect(sample).toEqual([1000,0.75]);
});
