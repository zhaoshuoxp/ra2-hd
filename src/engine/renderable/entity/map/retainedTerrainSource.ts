import type * as THREE from 'three';

// Lossless CPU backing only. The GPU still receives the exact original RGBA8
// atlas, with the same dimensions, filtering, UVs and context-restore source.
export function encodeRgbaRuns(rgba: Uint8Array): Uint32Array | undefined {
    if (!rgba.byteLength || rgba.byteLength % 4 || rgba.byteOffset % 4) return;
    const input = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength / 4);
    function scan(output?: Uint32Array) {
        let at = 0, written = 0;
        while (at < input.length) {
            let end = at + 1;
            while (end < input.length && input[end] === input[at]) end++;
            if (end - at >= 3) {
                if (output) { output[written] = end - at; output[written + 1] = input[at]; }
                written += 2;
                at = end;
            } else {
                const start = at;
                at = end;
                while (at < input.length) {
                    if (at + 2 < input.length && input[at] === input[at + 1] && input[at] === input[at + 2]) break;
                    at++;
                }
                if (output) {
                    output[written] = -(at - start);
                    output.set(input.subarray(start, at), written + 1);
                }
                written += at - start + 1;
            }
        }
        return written;
    }
    const length = scan();
    // Unhelpful compression retains the ordinary source without extra storage.
    if (length >= input.length) return;
    const encoded = new Uint32Array(length);
    if (scan(encoded) !== length) throw Error('terrain-source-encode-length');
    return encoded;
}

export function decodeRgbaRuns(encoded: Uint32Array, byteLength: number): Uint8Array {
    if (!Number.isSafeInteger(byteLength) || byteLength < 4 || byteLength % 4)
        throw Error('terrain-source-decode-size');
    const output = new Uint32Array(byteLength / 4);
    let at = 0;
    for (let i = 0; i < encoded.length;) {
        const count = encoded[i++] | 0;
        if (!count || at + Math.abs(count) > output.length) throw Error('terrain-source-decode-run');
        if (count > 0) {
            if (i >= encoded.length) throw Error('terrain-source-decode-repeat');
            output.fill(encoded[i++], at, at + count);
        } else {
            if (i - count > encoded.length) throw Error('terrain-source-decode-literal');
            output.set(encoded.subarray(i, i - count), at);
            i -= count;
        }
        at += Math.abs(count);
    }
    if (at !== output.length) throw Error('terrain-source-decode-length');
    return new Uint8Array(output.buffer);
}

class RetainedRgba {
    private decoded?: Uint8Array;
    constructor(private encoded: Uint32Array | undefined, rgba: Uint8Array,
        private readonly originalBytes = rgba.byteLength) { this.decoded = rgba; }
    read(): Uint8Array {
        if (!this.encoded) throw Error('disposed-terrain-source');
        return this.decoded ??= decodeRgbaRuns(this.encoded, this.originalBytes);
    }
    releaseDecoded() { this.decoded = undefined; }
    dispose() { this.decoded = undefined; this.encoded = undefined; }
}

export function retainTerrainSource(texture: THREE.DataTexture, rgba: Uint8Array) {
    const encoded = encodeRgbaRuns(rgba);
    if (!encoded) return { retainedCpuBytes: rgba.byteLength, encodedBytes: 0,
        uploadWorkingBytes: rgba.byteLength, releaseDecoded: () => {} };
    const source = new RetainedRgba(encoded, rgba);
    const image = texture.image as { width: number; height: number };
    texture.image = { width: image.width, height: image.height, get data() { return source.read(); } };
    const previous = texture.onUpdate;
    const state = { encoding: 'rgba32-runs-v1', encodedBytes: encoded.byteLength,
        originalBytes: rgba.byteLength, uploads: 0, disposed: false };
    texture.userData.terrainSourceRetention = state;
    texture.onUpdate = value => {
        try { previous?.(value); }
        finally { state.uploads++; source.releaseDecoded(); }
    };
    texture.addEventListener('dispose', () => { state.disposed = true; source.dispose(); });
    return { retainedCpuBytes: encoded.byteLength, encodedBytes: encoded.byteLength,
        uploadWorkingBytes: rgba.byteLength + encoded.byteLength,
        releaseDecoded: () => source.releaseDecoded() };
}
