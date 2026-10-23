import type { DecodedHdPage } from './resolveHdSprite';

const linear = Float64Array.from({ length: 256 }, (_, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const srgb = (value: number) => Math.round(255 * (value <= 0.0031308
    ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));

// Reduce verified 4x art to 2x before pooling/upload. Alpha-weighted linear
// color prevents transparent matte fringes; palette indices remain categorical.
export function downsampleHdPage(base: DecodedHdPage, data: DecodedHdPage): [DecodedHdPage, DecodedHdPage] {
    if (base.width !== data.width || base.height !== data.height
        || base.rgba.length !== base.width * base.height * 4 || data.rgba.length !== base.rgba.length)
        throw Error('downsample-page-size');
    const width = Math.ceil(base.width / 2), height = Math.ceil(base.height / 2);
    const color = new Uint8Array(width * height * 4), remap = new Uint8Array(color.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let alpha = 0, red = 0, green = 0, blue = 0, owner = 0, shade = 0, samples = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx, sy = y * 2 + dy;
            if (sx >= base.width || sy >= base.height) continue;
            const at = (sy * base.width + sx) * 4, a = base.rgba[at + 3];
            samples++; alpha += a;
            red += linear[base.rgba[at]] * a;
            green += linear[base.rgba[at + 1]] * a;
            blue += linear[base.rgba[at + 2]] * a;
            const weight = a * data.rgba[at] / 255;
            owner += weight; shade += weight * data.rgba[at + 1];
        }
        const at = (y * width + x) * 4;
        color[at + 3] = Math.round(alpha / samples);
        remap[at + 3] = 255;
        if (alpha && color[at + 3]) {
            color[at] = srgb(red / alpha); color[at + 1] = srgb(green / alpha); color[at + 2] = srgb(blue / alpha);
            remap[at] = Math.round(owner / alpha * 255);
            remap[at + 1] = owner ? Math.round(shade / owner) : 0;
        }
    }
    return [{ width, height, rgba: color }, { width, height, rgba: remap }];
}

export function downsampleMask(mask: Uint8Array, width: number, height: number): Uint8Array<ArrayBuffer> {
    if (mask.length !== width * height) throw Error('downsample-mask-size');
    const result = new Uint8Array(Math.ceil(width / 2) * Math.ceil(height / 2));
    for (let y = 0; y < Math.ceil(height / 2); y++) for (let x = 0; x < Math.ceil(width / 2); x++) {
        let total = 0, count = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            if (x * 2 + dx >= width || y * 2 + dy >= height) continue;
            total += mask[(y * 2 + dy) * width + x * 2 + dx]; count++;
        }
        result[y * Math.ceil(width / 2) + x] = Math.round(total / count);
    }
    return result;
}

export async function downsampleHdBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
    const reduced = await createImageBitmap(bitmap, {
        resizeWidth: Math.ceil(bitmap.width / 2), resizeHeight: Math.ceil(bitmap.height / 2), resizeQuality: 'high',
        premultiplyAlpha: 'none', colorSpaceConversion: 'none',
    });
    bitmap.close();
    return reduced;
}
