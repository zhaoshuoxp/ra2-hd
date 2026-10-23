import * as THREE from 'three';
import { nativeUiCanvas } from '@/gui/NativeUiImage';

const cache = new Map<string, THREE.MeshBasicMaterial>();
export const HEALTH_BOX_EXTRA_HEIGHT = 2;
export function nativeHealthPipIndex(health: number, yellow: number, red: number,
    frames: readonly number[] = [1, 2, 4]): number {
    return frames[health > yellow * 100 ? 0 : health > red * 100 ? 1 : 2];
}

/** Preserve the retail drawing and palette; increase edge sampling only. */
export function hdHealthMaterial(key: string, source: () => HTMLCanvasElement, alreadyHd = false): THREE.MeshBasicMaterial {
    let material = cache.get(key);
    if (material) return material;
    const canvas = source();
    const texture = new THREE.CanvasTexture(alreadyHd ? canvas : nativeUiCanvas(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false, alphaTest: .01,
    });
    material.name = 'hd-health-retail-4x';
    cache.set(key, material);
    return material;
}

/** Original isometric top/side faces, reconstructed as smooth paths with a taller body. */
export function healthBoxCanvas(image: any, palette: any, width: number, height: number, empty = false): HTMLCanvasElement {
    const high = document.createElement('canvas'); high.width = width * 8; high.height = height * 8;
    const context = high.getContext('2d')!; context.scale(8, 8); context.lineJoin = 'round';
    const color = (x: number, y: number) => palette.getColor(image.imageData[y * image.width + x]).asHexString();
    const path = (points: number[][], fill?: string, stroke?: string) => {
        context.beginPath(); points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
        context.closePath(); if (fill) { context.fillStyle = fill; context.fill(); }
        if (stroke) { context.strokeStyle = stroke; context.lineWidth = .35; context.stroke(); }
    };
    const top = [[5, .35], [9.6, 2.65], [5, 4.95], [.4, 2.65]];
    const left = [[.4, 2.65], [5, 4.95], [5, 8.65], [.4, 6.35]];
    const right = [[5, 4.95], [9.6, 2.65], [9.6, 6.35], [5, 8.65]];
    if (empty) {
        const edge = color(4, 0); path(left, undefined, edge); path(right, undefined, edge); path(top, undefined, edge);
    } else {
        const outline = color(4, 6);
        path(left, color(1, 3), outline); path(right, color(8, 3), outline);
        path(top, color(4, 1), color(4, 0));
    }
    const canvas = document.createElement('canvas'); canvas.width = width * 4; canvas.height = height * 4;
    const target = canvas.getContext('2d')!; target.imageSmoothingEnabled = true; target.imageSmoothingQuality = 'high';
    target.drawImage(high, 0, 0, canvas.width, canvas.height);
    return canvas;
}

export function clearHdHealthArt(): void {
    for (const material of cache.values()) {
        material.map?.dispose();
        material.dispose();
    }
    cache.clear();
}
