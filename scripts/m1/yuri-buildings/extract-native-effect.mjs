// Read existing native-resolution recordings; no extra match or generated effect.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const report = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(process.argv[3]); await fs.mkdir(output);
const clip = report.clips.find(p => p.endsWith('YAGNTC-native-fire-close.webm'));
const bytes = await fs.readFile(clip);
const source = report.stages.find(s => s.name === 'YAGNTC-native-fired').detail.source;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    await page.setContent('<video id="recording" muted preload="auto"></video>');
    await page.evaluate(data => { document.getElementById('recording').src = 'data:video/webm;base64,' + data; }, bytes.toString('base64'));
    await page.waitForFunction(() => document.getElementById('recording').readyState >= 2);
    const records = [];
    for (const time of [.1, .25, .5, .75, 1]) {
        const capture = await page.evaluate(async ({ time, source }) => {
            const video = document.getElementById('recording');
            await new Promise(resolve => { video.onseeked = resolve; video.currentTime = time; });
            const canvas = document.createElement('canvas'); canvas.width = source[2]; canvas.height = source[3];
            canvas.getContext('2d').drawImage(video, ...source, 0, 0, source[2], source[3]);
            return { png: canvas.toDataURL(), buffer: [video.videoWidth, video.videoHeight], time: video.currentTime };
        }, { time, source });
        assert.deepEqual(capture.buffer, [3840, 2160]);
        const file = path.join(output, `mutation-${time.toFixed(2)}-detail.png`);
        await fs.writeFile(file, Buffer.from(capture.png.split(',')[1], 'base64'));
        records.push({ file, buffer: capture.buffer, sourceCrop: source, seconds: capture.time });
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'PASS_NATIVE_VIDEO_FRAME_EXTRACTION',
        clip, clipSha256: createHash('sha256').update(bytes).digest('hex'), frames: records,
        boundary: 'Unscaled pixel crops from existing native 3840x2160 VP9 capture; timestamps refer to the recording, not an invented animation.' }, null, 2) + '\n');
} finally { await browser.close(); }
