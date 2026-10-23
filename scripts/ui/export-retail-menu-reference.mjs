import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const input = path.resolve(process.argv[2]);
const capture = JSON.parse(await fs.readFile(path.join(input, 'report.json')));
const frames = await Promise.all(capture.frames.filter(f => f.time > .5).map(async frame =>
    (await fs.readFile(path.join(input, frame.file))).toString('base64')));
const app = await electron.launch({ args: [path.resolve('scripts/ui/feedback-art-shell.mjs')], timeout: 60000 });
try {
    const page = await app.firstWindow();
    const result = await page.evaluate(async frames => {
        const canvas = document.createElement('canvas'); canvas.width = 632; canvas.height = 570;
        const context = canvas.getContext('2d'), samples = [];
        for (const data of frames) {
            const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' }));
            context.drawImage(bitmap, 0, 0); bitmap.close();
            samples.push(context.getImageData(0, 0, canvas.width, canvas.height).data);
        }
        const reference = context.createImageData(canvas.width, canvas.height), channel = new Uint8Array(samples.length);
        for (let p = 0; p < reference.data.length; p += 4) {
            for (let c = 0; c < 3; c++) {
                for (let i = 0; i < samples.length; i++) channel[i] = samples[i][p + c];
                channel.sort(); reference.data[p + c] = channel[Math.floor(channel.length / 2)];
            }
            reference.data[p + 3] = 255;
        }
        context.putImageData(reference, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
    }, frames);
    const bytes = Buffer.from(result, 'base64');
    const output = path.resolve('public/res/presentation/menu-retail-reference-r3.png');
    await fs.writeFile(output, bytes);
    const report = { status: 'PASS_TEMPORAL_STATIC_REFERENCE_EXPORTED', source: capture.source,
        sourceSha256: capture.sha256, sampledFrames: frames.length, output,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        purpose: 'Decoder reference for removing the original static bezel, logo and grid from moving footage. Not a replacement Home illustration.' };
    await fs.writeFile(path.join(input, 'reference-export.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
} finally { await app.close(); }
