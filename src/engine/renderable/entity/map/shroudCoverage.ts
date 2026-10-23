// Shroud sprites use index 254 as neutral white outside their tile diamond.
// Extend only that exterior by one texel so fractional presentation sampling
// cannot expose ground between adjacent diamonds. Interior gradient values stay intact.
export function extendShroudCoverage(pixels: Uint8Array, width: number, height: number): Uint8Array {
    if (pixels.length !== width * height) throw new Error('Invalid shroud frame size');
    const result = pixels.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (pixels[i] !== 254) continue;
        let value = 254;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx, sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
            const next = pixels[sy * width + sx];
            if (next >= 2) value = Math.min(value, next);
        }
        result[i] = value;
    }
    return result;
}
