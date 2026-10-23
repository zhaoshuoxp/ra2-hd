type Point = { x: number; y: number };
type Color = { r: number; g: number; b: number };
export interface MarkerFacet { points: Point[]; color: Color }
export interface MarkerArrow { shadow: MarkerFacet; body: Point[]; facets: MarkerFacet[] }

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function hull(points: Point[]): Point[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    const half = (values: Point[]) => {
        const result: Point[] = [];
        for (const p of values) {
            while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
            result.push(p);
        }
        return result;
    };
    const result = [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
    let changed = true;
    while (changed && result.length > 3) {
        changed = false;
        for (let i = 0; i < result.length; i++) {
            const a = result[(i + result.length - 1) % result.length], b = result[i], c = result[(i + 1) % result.length];
            const distance = Math.abs(cross(a, c, b)) / Math.hypot(c.x - a.x, c.y - a.y);
            if (distance < .55) { result.splice(i, 1); changed = true; break; }
        }
    }
    return result;
}

function average(points: { color: Color }[]): Color {
    const sum = points.reduce((s, p) => ({ r: s.r + p.color.r, g: s.g + p.color.g, b: s.b + p.color.b }), { r: 0, g: 0, b: 0 });
    const n = Math.max(1, points.length);
    return { r: sum.r / n, g: sum.g / n, b: sum.b / n };
}

/** Recover the four native convex arrows and their planar gray/white faces, without a pixel texture. */
export function occlusionMarkerArrows(image: { width: number; height: number; imageData: ArrayLike<number> },
    palette: { getColor: (index: number) => Color }): MarkerArrow[] {
    const { width, height, imageData } = image, seen = new Uint8Array(width * height), arrows: MarkerArrow[] = [];
    for (let first = 0; first < seen.length; first++) {
        if (!imageData[first] || seen[first]) continue;
        const queue = [first]; seen[first] = 1;
        for (let read = 0; read < queue.length; read++) {
            const p = queue[read], x = p % width, y = Math.floor(p / width);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy, next = yy * width + xx;
                if (xx >= 0 && yy >= 0 && xx < width && yy < height && imageData[next] && !seen[next]) {
                    seen[next] = 1; queue.push(next);
                }
            }
        }
        const pixels = queue.map(p => ({ x: p % width + .5, y: Math.floor(p / width) + .5, color: palette.getColor(imageData[p]) }));
        const bodyPixels = pixels.filter(p => Math.max(p.color.r, p.color.g, p.color.b) >= 100);
        if (bodyPixels.length < 3) continue;
        const bounds = (values: Point[]) => hull(values.flatMap(p => [
            { x: p.x - .4, y: p.y - .4 }, { x: p.x + .4, y: p.y - .4 },
            { x: p.x + .4, y: p.y + .4 }, { x: p.x - .4, y: p.y + .4 },
        ]));
        const body = bounds(bodyPixels), shadow = bounds(pixels);
        const available = [...new Map(bodyPixels.map(p => [`${p.color.r}/${p.color.g}/${p.color.b}`, p.color])).values()];
        const nearest = (color: Color) => available.reduce((best, candidate) => {
            const distance = (a: Color) => (a.r - color.r) ** 2 + (a.g - color.g) ** 2 + (a.b - color.b) ** 2;
            return distance(candidate) < distance(best) ? candidate : best;
        });
        let bestScore = Infinity, best: MarkerFacet[] = [];
        for (let root = 0; root < body.length; root++) {
            const polygon = [...body.slice(root), ...body.slice(0, root)], facets: MarkerFacet[] = [];
            let score = 0;
            for (let i = 1; i < polygon.length - 1; i++) {
                const triangle = [polygon[0], polygon[i], polygon[i + 1]];
                const selected = bodyPixels.filter(p => triangle.every((a, j) => cross(a, triangle[(j + 1) % 3], p) >= -.001));
                const color = nearest(average(selected.length ? selected : bodyPixels));
                for (const p of selected) score += (p.color.r - color.r) ** 2 + (p.color.g - color.g) ** 2 + (p.color.b - color.b) ** 2;
                facets.push({ points: triangle, color });
            }
            if (score < bestScore) { bestScore = score; best = facets; }
        }
        const dark = pixels.filter(p => Math.max(p.color.r, p.color.g, p.color.b) < 70);
        arrows.push({ shadow: { points: shadow, color: average(dark.length ? dark : pixels) }, body, facets: best });
    }
    return arrows;
}

export function occlusionMarkerCanvas(image: { width: number; height: number; imageData: ArrayLike<number> },
    palette: { getColor: (index: number) => Color }): HTMLCanvasElement {
    const width = image.width + image.width % 2, height = image.height + image.height % 2;
    const supersampled = document.createElement('canvas'); supersampled.width = width * 16; supersampled.height = height * 16;
    const context = supersampled.getContext('2d')!; context.scale(16, 16);
    const path = (points: Point[]) => {
        context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.closePath();
    };
    const fill = (facet: MarkerFacet) => {
        path(facet.points); const c = facet.color;
        context.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`; context.fill();
    };
    for (const arrow of occlusionMarkerArrows(image, palette)) {
        fill(arrow.shadow); context.save(); path(arrow.body); context.clip();
        const base = average(arrow.facets); context.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`; context.fill();
        for (const facet of arrow.facets) fill(facet);
        context.restore();
    }
    const canvas = document.createElement('canvas'); canvas.width = width * 4; canvas.height = height * 4;
    const target = canvas.getContext('2d')!; target.imageSmoothingEnabled = true; target.imageSmoothingQuality = 'high';
    target.drawImage(supersampled, 0, 0, canvas.width, canvas.height);
    return canvas;
}
