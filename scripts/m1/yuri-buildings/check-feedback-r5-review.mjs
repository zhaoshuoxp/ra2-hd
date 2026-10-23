// Decode the offline incremental review without an external request.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await fs.mkdir(output);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
    const errors = [], externalRequests = [];
    page.on('pageerror', e => errors.push(e.stack));
    page.on('request', r => { if (/^https?:/.test(r.url())) externalRequests.push(r.url()); });
    await page.goto('file://' + path.join(root, 'C-Feedback-R5-Review.html'), { timeout: 120000 });
    const media = await page.evaluate(async () => {
        await Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.decode(); }));
        const videos = [...document.querySelectorAll('video')];
        await Promise.all(videos.map(v => new Promise((resolve, reject) => {
            v.preload = 'metadata'; v.onloadedmetadata = resolve;
            v.onerror = () => reject(Error('Native clip metadata decode failed')); v.load();
        })));
        return { images: [...document.images].map(i => [i.naturalWidth, i.naturalHeight]),
            videos: videos.map(v => ({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })) };
    });
    assert.equal(media.images.length, 33);
    assert.equal(media.videos.length, Number(process.argv.find(a => a.startsWith('--clips='))?.slice(8) ?? 6));
    assert(media.videos.every(v => v.width === 3840 && v.height === 2160 && v.duration > 1));
    assert.equal(errors.length, 0); assert.equal(externalRequests.length, 0);
    await page.screenshot({ path: path.join(output, 'review.png') });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'PASS_OFFLINE_R5_REVIEW',
        media, errors, externalRequests }, null, 2) + '\n');
    console.log('PASS_OFFLINE_R5_REVIEW');
} finally { await browser.close(); }
