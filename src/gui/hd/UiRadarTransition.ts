import * as THREE from 'three';
import type { ShpFile } from '@/data/ShpFile';
import type { Palette } from '@/data/Palette';
import { uiArt } from './UiArt';

// Transfer the original CRT frame's darkening/flash onto the restored base.
// This retains native effect timing and noise without replacing the emblem with
// a low-resolution copy whenever its palette changes during the transition.
export class UiRadarTransition {
    readonly texture: THREE.CanvasTexture;
    private output = document.createElement('canvas');
    private dark = document.createElement('canvas');
    private flash = document.createElement('canvas');
    private mask = document.createElement('canvas');
    constructor(private bitmap: ImageBitmap, private source: ShpFile, private palette: Palette) {
        const full = bitmap.width * bitmap.height * 4;
        const small = source.width * source.height * 4;
        if (!uiArt.reserveSurface(this, full, full + small * 3)) throw Error('UI transition budget exceeded');
        this.output.width = bitmap.width;
        this.output.height = bitmap.height;
        for (const canvas of [this.dark, this.flash, this.mask]) {
            canvas.width = source.width;
            canvas.height = source.height;
        }
        this.texture = new THREE.CanvasTexture(this.output);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        this.texture.flipY = false;
    }
    update(frameNumber: number, baseNumber: number) {
        const w = this.source.width, h = this.source.height;
        const frame = this.source.getImage(frameNumber), base = this.source.getImage(baseNumber);
        const dark = new Uint8ClampedArray(w * h * 4);
        const flash = new Uint8ClampedArray(dark.length), mask = new Uint8ClampedArray(dark.length);
        const indexAt = (f: typeof frame, x: number, y: number) =>
            x >= f.x && y >= f.y && x < f.x + f.width && y < f.y + f.height
                ? f.imageData[(y - f.y) * f.width + x - f.x] : 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = indexAt(frame, x, y), b = indexAt(base, x, y);
            const c = this.palette.colors[i], original = this.palette.colors[b], p = (y * w + x) * 4;
            for (const [channel, key] of ['r', 'g', 'b'].entries()) {
                const before = original[key], after = c[key];
                // The final black screen must also erase restored color where
                // that source channel was already zero in the base emblem.
                dark[p + channel] = frameNumber === this.source.numImages - 1 && after === 0
                    ? 0 : after < before ? 255 * after / before : 255;
                flash[p + channel] = after > before ? 255 * (after - before) / (255 - before) : 0;
            }
            dark[p + 3] = flash[p + 3] = 255;
            mask[p + 3] = i ? 255 : 0;
        }
        this.dark.getContext('2d')!.putImageData(new ImageData(dark, w, h), 0, 0);
        this.flash.getContext('2d')!.putImageData(new ImageData(flash, w, h), 0, 0);
        this.mask.getContext('2d')!.putImageData(new ImageData(mask, w, h), 0, 0);
        const width = this.bitmap.width, height = this.bitmap.height, out = this.output.getContext('2d')!;
        out.globalCompositeOperation = 'source-over';
        out.clearRect(0, 0, width, height);
        out.drawImage(this.bitmap, 0, 0);
        // At closure the source display is exactly black up to its rails.
        // Interpolating the effect maps bleeds rail colors into that black area.
        out.imageSmoothingEnabled = frameNumber !== this.source.numImages - 1;
        out.globalCompositeOperation = 'multiply'; out.drawImage(this.dark, 0, 0, width, height);
        out.globalCompositeOperation = 'screen'; out.drawImage(this.flash, 0, 0, width, height);
        out.imageSmoothingEnabled = true;
        out.globalCompositeOperation = 'destination-in'; out.drawImage(this.mask, 0, 0, width, height);
        out.globalCompositeOperation = 'source-over';
        this.texture.needsUpdate = true;
        return this.texture;
    }
    dispose() {
        this.texture.dispose();
        uiArt.releaseSurface(this);
        for (const canvas of [this.output, this.dark, this.flash, this.mask]) canvas.width = canvas.height = 1;
    }
}
