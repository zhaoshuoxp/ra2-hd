import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
const out = path.resolve(process.argv[2]);
const app = await electron.launch({ args: [path.resolve('scripts/ui/feedback-art-shell.mjs')] });
try {
    const page = await app.firstWindow();
    const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 632;
        canvas.height = 570;
        const context = canvas.getContext('2d'), image = context.createImageData(632, 570);
        const points = [[70, 136], [193, 147], [218, 170], [424, 170], [451, 147], [563, 134],
        [572, 174], [558, 235], [469, 273], [409, 291], [381, 322], [243, 322], [218, 291],
        [124, 271], [74, 235], [64, 174]];
        const polygonDistance = (x, y) => {
            let distance = Infinity, inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [ax, ay] = points[j], [bx, by] = points[i], dx = bx - ax, dy = by - ay;
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
                distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy));
                if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
            }
            return inside ? -distance : distance;
        };
        for (let y = 0; y < 570; y++)for (let x = 0; x < 632; x++) {
            const qx = Math.abs(x + .5 - 318) - 137 + 32, qy = Math.abs(y + .5 - 144) - 46 + 32;
            const text = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 32;
            const distance = Math.min(text, polygonDistance(x + .5, y + .5)), t = Math.max(0, Math.min(1, distance / 32));
            const shade = Math.round(t * t * (3 - 2 * t) * 255), p = (y * 632 + x) * 4;
            image.data.set([shade, shade, shade, 255], p);
        }
        context.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
    });
    const bytes = Buffer.from(png, 'base64');
    await fs.writeFile(out, bytes);
    console.log(JSON.stringify({
        file: out, sha256: createHash('sha256').update(bytes).digest('hex'), width: 632, height: 570,
        method: 'Source-registered static-foreground suppression matte with a continuous 32-pixel signed-distance fade. No cinematic artwork repaint.'
    }));
} finally { await app.close(); }
