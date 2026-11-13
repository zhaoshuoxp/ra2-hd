import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { BufferGeometryUtils } from '../../src/engine/gfx/BufferGeometryUtils';
import { mergeNativeVxlVertices } from '../../src/engine/renderable/builder/vxlGeometry/mergeNativeVxlVertices';

function compare(source: THREE.BufferGeometry) {
    const expected = BufferGeometryUtils.mergeVertices(source), actual = mergeNativeVxlVertices(source);
    expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
    for (const name of Object.keys(expected.attributes)) {
        const a = actual.getAttribute(name), b = expected.getAttribute(name);
        expect(a.itemSize).toBe(b.itemSize); expect(a.normalized).toBe(b.normalized);
        expect(a.array.constructor).toBe(b.array.constructor);
        expect(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength))
            .toEqual(Buffer.from(b.array.buffer, b.array.byteOffset, b.array.byteLength));
        expect(a.array.byteLength).toBe(a.array.buffer.byteLength);
    }
    expect(actual.index!.array).toEqual(expected.index!.array);
    expect(actual.index!.array).toBeInstanceOf(Uint32Array);
    actual.computeBoundingBox(); expected.computeBoundingBox(); expect(actual.boundingBox).toEqual(expected.boundingBox);
    actual.dispose(); expected.dispose();
}

function fixture(normal = true) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        -0, .00009999, -.00009999, 0, .00001, -.00001, 1, 2, 3, 1, 2, 3, 214749, -214749, 0,
    ]), 3));
    if (normal) geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
        0, 0, 1, 0, 0, 1, 0, 1, 0, 0, -1, 0, 1, 0, 0,
    ]), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([
        16 / 255, 0, 0, 16 / 255, 0, 0, 17 / 255, 0, 0, 18 / 255, 0, 0, 1, 0, 0,
    ]), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([2, 0, 1, 2, 3, 4, 0, 1, 3]), 1));
    return geometry;
}

test('native weld preserves quantization, signed zero, wrapped hashes, normal/color seams and first-index order', () => {
    for (const normal of [true, false]) { const geometry = fixture(normal); compare(geometry); geometry.dispose(); }
});

test('native weld owns compact output arrays and preserves empty meshes', () => {
    const source = fixture(), actual = mergeNativeVxlVertices(source);
    expect(actual.userData).toBe(source.userData);
    actual.attributes.position.array[0] = 99; expect(source.attributes.position.getX(2)).toBe(1);
    actual.index!.array[0] = 99; expect(source.index!.getX(0)).toBe(2);
    actual.dispose(); source.dispose();
    const empty = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) empty.setAttribute(name, new THREE.BufferAttribute(new Float32Array(), 3));
    empty.setIndex(new THREE.BufferAttribute(new Uint32Array(), 1)); compare(empty); empty.dispose();
});

test('non-native layouts retain the generic merger and metadata', () => {
    const source = fixture(); source.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(10), 2));
    source.userData.nativeCase = 'fallback'; source.name = 'named';
    compare(source);
    const actual = mergeNativeVxlVertices(source);
    expect(actual.userData).toEqual(source.userData); expect(actual.name).toBe(source.name);
    actual.dispose(); source.dispose();
    const custom = fixture();
    custom.attributes.position.getX = function(index: number) { return this.array[index * 3] + .5; };
    compare(custom); custom.dispose();
});
