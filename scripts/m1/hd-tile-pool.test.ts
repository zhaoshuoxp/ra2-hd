import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { poolHdPage } from '../../src/engine/renderable/builder/poolHdPage';
import { HdSpriteMaterial } from '../../src/engine/gfx/material/HdSpriteMaterial';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';
import { disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';

export function tileFixture(width = 67, height = 53) {
    const rgba = new Uint8Array(width * height * 4), remap = new Uint8Array(rgba.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4;
        rgba.set([x % 8 * 31, y % 8 * 31, (x + y) % 4 * 60, (x + y) % 3 * 127], at);
        remap.set([(x % 4) * 85, y % 16, 0, 255], at);
    }
    return [{ width, height, rgba }, { width, height, rgba: remap }];
}

test('lossless paired tile pooling reconstructs all bytes, partial boundary tiles and alpha-zero RGB', () => {
    const [base, data] = tileFixture(), p = poolHdPage(base, data, 2048)!;
    expect(p).toBeDefined(); expect(p.gpuBytes).toBeLessThan(base.rgba.length);
    expect(p.tiles.virtualSize).toEqual([base.width, base.height]);
    const map = p.tiles.map.image, color = p.base.image, remap = p.data.image;
    let mismatches = 0;
    for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
        const at = (Math.floor(y / 4) * map.width + Math.floor(x / 4)) * 4;
        const id = map.data[at] + map.data[at + 1] * 256 + map.data[at + 2] * 65536;
        const poolX = id % (color.width / 4) * 4 + x % 4;
        const poolY = Math.floor(id / (color.width / 4)) * 4 + y % 4;
        const pool = poolY * color.width + poolX, original = (y * base.width + x) * 4;
        for (let c = 0; c < 4; c++) mismatches += Number(color.data[pool * 4 + c] !== base.rgba[original + c]);
        for (let c = 0; c < 2; c++) mismatches += Number(remap.data[pool * 2 + c] !== data.rgba[original + c]);
    }
    expect(mismatches).toBe(0);
    expect(p.base.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(p.tiles.map.colorSpace).toBe(THREE.NoColorSpace);
    expect(p.base.flipY).toBe(false); expect(p.data.format).toBe(THREE.RGFormat);
    let disposed = 0;
    for (const t of [p.base, p.data, p.tiles.map]) t.addEventListener('dispose', () => disposed++);
    disposeHdSprite({ identity: 'fixture', frames: [], pages: [p] }); expect(disposed).toBe(3);
});

test('pooled atlas preserves geometry and UVs; filtering and cloned edge materials share one lookup', () => {
    const [base, data] = tileFixture(), p = poolHdPage(base, data, 2048)!;
    const atlas = new THREE.DataTexture(base.rgba, base.width, base.height);
    const camera = new THREE.PerspectiveCamera(); camera.rotation.set(-0.62, 0.78, 0);
    const options = { camera, texture: atlas, textureArea: { x: 5, y: 7, width: 28, height: 32 },
        logicalSize: { width: 14, height: 16 }, offset: { x: -9, y: -13 }, align: { x: 1, y: -1 }, depth: true };
    const original = SpriteUtils.createSpriteGeometry(options);
    const pooled = SpriteUtils.createSpriteGeometry({ ...options, texture: p.base,
        textureSize: { width: base.width, height: base.height } });
    for (const key of ['position', 'uv']) expect(pooled.attributes[key].array).toEqual(original.attributes[key].array);
    const material = new HdSpriteMaterial({ map: p.base, remapMap: p.data, tiles: p.tiles });
    material.enableFiltering('opaque');
    const edge = material.clone(); edge.enableFiltering('edge');
    expect(edge.uniforms.hdTileMap.value).toBe(p.tiles.map);
    expect(edge.uniforms.remapMap.value).toBe(p.data);
    expect(edge.uniforms.hdTextureSize.value).toEqual([base.width, base.height]);
    expect(edge.defines.HD_TILE_POOL).toBe('');
    original.dispose(); pooled.dispose(); material.dispose(); edge.dispose(); atlas.dispose();
    disposeHdSprite({ identity: 'fixture', frames: [], pages: [p] });
});

test('pooling declines non-saving or hardware-incompatible pages', () => {
    const [base, data] = tileFixture(3, 3);
    expect(poolHdPage(base, data, 2048)).toBeUndefined();
    expect(poolHdPage(...tileFixture() as [typeof base, typeof data], 4)).toBeUndefined();
});

test('distinct tiles with the same hash retain separate lossless storage', () => {
    const width = 64, height = 64;
    const rgba = new Uint8Array(width * height * 4), data = new Uint8Array(rgba.length);
    const words = new Uint32Array(rgba.buffer), prime = 16777619, inverse = 899433627;
    let zeroHash = 2166136261;
    for (let i = 0; i < 32; i++) zeroHash = Math.imul(zeroHash, prime);
    let modifiedHash = Math.imul(2166136261 ^ 123, prime);
    modifiedHash = Math.imul(modifiedHash, prime);
    for (let i = 2; i < 30; i++) modifiedHash = Math.imul(modifiedHash, prime);
    words[4] = 123;
    words[3 * width + 7] = modifiedHash ^ Math.imul(Math.imul(zeroHash, inverse), inverse);
    const pooled = poolHdPage({ width, height, rgba }, { width, height, rgba: data }, 2048)!;
    const map = pooled.tiles.map.image.data;
    expect([...map.slice(0, 3)]).not.toEqual([...map.slice(4, 7)]);
    const color = new Uint32Array(pooled.base.image.data.buffer);
    const id = map[4] + map[5] * 256 + map[6] * 65536;
    const px = id % (pooled.base.image.width / 4) * 4;
    const py = Math.floor(id / (pooled.base.image.width / 4)) * 4;
    expect(color[py * pooled.base.image.width + px]).toBe(123);
    expect(color[(py + 3) * pooled.base.image.width + px + 3]).toBe(words[3 * width + 7]);
    disposeHdSprite({ identity: 'collision', frames: [], pages: [pooled] });
});
