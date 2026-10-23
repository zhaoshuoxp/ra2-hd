import * as THREE from 'three';
import type { DecodedHdPage } from './resolveHdSprite';
import { poolHdPixels, type PooledHdPixels } from './poolHdPixels';

export interface HdTileMap {
    map: THREE.DataTexture;
    dataMap?: THREE.DataTexture;
    virtualSize: [number, number];
}

// Private, lossless GPU storage. The external atlas, density and rectangles stay
// unchanged. RGBA color and RG ownership are deduplicated as one atomic tile.
export function poolHdPage(base: DecodedHdPage, data: DecodedHdPage, limit: number) {
    const pixels = poolHdPixels(base, data, limit);
    return pixels && createPooledHdPage(pixels);
}

export function createPooledHdPage(pixels: PooledHdPixels) {
    const { color, remap, lookup, width, height, columns, rows, virtualSize, gpuBytes } = pixels;
    const texture = (pixels: Uint8Array, w: number, h: number, rg = false, srgb = false) => {
        const t = new THREE.DataTexture(pixels, w, h, rg ? THREE.RGFormat : THREE.RGBAFormat);
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.flipY = false;
        t.generateMipmaps = false;
        t.minFilter = t.magFilter = THREE.NearestFilter;
        t.needsUpdate = true;
        return t;
    };
    return { base: texture(color, width, height, false, true), data: texture(remap, width, height, true),
        tiles: { map: texture(lookup, columns, rows), virtualSize } as HdTileMap, gpuBytes };
}
