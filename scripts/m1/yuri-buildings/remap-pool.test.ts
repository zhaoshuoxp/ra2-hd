import { expect, test } from 'bun:test';
import { poolSerializedHdRemap } from '../../../src/engine/renderable/builder/poolSerializedHdRemap';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';
import * as THREE from 'three';

test('independent remap pool reconstructs every categorical byte and clones its shader binding', () => {
    const width = 128, height = 80, source = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        source[at] = x % 5 ? 255 : 0; source[at + 1] = (x + y) % 16; source[at + 3] = 255;
    }
    const pooled = poolSerializedHdRemap(source, width, height);
    const packed = new Uint8Array(width * height * 2);
    for (let i = 0; i < width * height; i++) packed.set(source.subarray(i * 4, i * 4 + 2), i * 2);
    const compact = poolSerializedHdRemap(packed, width, height, 2);
    expect(compact.gpuBytes).toBe(pooled.gpuBytes);
    expect(compact.data.image.data).toEqual(pooled.data.image.data);
    expect(compact.map.image.data).toEqual(pooled.map.image.data);
    expect(() => poolSerializedHdRemap(packed.subarray(2), width, height, 2)).toThrow('remap-pool-shape');
    compact.data.dispose(); compact.map.dispose();
    const lookup = pooled.map.image.data as Uint8Array, pixels = pooled.data.image.data as Uint8Array;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (Math.floor(y / 4) * (width / 4) + Math.floor(x / 4)) * 4;
        const id = lookup[at] + lookup[at + 1] * 256 + lookup[at + 2] * 65536;
        const columns = pooled.data.image.width / 4;
        const target = ((Math.floor(id / columns) * 4 + y % 4) * pooled.data.image.width + id % columns * 4 + x % 4) * 2;
        expect(Array.from(pixels.subarray(target, target + 2))).toEqual(Array.from(source.subarray((y * width + x) * 4, (y * width + x) * 4 + 2)));
    }
    expect(pooled.gpuBytes).toBeLessThan(width * height * 2);
    const color = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height);
    const map = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    const material = new HdSpriteMaterial({ map: color, remapMap: pooled.data,
        tiles: { map, dataMap: pooled.map, virtualSize: [8, 8] } });
    material.enableFiltering('full');
    expect(material.fragmentShader).toContain('texture2D(remapMap, hdRemapUv(uv))');
    const clone = material.clone();
    expect(clone.uniforms.hdRemapTileMap.value).toBe(pooled.map);
    expect(clone.customProgramCacheKey()).toContain('lossless-remap-tiles-v1');
    clone.dispose(); material.dispose(); color.dispose(); map.dispose(); pooled.data.dispose(); pooled.map.dispose();
});
