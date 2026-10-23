type Point = { x: number; y: number };

/** Trace native silhouettes, replacing the pixel staircase with fitted continuous contours. */
function contours(pixels: ArrayLike<number>, width: number, height: number): Point[][] {
    type Edge = { a: Point; b: Point; direction: number; used: boolean };
    const edges: Edge[] = [], starts = new Map<number, Edge[]>();
    const key = (p: Point) => p.y * (width + 1) + p.x;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height
        && pixels[(y * width + x) * 4 + 3] >= 128;
    const add = (x: number, y: number, xx: number, yy: number, direction: number) => {
        const edge = { a: { x, y }, b: { x: xx, y: yy }, direction, used: false };
        edges.push(edge);
        const list = starts.get(key(edge.a)) ?? []; list.push(edge); starts.set(key(edge.a), list);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (opaque(x, y)) {
        if (!opaque(x, y - 1)) add(x, y, x + 1, y, 0);
        if (!opaque(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
        if (!opaque(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
        if (!opaque(x - 1, y)) add(x, y + 1, x, y, 3);
    }
    const result: Point[][] = [];
    for (const first of edges) {
        if (first.used) continue;
        const loop: Point[] = [];
        let edge: Edge | undefined = first;
        while (edge && !edge.used) {
            edge.used = true; loop.push(edge.a);
            if (key(edge.b) === key(first.a)) break;
            const direction = edge.direction;
            edge = starts.get(key(edge.b))?.filter(e => !e.used).sort((a, b) => {
                const rank = (d: number) => [1, 0, 3, 2][(d - direction + 4) % 4];
                return rank(a.direction) - rank(b.direction);
            })[0];
        }
        if (loop.length < 4) continue;
        const x = loop.map(p => p.x), y = loop.map(p => p.y);
        const tiny = Math.max(...x) - Math.min(...x) <= 2 && Math.max(...y) - Math.min(...y) <= 2;
        const fitted: Point[] = [];
        for (let i = 0; i < loop.length; i++) {
            const a = loop[(i + loop.length - 4 % loop.length) % loop.length];
            const b = loop[i], c = loop[(i + 4) % loop.length];
            const incoming = Math.hypot(b.x - a.x, b.y - a.y), outgoing = Math.hypot(c.x - b.x, c.y - b.y);
            const turn = Math.acos(Math.max(-1, Math.min(1,
                ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (incoming * outgoing || 1))));
            const boundaryCorner = (b.x === 0 || b.x === width) && (b.y === 0 || b.y === height);
            if (tiny || boundaryCorner || turn > 1.9 && incoming > 1.5 && outgoing > 1.5) {
                fitted.push(b); continue;
            }
            let weight = 0, xx = 0, yy = 0;
            for (let offset = -4; offset <= 4; offset++) {
                const p = loop[(i + loop.length + offset) % loop.length];
                const w = Math.exp(-offset * offset / (2 * 1.3 * 1.3));
                xx += p.x * w; yy += p.y * w; weight += w;
            }
            fitted.push({ x: xx / weight, y: yy / weight });
        }
        result.push(fitted);
    }
    return result;
}

function coverage(paths: Point[][], width: number, height: number): Uint8Array {
    const density = 4, samples = 4, result = new Uint8Array(width * height * density * density);
    const stride = width * density;
    const segments = paths.flatMap(path => path.map((p, i) => [p, path[(i + 1) % path.length]]));
    for (let y = 0; y < height * density * samples; y++) {
        const scan = (y + .5) / (density * samples), crossings: number[] = [];
        for (const [a, b] of segments) if ((a.y > scan) !== (b.y > scan)) {
            crossings.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
        }
        crossings.sort((a, b) => a - b);
        const row = Math.floor(y / samples) * stride;
        for (let i = 0; i + 1 < crossings.length; i += 2) {
            const left = Math.max(0, Math.ceil(crossings[i] * density * samples - .5));
            const right = Math.min(stride * samples, Math.ceil(crossings[i + 1] * density * samples - .5));
            for (let x = left; x < right; x++) result[row + Math.floor(x / samples)]++;
        }
    }
    return result;
}

const cubic = (x: number) => {
    x = Math.abs(x);
    return x <= 1 ? (7 * x ** 3 - 12 * x * x + 16 / 3) / 6
        : x < 2 ? (-7 / 3 * x ** 3 + 12 * x * x - 20 * x + 32 / 3) / 6 : 0;
};

function colorFamily(pixels: ArrayLike<number>, at: number): number {
    const r = pixels[at], g = pixels[at + 1], b = pixels[at + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
    if (high < 48) return 0;
    if (delta < high * .24) return 1 + Math.min(3, Math.floor(high / 64));
    let hue = high === r ? (g - b) / delta : high === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
    if (hue < 0) hue += 6;
    return 5 + Math.floor(hue + .5) % 6;
}

/** Reconstruct smooth outlines and color transitions; native size, identity and tip stay fixed. */
export function sampleNativeUi(pixels: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
    const mask = coverage(contours(pixels, width, height), width, height);
    const stride = width * 4, output = new Uint8ClampedArray(stride * height * 4 * 4);
    const families = new Int8Array(width * height).fill(-1), groups = new Set<number>();
    for (let i = 0; i < families.length; i++) if (pixels[i * 4 + 3]) {
        families[i] = colorFamily(pixels, i * 4); groups.add(families[i]);
    }
    const mixed = new Float32Array(output.length);
    for (const family of groups) {
        const selected = new Uint8Array(width * height * 4);
        for (let i = 0; i < families.length; i++) if (families[i] === family) selected[i * 4 + 3] = 255;
        const region = coverage(contours(selected, width, height), width, height);
        for (let y = 0; y < height * 4; y++) for (let x = 0; x < stride; x++) {
            const at = (y * stride + x) * 4, covered = region[y * stride + x];
            if (!covered || !mask[y * stride + x]) continue;
            const sx = (x + .5) / 4 - .5, sy = (y + .5) / 4 - .5;
            const ix = Math.floor(sx), iy = Math.floor(sy), color = [0, 0, 0];
            let weight = 0;
            for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
                const xx = Math.max(0, Math.min(width - 1, ix + dx)), yy = Math.max(0, Math.min(height - 1, iy + dy));
                if (families[yy * width + xx] !== family) continue;
                const index = (yy * width + xx) * 4;
                const w = cubic(sx - ix - dx) * cubic(sy - iy - dy) * pixels[index + 3] / 255;
                weight += w;
                for (let c = 0; c < 3; c++) color[c] += pixels[index + c] * w;
            }
            if (weight > 0) {
                for (let c = 0; c < 3; c++) mixed[at + c] += color[c] / weight * covered;
                mixed[at + 3] += covered;
            }
        }
    }
    for (let i = 0; i < mask.length; i++) {
        const at = i * 4, weight = mixed[at + 3];
        if (!mask[i]) continue;
        if (weight) for (let c = 0; c < 3; c++) output[at + c] = Math.round(mixed[at + c] / weight);
        else {
            const x = Math.floor(i % stride / 4), y = Math.floor(i / stride / 4);
            let best = -1, distance = Infinity;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                const xx = x + dx, yy = y + dy, p = (yy * width + xx) * 4;
                if (xx >= 0 && yy >= 0 && xx < width && yy < height && pixels[p + 3] && dx * dx + dy * dy < distance) {
                    best = p; distance = dx * dx + dy * dy;
                }
            }
            if (best >= 0) for (let c = 0; c < 3; c++) output[at + c] = pixels[best + c];
        }
        output[at + 3] = Math.round(mask[i] / 16 * 255);
    }
    return output;
}

export function nativeUiCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = source.ownerDocument.createElement('canvas');
    canvas.width = source.width * 4; canvas.height = source.height * 4;
    const context = canvas.getContext('2d')!;
    const native = source.getContext('2d')!.getImageData(0, 0, source.width, source.height);
    const image = context.createImageData(canvas.width, canvas.height);
    image.data.set(sampleNativeUi(native.data, source.width, source.height));
    context.putImageData(image, 0, 0);
    return canvas;
}
