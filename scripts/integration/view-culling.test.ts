import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { OctreeContainer } from '../../src/engine/gfx/OctreeContainer';
import { updateSceneMatrices } from '../../src/engine/gfx/SceneMatrices';
import { isViewCulled, setViewCulled, viewCullExtent } from '../../src/engine/gfx/ViewCulling';

const VIEWPORT_WIDTH = 1000;
const fixture = () => {
    const scene = new THREE.Scene(); scene.matrixAutoUpdate = false; scene.matrixWorldAutoUpdate = false;
    scene.position.set(-10, 0, -10); scene.updateMatrix();
    // 1000 px view over 2000 world units: two world units per screen pixel.
    const camera = new THREE.OrthographicCamera(-1000, 1000, 600, -600, -5000, 5000);
    camera.position.set(0, 0, 100); scene.add(camera);
    const container = OctreeContainer.factory(camera);
    const root = container.get3DObject()!; scene.add(root);
    const restored: string[] = [];
    const renderable = (name: string, x: number, gameObject: any = { isAircraft: () => false, isBuilding: () => false }) => {
        const target = new THREE.Group(); target.name = name; target.matrixAutoUpdate = false;
        const joint = new THREE.Group(); target.add(joint);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; joint.add(mesh);
        const r = { gameObject, target, joint, mesh, setPosition(p: THREE.Vector3) { target.position.copy(p); target.updateMatrix(); },
            get3DObject: () => target, create3DObject() {}, update() {}, onViewCullRestore: () => restored.push(name) };
        r.setPosition(new THREE.Vector3(x, 0, 0));
        container.add(r as any);
        return r;
    };
    const frame = () => { container.update(0); container.cullRenderables(VIEWPORT_WIDTH); updateSceneMatrices(scene); };
    const expected = (r: any) => scene.matrix.clone().multiply(r.target.matrix).multiply(r.joint.matrix).multiply(r.mesh.matrix).elements;
    return { scene, camera, container, renderable, frame, restored, expected };
};
const drawn = (scene: THREE.Scene) => { const names: string[] = []; scene.traverseVisible(o => { if ((o as THREE.Mesh).isMesh) names.push(o.parent!.parent!.name); }); return names.sort(); };

test('objects outside the padded view leave traversal and keep game visibility', () => {
    const f = fixture();
    const near = f.renderable('near', 0), edge = f.renderable('edge', 1600), far = f.renderable('far', 9000);
    f.frame();
    // The 360 px horizontal margin covers 720 world units beyond the 1000 unit half width.
    expect(drawn(f.scene)).toEqual(['edge', 'near']);
    expect(isViewCulled(far.target)).toBe(true);
    far.target.visible = false;
    f.frame();
    far.setPosition(new THREE.Vector3(100, 0, 0)); f.frame();
    expect(isViewCulled(far.target)).toBe(false);
    expect(far.target.visible).toBe(false);
    far.target.visible = true;
    expect(drawn(f.scene)).toEqual(['edge', 'far', 'near']);
    expect(f.restored).toEqual(['far']);
    expect(near.target.visible && edge.target.visible).toBe(true);
});

test('culled subtrees skip matrix work and are current once restored', () => {
    const f = fixture();
    const unit = f.renderable('unit', 9000);
    f.frame();
    let products = 0; const multiply = unit.mesh.matrixWorld.multiplyMatrices;
    unit.mesh.matrixWorld.multiplyMatrices = function (...args) { products++; return multiply.apply(this, args); };
    // Moved and animated while culled, then stopped.
    unit.setPosition(new THREE.Vector3(9500, 0, 30)); unit.joint.rotation.y = .4; unit.mesh.position.y = 4; unit.mesh.updateMatrix();
    f.frame(); f.frame();
    expect(products).toBe(0);
    // The camera reaches the unit without another position change.
    f.camera.position.x = 9500; f.camera.updateMatrixWorld(); f.frame();
    expect(isViewCulled(unit.target)).toBe(false);
    expect(unit.mesh.matrixWorld.elements).toEqual(f.expected(unit));
});

test('a forced container pass reaches culled actors when they are restored', () => {
    const f = fixture();
    const unit = f.renderable('unit', 9000);
    f.frame();
    f.scene.position.x -= 3; f.scene.updateMatrix(); f.container.get3DObject()!.matrixWorldNeedsUpdate = true; f.frame();
    f.camera.position.x = 9000; f.camera.updateMatrixWorld(); f.frame();
    expect(unit.mesh.matrixWorld.elements).toEqual(f.expected(unit));
});

test('aircraft, range circles and non-positioned renderables are never culled', () => {
    expect(viewCullExtent({ gameObject: { isAircraft: () => true }, setPosition() {} })).toBeUndefined();
    expect(viewCullExtent({ setPosition() {} })).toBeUndefined();
    expect(viewCullExtent({ gameObject: { isBuilding: () => true, getFoundation: () => ({ width: 4, height: 3 }) }, setPosition() {} })).toBe(300);
    const f = fixture();
    const plane = f.renderable('plane', 9000, { isAircraft: () => true });
    const radar = f.renderable('radar', 9000, { isAircraft: () => false, isBuilding: () => true, getFoundation: () => ({ width: 2, height: 2 }) });
    (radar as any).rangeCircleWrapper = { visible: true };
    f.frame();
    expect(isViewCulled(plane.target) || isViewCulled(radar.target)).toBe(false);
    (radar as any).rangeCircleWrapper.visible = false; f.frame();
    expect(isViewCulled(radar.target)).toBe(true);
});

test('state changes are reported once', () => {
    const object = new THREE.Object3D();
    expect(setViewCulled(object, false)).toBe(false);
    expect(setViewCulled(object, true)).toBe(true);
    expect(setViewCulled(object, true)).toBe(false);
    expect(object.visible).toBe(false);
    expect(setViewCulled(object, false)).toBe(true);
    expect(object.visible).toBe(true);
});
