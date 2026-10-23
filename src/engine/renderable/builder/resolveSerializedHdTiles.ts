import * as THREE from 'three';
import { poolSerializedHdRemap } from './poolSerializedHdRemap';
import type { DecodedHdPage, HdPageReader } from './resolveHdSprite';
import type { HdSpriteOverride } from './HdSpriteOverride';

// Serialized form of the existing private 4px pool. Physical textures and the
// lookup remain bounded by 2048; virtual coordinates never change world geometry.
export const serializedHdTiles = 'lossless-four-pixel-pool-v1';
const reject = (reason: string): never => { throw new Error(reason); };
export function validateSerializedHdTilePage(page: any, limit: number) {
    const dimensions = (value: any, max: number) => Array.isArray(value) && value.length === 2
        && value.every((n: any) => Number.isSafeInteger(n) && n > 0 && n <= max);
    if (!dimensions(page.size, limit) || page.size.some((n: number) => n % 4)
        || !dimensions(page.virtualSize, limit * 4) || page.virtualSize.some((n: number) => n % 4)
        || !dimensions(page.mapSize, limit) || page.mapSize.some((n: number, i: number) => n * 4 !== page.virtualSize[i])
        || !Number.isSafeInteger(page.tileCount) || page.tileCount < 1
        || page.tileCount > page.size[0] * page.size[1] / 16) reject('invalid-serialized-tile-layout');
}

export async function resolveSerializedHdTilePage(page: any, frames: any[], logical: any[], read: HdPageReader) {
    const decoded: DecodedHdPage[] = [];
    for (const role of ['base', 'data', 'map']) {
        const value = await read(page[role], page[`${role}Sha256`], page[`${role}Bytes`]);
        const size = role === 'map' ? page.mapSize : page.size;
        if (value.width !== size[0] || value.height !== size[1] || value.rgba.length !== size[0] * size[1] * 4)
            reject('decoded-size-mismatch');
        decoded.push(value);
    }
    const [base, data, lookup] = decoded;
    for (let at = 0; at < data.rgba.length; at += 4) {
        if (data.rgba[at + 1] > 15 || data.rgba[at + 2] || data.rgba[at + 3] !== 255)
            reject('invalid-remap-data');
        if (!base.rgba[at + 3] && data.rgba[at]) reject('remap-outside-coverage');
    }
    const ids = new Uint32Array(lookup.width * lookup.height);
    for (let at = 0; at < lookup.rgba.length; at += 4) {
        const id = lookup.rgba[at] + lookup.rgba[at + 1] * 256 + lookup.rgba[at + 2] * 65536;
        if (lookup.rgba[at + 3] !== 255 || id >= page.tileCount) reject('invalid-tile-reference');
        ids[at / 4] = id;
    }
    const [width, height] = page.virtualSize;
    const content = new Uint8Array(width * height);
    for (const frame of frames) {
        if (logical[frame.nativeFrame].empty) continue;
        const [x, y, w, h] = frame.contentRect;
        for (let row = y; row < y + h; row++) content.fill(1, row * width + x, row * width + x + w);
    }
    const poolColumns = base.width / 4;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (content[y * width + x]) continue;
        const id = ids[Math.floor(y / 4) * lookup.width + Math.floor(x / 4)];
        const source = ((Math.floor(id / poolColumns) * 4 + y % 4) * base.width + id % poolColumns * 4 + x % 4) * 4;
        if (base.rgba[source + 3] || data.rgba[source]) reject('nontransparent-padding');
    }
    const remap = poolSerializedHdRemap(data.rgba, base.width, base.height);
    const texture = (pixels: Uint8Array, w: number, h: number, rg = false, srgb = false) => {
        const t = new THREE.DataTexture(pixels, w, h, rg ? THREE.RGFormat : THREE.RGBAFormat);
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.flipY = false; t.generateMipmaps = false;
        t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
        return t;
    };
    const result: HdSpriteOverride['pages'][number] = {
        base: texture(base.rgba, base.width, base.height, false, true),
        data: remap.data,
        tiles: { map: texture(lookup.rgba, lookup.width, lookup.height), dataMap: remap.map, virtualSize: [width, height] },
    };
    return { page: result, gpuBytes: base.width * base.height * 4 + lookup.rgba.length + remap.gpuBytes };
}
