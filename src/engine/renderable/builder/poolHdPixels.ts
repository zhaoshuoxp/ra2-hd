import type { DecodedHdPage } from './resolveHdSprite';

export interface PooledHdPixels {
    color: Uint8Array; remap: Uint8Array; lookup: Uint8Array;
    width: number; height: number; columns: number; rows: number;
    virtualSize: [number, number]; gpuBytes: number;
}

// Hash collisions are resolved with byte comparisons, preserving hidden RGB
// and ownership exactly. This calculation owns no renderer or DOM objects.
export function poolHdPixels(base: DecodedHdPage, data: DecodedHdPage, limit: number): PooledHdPixels | undefined {
    const side = 4, columns = Math.ceil(base.width / side), rows = Math.ceil(base.height / side);
    const tileCount = columns * rows;
    const positions = new Uint32Array(tileCount), next = new Int32Array(tileCount);
    const ids = new Map<number, number>();
    const colors = new Uint32Array(base.rgba.buffer, base.rgba.byteOffset, base.rgba.byteLength / 4);
    const ownership = new Uint32Array(data.rgba.buffer, data.rgba.byteOffset, data.rgba.byteLength / 4);
    let uniqueCount = 0;
    const lookup = new Uint8Array(columns * rows * 4);
    for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < columns; tx++) {
        let hash = 2166136261;
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
            const valid = tx * side + x < base.width && ty * side + y < base.height;
            const source = (ty * side + y) * base.width + tx * side + x;
            hash = Math.imul(hash ^ (valid ? colors[source] : 0), 16777619);
            hash = Math.imul(hash ^ (valid ? ownership[source] & 65535 : 0), 16777619);
        }
        const head = ids.get(hash) ?? -1;
        let index = head;
        // Hashes only select candidates. Compare every byte, including hidden
        // RGB, so collisions cannot alias different tiles or owner masks.
        search: while (index !== -1) {
            const position = positions[index], px = position % columns * side, py = Math.floor(position / columns) * side;
            for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
                const a = (ty * side + y) * base.width + tx * side + x;
                const b = (py + y) * base.width + px + x;
                const av = tx * side + x < base.width && ty * side + y < base.height;
                const bv = px + x < base.width && py + y < base.height;
                if ((av ? colors[a] : 0) !== (bv ? colors[b] : 0)
                    || (av ? ownership[a] & 65535 : 0) !== (bv ? ownership[b] & 65535 : 0)) {
                    index = next[index];
                    continue search;
                }
            }
            break;
        }
        if (index === -1) {
            index = uniqueCount++;
            positions[index] = ty * columns + tx;
            next[index] = head;
            ids.set(hash, index);
        }
        const at = (ty * columns + tx) * 4;
        lookup[at] = index & 255; lookup[at + 1] = (index >>> 8) & 255;
        lookup[at + 2] = index >>> 16; lookup[at + 3] = 255;
    }
    const poolColumns = Math.min(Math.floor(limit / side), Math.ceil(Math.sqrt(uniqueCount)));
    if (poolColumns < 1) return;
    const width = poolColumns * side, height = Math.ceil(uniqueCount / poolColumns) * side;
    const gpuBytes = width * height * 6 + lookup.length;
    if (height > limit || columns > limit || rows > limit || gpuBytes >= base.width * base.height * 6) return;
    const color = new Uint8Array(width * height * 4), remap = new Uint8Array(width * height * 2);
    const colorWords = new Uint32Array(color.buffer), remapWords = new Uint16Array(remap.buffer);
    for (let index = 0; index < uniqueCount; index++) {
        const tx = index % poolColumns * side, ty = Math.floor(index / poolColumns) * side;
        const position = positions[index], px = position % columns * side, py = Math.floor(position / columns) * side;
        for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
            if (px + x >= base.width || py + y >= base.height) continue;
            const source = (py + y) * base.width + px + x, target = (ty + y) * width + tx + x;
            colorWords[target] = colors[source];
            remapWords[target] = ownership[source] & 65535;
        }
    }
    return { color, remap, lookup, width, height, columns, rows,
        virtualSize: [base.width, base.height], gpuBytes };
}
