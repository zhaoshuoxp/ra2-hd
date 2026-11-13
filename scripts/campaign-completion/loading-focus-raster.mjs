import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { vectorPaths } from '../art/palette-contours.mjs';

function symbolKind([r, g, b]) {
    if (r > 120 && b > 140 && g < 80 && r > g * 1.8 && b > g * 1.8) return 'purple';
    if (b > 180 && b > r * 1.7 && b > g * 1.7) return 'blue';
    if (r > 160 && g < 90 && b < 90 && r > g * 1.7 && r > b * 1.7) return 'red';
}

export function loadingDiagramSymbols(focus) {
    const colored = new Uint8Array(focus.width * focus.height);
    for (let i = 0; i < colored.length; i++) {
        const rgb = focus.data.subarray(i * 4, i * 4 + 3);
        colored[i] = Number(!!symbolKind(rgb));
    }
    const nearby = (x, y, extent) => {
        for (let dy = -extent; dy <= extent; dy++) for (let dx = -extent; dx <= extent; dx++) {
            if (x + dx >= 0 && x + dx < focus.width && y + dy >= 0 && y + dy < focus.height
                && colored[(y + dy) * focus.width + x + dx]) return true;
        }
        return false;
    };
    const field = new Uint8Array(colored.length), outside = new Uint8Array(colored.length), pending = [];
    for (let y = 0; y < focus.height; y++) for (let x = 0; x < focus.width; x++) {
        field[y * focus.width + x] = Number(nearby(x, y, 1));
        if (!x || !y || x === focus.width - 1 || y === focus.height - 1) pending.push([x, y]);
    }
    while (pending.length) {
        const [x, y] = pending.pop();
        if (x < 0 || y < 0 || x >= focus.width || y >= focus.height) continue;
        const at = y * focus.width + x;
        if (field[at] || outside[at]) continue;
        outside[at] = 1; pending.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    const mask = new PNG({ width: focus.width, height: focus.height });
    for (let i = 0; i < field.length; i++) if (!outside[i]) mask.data.set([255, 255, 255, 255], i * 4);
    const backplates = vectorPaths(mask).map(item => `<path fill="#000" d="${item.d}"/>`).join('');
    return { nearby, backplates };
}

export function loadingGeographicDiagram(focus) {
    const groups = new Map();
    const ocean = new Uint8Array(focus.width * focus.height), visited = new Uint8Array(ocean.length);
    const barrier = new Uint8Array(ocean.length), closedBarrier = new Uint8Array(ocean.length);
    for (let i = 0; i < barrier.length; i++)
        barrier[i] = Number(Math.max(...focus.data.subarray(i * 4, i * 4 + 3)) > 128);
    for (let y = 0; y < focus.height; y++) for (let x = 0; x < focus.width; x++) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            if (x + dx >= 0 && y + dy >= 0 && x + dx < focus.width && y + dy < focus.height)
                closedBarrier[y * focus.width + x] ||= barrier[(y + dy) * focus.width + x + dx];
    }
    for (let start = 0; start < ocean.length; start++) {
        if (visited[start]) continue;
        const pending = [start], component = [];
        let blackSeeds = 0;
        while (pending.length) {
            const at = pending.pop();
            if (visited[at]) continue;
            visited[at] = 1;
            const rgb = focus.data.subarray(at * 4, at * 4 + 3);
            if (closedBarrier[at]) continue;
            component.push(at);
            if (Math.min(...rgb) === 0) blackSeeds++;
            const x = at % focus.width, y = Math.floor(at / focus.width);
            if (x) pending.push(at - 1);
            if (x + 1 < focus.width) pending.push(at + 1);
            if (y) pending.push(at - focus.width);
            if (y + 1 < focus.height) pending.push(at + focus.width);
        }
        if (component.length >= 512 && blackSeeds >= component.length * .35)
            for (const at of component) ocean[at] = 1;
    }
    const kind = rgb => {
        const [r, g, b] = rgb, maximum = Math.max(...rgb), minimum = Math.min(...rgb);
        const symbol = symbolKind(rgb);
        if (symbol) return symbol;
        if (minimum >= 190 && maximum - minimum < 48) return 'white';
    };
    const boundary = new Uint8Array(focus.width * focus.height);
    const brightness = (x, y) => {
        if (x < 0 || y < 0 || x >= focus.width || y >= focus.height) return 0;
        const rgb = focus.data.subarray((y * focus.width + x) * 4, (y * focus.width + x) * 4 + 3);
        return (rgb[0] + rgb[1] + rgb[2]) / 3;
    };
    const field = new Uint8Array(focus.width * focus.height);
    for (let i = 0; i < field.length; i++) {
        const rgb = [...focus.data.subarray(i * 4, i * 4 + 3)], name = kind(rgb);
        if (name) { if (!groups.has(name)) groups.set(name, []); groups.get(name).push(rgb); }
        const minimum = Math.min(...rgb), maximum = Math.max(...rgb);
        field[i] = Number(!ocean[i] && minimum >= 4 && maximum - minimum < 80 && maximum - minimum <= maximum * .55);
        if (name === 'white') {
            const x = i % focus.width, y = Math.floor(i / focus.width), center = brightness(x, y);
            boundary[i] = Number([2, 3].some(radius => [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) =>
                brightness(x + dx * radius, y + dy * radius) < center - 28
                && brightness(x - dx * radius, y - dy * radius) < center - 28)));
        }
    }
    const mask = new PNG({ width: focus.width, height: focus.height });
    const dilated = new Uint8Array(field.length);
    for (let y = 1; y < focus.height - 1; y++) for (let x = 1; x < focus.width - 1; x++) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            dilated[y * focus.width + x] ||= field[(y + dy) * focus.width + x + dx];
    }
    for (let y = 1; y < focus.height - 1; y++) for (let x = 1; x < focus.width - 1; x++) {
        let inside = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            inside &&= !!dilated[(y + dy) * focus.width + x + dx];
        if (inside) mask.data.set([255, 255, 255, 255], (y * focus.width + x) * 4);
    }
    const paths = vectorPaths(mask, undefined, { tolerance: 1.35, cornerRadius: .85, minimumArea: 8 });
    const colors = Object.fromEntries([...groups].map(([name, pixels]) => [name, [0, 1, 2].map(channel =>
        pixels.map(rgb => rgb[channel]).sort((a, b) => a - b)[Math.floor(pixels.length / 2)])]));
    return { colors, symbols: loadingDiagramSymbols(focus),
        color: (rgb, x, y) => {
            const name = kind(rgb);
            return name === 'white' && !boundary[y * focus.width + x] ? [0, 0, 0] : colors[name] ?? [0, 0, 0];
        },
        land: '<defs><linearGradient id="geographic-material" x1="0" y1="0" x2=".8" y2="1">'
            + '<stop stop-color="#8b9086"/><stop offset=".52" stop-color="#535c52"/><stop offset="1" stop-color="#858b7c"/></linearGradient></defs>'
            + paths.map(item => `<path fill="url(#geographic-material)" fill-rule="evenodd" d="${item.d}"/>`).join(''),
        qualification: 'Continuous source land silhouettes and neutral lighting; source-median saturated UI inks; bright cartographic ridges retain antialiased line coverage while broad terrain highlights remain material. Dark navy ocean and natural land colors are not treated as UI symbols.',
    };
}

