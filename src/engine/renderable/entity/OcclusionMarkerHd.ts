import * as THREE from 'three';
import type { HdSpriteOverride } from '../builder/HdSpriteOverride';
import { occlusionMarkerCanvas } from './OcclusionMarkerArt';

function build(shp: any, palette: any): HdSpriteOverride {
    const frames = [], crops = [], width = 512, gutter = 4;
    let x = gutter, y = gutter, rowHeight = 0;
    for (let frame = 0; frame < shp.numImages; frame++) {
        const canvas = occlusionMarkerCanvas(shp.getImage(frame), palette);
        if (x + canvas.width + gutter > width) { x = gutter; y += rowHeight + gutter; rowHeight = 0; }
        frames.push({ page: 0, sampleRect: { x, y, width: canvas.width, height: canvas.height } });
        crops.push({ canvas, x, y }); x += canvas.width + gutter; rowHeight = Math.max(rowHeight, canvas.height);
    }
    const atlas = document.createElement('canvas'); atlas.width = width; atlas.height = y + rowHeight + gutter;
    const context = atlas.getContext('2d')!;
    for (const crop of crops) context.drawImage(crop.canvas, crop.x, crop.y);
    // Ordinary sprite UVs are bottom-up; this canvas is not a top-down tile pool.
    const base = new THREE.CanvasTexture(atlas); base.flipY = true;
    base.colorSpace = THREE.SRGBColorSpace; base.generateMipmaps = false; base.minFilter = base.magFilter = THREE.LinearFilter;
    const data = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); data.needsUpdate = true;
    return { identity: `native-occlusion-marker/${shp.filename}/${palette.hash}/r6/4x`, antialias: true,
        frames, pages: [{ base, data }] };
}

interface Slot { override: HdSpriteOverride; refs: number; timer?: ReturnType<typeof setTimeout> }
const cache = new WeakMap<object, Map<number, Slot>>();

export function acquireOcclusionMarkerHd(shp: any, palette: any): { override: HdSpriteOverride; release: () => void } {
    let entries = cache.get(shp);
    if (!entries) { entries = new Map(); cache.set(shp, entries); }
    let slot = entries.get(palette.hash);
    if (!slot) { slot = { override: build(shp, palette), refs: 0 }; entries.set(palette.hash, slot); }
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
