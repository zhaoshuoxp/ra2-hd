import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { ShpBuilder } from '../../src/engine/renderable/builder/ShpBuilder';

// The cached suffix must always equal a freshly built key, including after
// fields that callers mutate directly (flat, coverage flags, HD override).
test('cached geometry keys match freshly built keys under every input change', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1);
    camera.rotation.set(-0.6, 0.78, 0, 'YXZ');
    const builder: any = new ShpBuilder({ width: 60, height: 48, numImages: 8 }, {}, camera, 1, true, 3);
    const check = () => {
        for (const frame of [0, 3, 7]) expect(builder.getGeometryCacheKey(frame)).toBe(builder.buildGeometryCacheKey(frame));
    };
    check();
    const mutations = [
        () => builder.setFrameOffset(5), () => builder.setOffset({ x: 3, y: -2 }), () => builder.setAlign(0, 1),
        () => { builder.flat = true; }, () => builder.setSize({ width: 30, height: 20 }),
        () => { builder.shadowCoverage = true; }, () => { builder.embeddedShadow = true; },
        () => { builder.hdOverride = { identity: 'hd-a', frames: [], pages: [] }; },
        () => { builder.hdOverride = { identity: 'hd-b', frames: [], pages: [] }; },
        () => { builder.hdDepthOffset = -1; },
        () => { builder.hdOverride = undefined; },
        () => { builder.align.x = 1; }, () => camera.rotation.set(-0.5, 0.78, 0, 'YXZ'),
        () => builder.setUiAnchorCompensation(true),
    ];
    for (const mutate of mutations) { mutate(); check(); }
});

test('HD layer depth changes occlusion without moving pixels and restores native depth on fallback', () => {
    const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, .1, 1000);
    camera.rotation.set(-.6, .78, 0, 'YXZ');
    camera.updateMatrixWorld();
    const texture = { image: { width: 60, height: 48 } };
    const area = { x: 0, y: 0, width: 60, height: 48 };
    const shp = { width: 60, height: 48, numImages: 1, getImage: () => ({ x: 0, y: 0 }) };
    const builder: any = new ShpBuilder(shp, {}, camera, 1, true, 1);
    builder.atlas = { getTexture: () => texture, getTextureArea: () => area };
    const project = () => {
        const positions = builder.createGeometry(0).getAttribute('position');
        return Array.from({ length: positions.count }, (_, i) =>
            new THREE.Vector3().fromBufferAttribute(positions, i).project(camera));
    };
    const native = project(), nativeKey = builder.getGeometryCacheKey(0);
    builder.hdDepthOffset = -1;
    expect(builder.getGeometryCacheKey(0)).toBe(nativeKey);
    builder.hdOverride = { identity: 'crane', frames: [{ page: 0, sampleRect: area }], pages: [{ base: texture }] };
    const hd = project();
    for (let i = 0; i < hd.length; i++) {
        expect(hd[i].x).toBeCloseTo(native[i].x, 6);
        expect(hd[i].y).toBeCloseTo(native[i].y, 6);
        expect(Math.abs(hd[i].z - native[i].z)).toBeGreaterThan(.001);
    }
    builder.hdOverride = undefined;
    expect(project()).toEqual(native);
    expect(builder.getGeometryCacheKey(0)).toBe(nativeKey);
});
