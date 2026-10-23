import type * as THREE from 'three';
import { deflateSync, inflateSync } from 'fflate';

class RetainedPixels {
    private decoded?: Uint8Array;
    private disposed = false;
    constructor(private encoded: Uint8Array, pixels: Uint8Array) { this.decoded = pixels; }
    read() {
        if (this.disposed) throw Error('disposed-hd-texture-source');
        return this.decoded ??= inflateSync(this.encoded);
    }
    releaseDecoded() { this.decoded = undefined; }
    dispose() { this.disposed = true; this.encoded = new Uint8Array(); this.releaseDecoded(); }
}

// Keep an exact, lossless context-restore source without retaining a second
// uncompressed copy of every world texture after its GPU upload.
export function retainHdTextureSource(texture: THREE.DataTexture) {
    const pixels = texture.image.data as Uint8Array;
    const encoded = pixels.byteLength >= 4096 ? deflateSync(pixels, { level: 1 }) : undefined;
    if (!encoded || encoded.byteLength >= pixels.byteLength) return {
        retainedCpuBytes: pixels.byteLength, encodedBytes: 0, decodedBytes: 0,
        encodingWorkingBytes: pixels.byteLength + (encoded?.byteLength ?? 0), releaseDecoded: () => {},
    };
    const source = new RetainedPixels(encoded, pixels);
    const { width, height } = texture.image;
    texture.image = { width, height, get data() { return source.read(); } };
    const previous = texture.onUpdate;
    const state = { encoding: 'deflate-raw-v1', retainedCpuBytes: encoded.byteLength,
        originalBytes: pixels.byteLength, uploads: 0, disposed: false };
    texture.userData.hdSourceRetention = state;
    texture.onUpdate = value => {
        try { previous?.(value); }
        finally { state.uploads++; source.releaseDecoded(); }
    };
    texture.addEventListener('dispose', () => { state.disposed = true; source.dispose(); });
    return { retainedCpuBytes: encoded.byteLength, encodedBytes: encoded.byteLength,
        decodedBytes: pixels.byteLength, encodingWorkingBytes: pixels.byteLength + encoded.byteLength,
        releaseDecoded: () => source.releaseDecoded() };
}
