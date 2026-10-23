// Unscaled diagnostic frames from existing native construction recordings.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const report = JSON.parse(await fs.readFile(process.argv[2]));
const identity = process.argv[3], out = path.resolve(process.argv[4]);
await fs.mkdir(out);
const clip = report.clips.find(file => file.endsWith(identity + '-native-construction-motion.webm'));
assert(clip);
const source = report.stages.find(stage => stage.name === identity + '-native-completed').detail.source;
const bytes = await fs.readFile(clip);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    await page.setContent('<video id="recording" muted preload="auto"></video>');
    await page.evaluate(data => { document.getElementById('recording').src = 'data:video/webm;base64,' + data; }, bytes.toString('base64'));
    await page.waitForFunction(() => document.getElementById('recording').readyState >= 2);
    const captures = [];
    for (const seconds of [.2, .7, 1.2, 2, 3]) {
        const frame = await page.evaluate(async ({ seconds, source }) => {
            const video = document.getElementById('recording');
            await new Promise(resolve => { video.onseeked = resolve; video.currentTime = seconds; });
            const canvas = document.createElement('canvas');
            canvas.width = source[2]; canvas.height = source[3];
            canvas.getContext('2d').drawImage(video, ...source, 0, 0, ...source.slice(2));
            return { png: canvas.toDataURL(), seconds: video.currentTime, buffer: [video.videoWidth, video.videoHeight] };
        }, { seconds, source });
        assert.deepEqual(frame.buffer, [3840, 2160]);
        const file = path.join(out, seconds.toFixed(1) + '.png');
        await fs.writeFile(file, Buffer.from(frame.png.split(',')[1], 'base64'));
        captures.push({ file, seconds: frame.seconds, source, buffer: frame.buffer });
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({ status: 'PASS_NATIVE_VIDEO_FRAME_EXTRACTION',
        clip, sha256: createHash('sha256').update(bytes).digest('hex'), captures,
        boundary: 'Existing native drawing-buffer pixels, without scaling or generated motion.' }, null, 2) + '\n');
} finally { await browser.close(); }
