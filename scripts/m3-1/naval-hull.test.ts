import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';
import { componentGeometry } from '../../src/engine/renderable/unitVxl/componentGeometry';
import { VxlUnitRenderer } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';

test('native renderer keeps civilian and future naval hulls above water without moving their projected artwork', () => {
    const camera = new THREE.OrthographicCamera();
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0); camera.updateMatrixWorld();
    const inverse = new THREE.Matrix4().makeRotationFromEuler(camera.rotation).invert();
    const paletteHash = 92746183, palette = new THREE.Texture();
    TextureUtils.cache.set(paletteHash, palette);
    try {
        for (const density of [2, 4]) for (const name of ['CRUISE', 'TUG', 'DEST', 'FUTURE_NAVAL', 'PDPLANE', 'ZEP']) {
            const airborne = name === 'PDPLANE' || name === 'ZEP';
            const base = new THREE.Texture({ width: 512 * density, height: 128 * density } as any);
            const data = new THREE.Texture(base.image);
            const frames = Array.from({ length: 8 }, (_, i) => ({ heading: i * 45,
                rect: [i * 64 * density, 0, 60 * density, 48 * density] as [number, number, number, number],
                logicalSize: [60, 48] as [number, number], offset: [-30, -25] as [number, number],
                referenceLinear: new THREE.Matrix4().toArray() }));
            const part: any = { key: name + '-body', actor: name, member: name.toLowerCase() + '.vxl',
                section: 'DUMMY01', pageSize: [512 * density, 128 * density],
                depthBounds: [-31, -26, 31, 24], frames, override: { pages: [{ base, data }] } };
            const posObj = new THREE.Object3D();
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); posObj.add(mesh);
            const native = { gameObject: { name, isAircraft: () => name === 'PDPLANE' },
                objectArt: { isVoxel: true }, objectRules: { naval: !airborne, balloonHover: name === 'ZEP' },
                posObj, palette: { hash: paletteHash },
                vxlBuilders: [{ vxlFile: { filename: part.member }, sections: new Map([['DUMMY01', mesh]]) }] };
            const renderer = new VxlUnitRenderer(native, { identity: name, parts: [part], dispose() {} }, camera);
            try {
                for (const layer of renderer.layers[0].frames) {
                    const control = componentGeometry(part, layer.frame, camera, false, 0);
                    const original = control.getAttribute('position'), actual = layer.source.geometry.getAttribute('position');
                    expect(actual.count).toBe(original.count);
                    expect(Array.from(layer.source.geometry.getAttribute('uv').array))
                        .toEqual(Array.from(control.getAttribute('uv').array));
                    let lowest = Infinity;
                    for (let i = 0; i < actual.count; i++) {
                        const a = new THREE.Vector3().fromBufferAttribute(original, i);
                        const b = new THREE.Vector3().fromBufferAttribute(actual, i);
                        lowest = Math.min(lowest, b.y);
                        const before = a.applyMatrix4(inverse), after = b.clone().applyMatrix4(inverse);
                        expect(after.x).toBeCloseTo(before.x, 3); expect(after.y).toBeCloseTo(before.y, 3);
                    }
                    if (airborne) expect(Array.from(actual.array)).toEqual(Array.from(original.array));
                    else {
                        expect(lowest).toBeGreaterThanOrEqual(.0999);
                        // Recovery is local to the reference pose; native sinking can still cross water.
                        expect(lowest - 100).toBeLessThan(0);
                    }
                    control.dispose();
                }
            } finally {
                renderer.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); base.dispose(); data.dispose();
            }
        }
    } finally { TextureUtils.cache.delete(paletteHash); palette.dispose(); }
});