export function closeLoadingDiagramBoundaries(focus, color) {
    if (!color) return;
    const field = new Uint8Array(focus.width * focus.height), dilated = new Uint8Array(field.length);
    for (let i = 0; i < field.length; i++) field[i] = Number(color.every((value, channel) => focus.data[i * 4 + channel] === value));
    for (let y = 1; y < focus.height - 1; y++) for (let x = 1; x < focus.width - 1; x++) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            dilated[y * focus.width + x] ||= field[(y + dy) * focus.width + x + dx];
    }
    for (let y = 1; y < focus.height - 1; y++) for (let x = 1; x < focus.width - 1; x++) {
        const at = (y * focus.width + x) * 4;
        if (Math.max(...focus.data.subarray(at, at + 3)) >= 12) continue;
        let inside = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
            inside &&= !!dilated[(y + dy) * focus.width + x + dx];
        if (inside) focus.data.set(color, at);
    }
}

// The Lunar diagram reuses one authored Moon behind the original vector symbols.
export async function prepareLoadingFocusRaster(config, focus, resolve, work, symbols) {
    if (!config.focusRaster) return;
    const spec = config.focusRaster;
    assert(config.edition === 'yr' && config.mission === 'sov06lmd.map', 'Lunar focus artwork scope mismatch');
    const bytes = await fs.readFile(resolve(spec.file)), image = PNG.sync.read(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), spec.sha256, 'Lunar focus artwork identity mismatch');
    const valid = rect => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite)
        && rect[2] > 0 && rect[3] > 0;
    assert(valid(spec.rect) && spec.rect[0] >= -focus.width && spec.rect[1] >= -focus.height
        && spec.rect[2] <= focus.width * 2 && spec.rect[3] <= focus.height * 2);
    assert(image.width >= Math.ceil(spec.rect[2] * 4) && image.height >= Math.ceil(spec.rect[3] * 4),
        'Insufficient authored Lunar focus detail');
    const [left, top, width, height] = spec.sourceRegion ?? [];
    assert(valid(spec.sourceRegion) && left >= 0 && top >= 0
        && left + width <= focus.width && top + height <= focus.height);
    const [cx, cy, radius] = spec.clipCircle ?? [];
    assert([cx, cy, radius].every(Number.isFinite) && radius > 0 && radius <= .5
        && cx >= radius && cy >= radius && cx + radius <= 1 && cy + radius <= 1);
    assert(valid(spec.miniature) && spec.miniature[0] >= 0 && spec.miniature[1] >= 0
        && spec.miniature[0] + spec.miniature[2] <= 800 && spec.miniature[1] + spec.miniature[3] <= 520);
    const { nearby, backplates } = symbols ?? loadingDiagramSymbols(focus);
    execFileSync('python3', ['-c', `
from PIL import Image
from pathlib import Path
import json,sys,math
spec=json.loads(sys.argv[1]); image=Image.open(sys.argv[2]).convert('RGBA'); out=Path(sys.argv[3])
for density in (2,4):
 size=(math.ceil(spec['rect'][2]*density),math.ceil(spec['rect'][3]*density))
 image.resize(size,Image.Resampling.LANCZOS).save(out/f'focus-raster-{density}x.png')
`, JSON.stringify(spec), resolve(spec.file), work]);
    return {
        source: { ...spec, masterWidth: image.width, masterHeight: image.height,
            method: 'Independent authored Moon density exports; circular vector limb clipping; original colored symbols and opaque glyph holes.' },
        suppressNeutral: (x, y) => x >= left && y >= top && x < left + width && y < top + height && !nearby(x, y, 3),
        async render(density) {
            const bytes = await fs.readFile(path.join(work, `focus-raster-${density}x.png`));
            const decoded = PNG.sync.read(bytes);
            const element = (rect, id, amber = false) => `<svg x="${rect[0]}" y="${rect[1]}" width="${rect[2]}" height="${rect[3]}" viewBox="0 0 ${decoded.width} ${decoded.height}">`
                + `<defs><clipPath id="${id}"><circle cx="${cx*decoded.width}" cy="${cy*decoded.height}" r="${radius*decoded.width}"/></clipPath>`
                + (amber ? `<filter id="${id}-amber" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".55 .3 .15 0 0 .22 .2 .08 0 0 .1 .08 .04 0 0 0 0 0 1 0"/></filter>` : '')
                + `</defs><image width="${decoded.width}" height="${decoded.height}" clip-path="url(#${id})"${amber ? ` filter="url(#${id}-amber)"` : ''} href="data:image/png;base64,${bytes.toString('base64')}"/></svg>`;
            return { focus: element(spec.rect, 'lunar-focus-limb') + backplates,
                context: element(spec.miniature, 'lunar-context-limb', true) };
        },
    };
}
