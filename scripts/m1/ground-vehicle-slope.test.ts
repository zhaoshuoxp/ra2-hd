import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';
import { VxlUnitRenderer } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { PartLayer } from '../../src/engine/renderable/rhino/RhinoRenderer';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';

test('the dedicated Rhino renderer keeps its hull and turret rigid on the same slope plane and restores exact flat geometry', () => {
    const camera = new THREE.OrthographicCamera();
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ'); camera.updateMatrixWorld();
    const inverse = new THREE.Matrix4().makeRotationFromEuler(camera.rotation).invert();
    for (const density of [2, 4]) for (const body of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const texture = new THREE.Texture({ width: 80 * density, height: 72 * density } as any);
        const resource: any = { texture, material: () => new HdSpriteMaterial({ map: texture }), retain() {}, release() {} };
        const layers = ['body', 'turret'].map(key => new PartLayer(`${key}-${body}`, resource, camera, new THREE.Object3D()));
        try {
            for (const layer of layers) {
                const geometry = layer.source.geometry, level = Float32Array.from(geometry.getAttribute('position').array);
                layer.setGroundAttitude(true, body, camera);
                const p = geometry.getAttribute('position');
                const points = Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i));
                const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
                expect(normal.length()).toBeGreaterThan(.99);
                for (let i = 0; i < points.length; i++) {
                    expect(Math.abs(normal.dot(points[i].clone().sub(points[0])))).toBeLessThan(.0001);
                    const a = new THREE.Vector3().fromArray(level, i * 3).applyMatrix4(inverse), b = points[i].clone().applyMatrix4(inverse);
                    expect(a.x).toBeCloseTo(b.x, 3); expect(a.y).toBeCloseTo(b.y, 3);
                }
                layer.setGroundAttitude(false, body, camera);
                expect(Array.from(p.array)).toEqual(Array.from(level));
            }
        } finally { layers.forEach(l => l.dispose()); texture.dispose(); }
    }
});

test('ground tanks use a rigid slope surface and retain exact level artwork at both densities', () => {
    const camera = new THREE.OrthographicCamera();
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ'); camera.updateMatrixWorld();
    const inverse = new THREE.Matrix4().makeRotationFromEuler(camera.rotation).invert();
    const paletteHash = 92746184, palette = new THREE.Texture(); TextureUtils.cache.set(paletteHash, palette);
    try {
        for (const density of [2, 4]) for (const name of ['HTNK', 'MTNK', 'LTNK', 'APOC']) {
            const base = new THREE.Texture({ width: 512 * density, height: 128 * density } as any);
            const data = new THREE.Texture(base.image);
            const frames = Array.from({ length: 8 }, (_, i) => ({ heading: i * 45,
                rect: [i * 64 * density, 0, 60 * density, 48 * density], logicalSize: [60, 48], offset: [-30, -25],
                referenceLinear: new THREE.Matrix4().makeRotationY(i * Math.PI / 4).toArray() }));
            const part: any = { key: name + '-body', actor: name, member: name.toLowerCase() + '.vxl', section: 'DUMMY01',
                pageSize: [512 * density, 128 * density], depthBounds: [-31, -26, 31, 24], frames,
                override: { pages: [{ base, data }] } };
            const posObj = new THREE.Object3D(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
            posObj.add(mesh);
            const native: any = { gameObject: { name, isAircraft: () => false, tilterTrait: {} },
                objectArt: { isVoxel: true }, objectRules: { naval: false }, posObj, palette: { hash: paletteHash },
                vxlBuilders: [{ vxlFile: { filename: part.member }, sections: new Map([['DUMMY01', mesh]]) }] };
            const renderer = new VxlUnitRenderer(native, { identity: name, parts: [part], dispose() {} }, camera);
            try {
                for (const layer of renderer.layers[0].frames) {
                    const geometry = layer.source.geometry, level = Float32Array.from(geometry.getAttribute('position').array);
                    const uvs = Array.from(geometry.getAttribute('uv').array);
                    layer.setGroundAttitude(true);
                    const actual = geometry.getAttribute('position');
                    const points = Array.from({ length: actual.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(actual, i));
                    let normal: THREE.Vector3 | undefined;
                    for (let i = 1; i + 1 < points.length && !normal; i++) {
                        const cross = points[i].clone().sub(points[0]).cross(points[i + 1].clone().sub(points[0]));
                        if (cross.length() > .001) normal = cross.normalize();
                    }
                    expect(normal).toBeDefined();
                    for (let i = 0; i < points.length; i++) {
                        expect(Math.abs(normal!.dot(points[i].clone().sub(points[0])))).toBeLessThan(.0001);
                        const original = new THREE.Vector3().fromArray(level, i * 3).applyMatrix4(inverse);
                        const slope = points[i].clone().applyMatrix4(inverse);
                        expect(slope.x).toBeCloseTo(original.x, 3); expect(slope.y).toBeCloseTo(original.y, 3);
                    }
                    expect(Array.from(geometry.getAttribute('uv').array)).toEqual(uvs);
                    for (const angle of [-25, 25]) {
                        const tilt = new THREE.Matrix4().makeRotationX(angle * Math.PI / 180);
                        expect(points[0].clone().applyMatrix4(tilt).distanceTo(points.at(-1)!.clone().applyMatrix4(tilt)))
                            .toBeCloseTo(points[0].distanceTo(points.at(-1)!), 5);
                    }
                    layer.setGroundAttitude(false); expect(Array.from(actual.array)).toEqual(Array.from(level));
                }
            } finally { renderer.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); base.dispose(); data.dispose(); }
        }
    } finally { TextureUtils.cache.delete(paletteHash); palette.dispose(); }
});
