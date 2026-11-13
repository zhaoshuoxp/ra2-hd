import type { ShpFile } from '../../data/ShpFile';
import type { Palette } from '../../data/Palette';

// The opening strip contains a stationary, opaque star behind the moving
// apparatus. The final closed frame exposes that plate below the apparatus.
const openingBottom = [448, 424, 340, 236, 126, 67];
type ScoreFrame = ReturnType<ShpFile['getImage']>;
export function scoreForegroundAlpha(source: ScoreFrame, plate: ScoreFrame, palette: Palette,
    kind: 'panel' | 'emblem', frame: number): Uint8Array {
    const { width, height, imageData } = source, size = width * height;
    const alpha = new Uint8Array(size).fill(255), queued = new Uint8Array(size), queue = new Uint32Array(size);
    const offsetX = kind === 'emblem' ? 24 : 0, offsetY = kind === 'emblem' ? 136 : 0;
    const bottom = kind === 'panel' ? openingBottom[frame] : height;
    let head = 0, tail = 0;
    const background = (pixel: number) => {
        const y = Math.floor(pixel / width), x = pixel % width, index = imageData[pixel];
        if (!index || y >= bottom) return true;
        const color = palette.getColor(index);
        return !(kind === 'panel' && frame === 5) && index === plate.imageData[(y + offsetY) * plate.width + x + offsetX]
            || color.b === 0 && color.r <= 76 && color.g <= 76;
    };
    const visit = (pixel: number) => {
        if (!queued[pixel] && background(pixel)) { queued[pixel] = 1; queue[tail++] = pixel; }
    };
    for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
    while (head < tail) {
        const pixel = queue[head++], x = pixel % width;
        alpha[pixel] = 0;
        if (x) visit(pixel - 1);
        if (x < width - 1) visit(pixel + 1);
        if (pixel >= width) visit(pixel - width);
        if (pixel + width < size) visit(pixel + width);
    }
    for (let pixel = 0; pixel < size; pixel++) if (!imageData[pixel]) alpha[pixel] = 0;
    return alpha;
}
