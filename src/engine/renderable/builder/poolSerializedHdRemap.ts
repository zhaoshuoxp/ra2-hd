import * as THREE from 'three';

// Independently pool categorical RG tiles after the complete serialized pair has
// been validated. Color pixels and every owner/shade byte remain lossless.
export function poolSerializedHdRemap(rgba: Uint8Array, width: number, height: number, channels: 2 | 4 = 4) {
    if (width % 4 || height % 4 || rgba.byteLength !== width * height * channels)
        throw new Error('remap-pool-shape');
    const columns = width / 4, rows = height / 4, ids = new Map<string, number>();
    const blocks: Uint8Array[] = [], lookup = new Uint8Array(columns * rows * 4);
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
        const block = new Uint8Array(32);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            const at = ((ty * 4 + y) * width + tx * 4 + x) * channels;
            block[(y * 4 + x) * 2] = rgba[at];
            block[(y * 4 + x) * 2 + 1] = rgba[at + 1];
        }
        const key = String.fromCharCode(...block);
        let id = ids.get(key);
        if (id === undefined) { id = blocks.length; ids.set(key, id); blocks.push(block); }
        const at = (ty * columns + tx) * 4;
        lookup[at] = id & 255; lookup[at + 1] = id >> 8 & 255;
        lookup[at + 2] = id >> 16; lookup[at + 3] = 255;
    }
    const poolColumns = Math.min(512, Math.ceil(Math.sqrt(blocks.length)));
    const poolRows = Math.ceil(blocks.length / poolColumns);
    if (poolRows > 512) throw new Error('remap-pool-limit');
    const pixels = new Uint8Array(poolColumns * poolRows * 32);
    blocks.forEach((block, id) => {
        for (let y = 0; y < 4; y++) pixels.set(block.subarray(y * 8, y * 8 + 8),
            ((Math.floor(id / poolColumns) * 4 + y) * poolColumns * 4 + id % poolColumns * 4) * 2);
    });
    const texture = (bytes: Uint8Array, w: number, h: number, rg = false) => {
        const t = new THREE.DataTexture(bytes, w, h, rg ? THREE.RGFormat : THREE.RGBAFormat);
        t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.generateMipmaps = false;
        t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
        return t;
    };
    return { data: texture(pixels, poolColumns * 4, poolRows * 4, true),
        map: texture(lookup, columns, rows), gpuBytes: pixels.length + lookup.length };
}
