import * as THREE from 'three';
import { nativeUiCanvas } from '@/gui/NativeUiImage';
import type { HdSpriteOverride } from '../builder/HdSpriteOverride';

/** Source-derived command feedback; original frame geometry and timing remain native. */
function buildCommandMarkerHd(shp: any, palette: any): HdSpriteOverride {
    const frames = [], width = 512, gutter = 4;
    let x = gutter, y = gutter, rowHeight = 0;
    const crops: { canvas: HTMLCanvasElement; x: number; y: number }[] = [];
    for (let i = 0; i < shp.numImages; i++) {
        const image = shp.getImage(i), w = image.width + image.width % 2, h = image.height + image.height % 2;
        const source = document.createElement('canvas'); source.width = w; source.height = h;
        const context = source.getContext('2d')!, pixels = context.createImageData(w, h);
        for (let yy = 0; yy < image.height; yy++) for (let xx = 0; xx < image.width; xx++) {
            const index = image.imageData[yy * image.width + xx];
            if (!index) continue;
            const color = palette.getColor(index), at = (yy * w + xx) * 4;
            pixels.data.set([color.r, color.g, color.b, 255], at);
        }
        context.putImageData(pixels, 0, 0);
        const canvas = nativeUiCanvas(source);
        if (x + canvas.width + gutter > width) { x = gutter; y += rowHeight + gutter; rowHeight = 0; }
        frames.push({ page: 0, sampleRect: { x, y, width: canvas.width, height: canvas.height } });
        crops.push({ canvas, x, y }); x += canvas.width + gutter; rowHeight = Math.max(rowHeight, canvas.height);
    }
    const atlas = document.createElement('canvas'); atlas.width = width; atlas.height = y + rowHeight + gutter;
    const context = atlas.getContext('2d')!;
    for (const crop of crops) context.drawImage(crop.canvas, crop.x, crop.y);
    const base = new THREE.CanvasTexture(atlas); base.flipY = false;
    base.colorSpace = THREE.SRGBColorSpace; base.generateMipmaps = false;
    base.minFilter = base.magFilter = THREE.LinearFilter;
    const data = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    data.needsUpdate = true;
    return { identity: `native-command-marker/${shp.filename}/${palette.hash}/4x`, frames, pages: [{ base, data }] };
}

interface MarkerSlot { override: HdSpriteOverride; refs: number; timer?: ReturnType<typeof setTimeout> }
const cache = new WeakMap<object, Map<number, MarkerSlot>>();

export function acquireCommandMarkerHd(shp: any, palette: any): { override: HdSpriteOverride; release: () => void } {
    let entries = cache.get(shp);
    if (!entries) { entries = new Map(); cache.set(shp, entries); }
    let slot = entries.get(palette.hash);
    if (!slot) { slot = { override: buildCommandMarkerHd(shp, palette), refs: 0 }; entries.set(palette.hash, slot); }
    clearTimeout(slot.timer); slot.refs++;
    const selected = slot;
    let live = true;
    return { override: selected.override, release: () => {
        if (!live) return; live = false;
        if (--selected.refs) return;
        selected.timer = setTimeout(() => {
            for (const page of selected.override.pages) { page.base.dispose(); page.data.dispose(); }
            entries!.delete(palette.hash);
        }, 2000);
    } };
}
