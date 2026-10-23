// Drawing-buffer frame extraction for Original/HD motion comparison.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const report = JSON.parse(await fs.readFile(process.argv[2]));
const prefix = process.argv[3], output = path.resolve(process.argv[4]);
const clip = report.clips.find(file => path.basename(file) === prefix + '.webm');
assert(clip); await fs.mkdir(output);
const source = report.stages.find(s => s.name === 'YAGRND-native-intake-moving' || s.name === 'Gatling-rest').detail.source;
const bytes = await fs.readFile(clip);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage();
    await page.setContent('<video muted preload="auto"></video>');
    await page.evaluate(data => {
        document.querySelector('video').src = 'data:video/webm;base64,' + data;
    }, bytes.toString('base64'));
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
    await page.evaluate(async () => {
        const video = document.querySelector('video');
        if (Number.isFinite(video.duration)) return;
        // Streaming WebM may expose Infinity until the decoder scans its end.
        await new Promise(resolve => { video.onseeked = resolve; video.currentTime = 1e9; });
    });
    const duration = await page.evaluate(() => document.querySelector('video').duration), frames = [];
    assert(Number.isFinite(duration) && duration > .07, 'A finite recorded duration is required');
    for (let index = 0; index < 24; index++) {
        const seconds = .01 + (duration - .07) * index / 23;
        const frame = await page.evaluate(async ({ source, seconds }) => {
            const video = document.querySelector('video');
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Native video seek timeout')), 15000);
                video.onseeked = () => { clearTimeout(timer); resolve(); }; video.currentTime = seconds;
            });
            const canvas = document.createElement('canvas'); canvas.width = source[2]; canvas.height = source[3];
            canvas.getContext('2d').drawImage(video, ...source, 0, 0, source[2], source[3]);
            return { seconds: video.currentTime, buffer: [video.videoWidth, video.videoHeight], png: canvas.toDataURL() };
        }, { source, seconds });
        assert.deepEqual(frame.buffer, [3840, 2160]);
        const file = path.join(output, String(index).padStart(2, '0') + '.png');
        await fs.writeFile(file, Buffer.from(frame.png.split(',')[1], 'base64'));
        delete frame.png; frames.push({ ...frame, file });
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({
        status: 'PASS_UNSCALED_NATIVE_VIDEO_FRAME_EXTRACTION', clip, duration, source, frames,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        boundary: 'Recorded native drawing-buffer pixels, no generated motion or rescaling.',
    }, null, 2) + '\n');
    console.log('PASS_UNSCALED_NATIVE_VIDEO_FRAME_EXTRACTION', prefix, duration);
} finally { await browser.close(); }
