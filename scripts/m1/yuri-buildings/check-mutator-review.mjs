// Decode the complete changed-building review in an owned offline Chrome instance.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors = [], externalRequests = [];
    page.on('pageerror', error => errors.push(error.stack));
    page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    await page.goto('file://' + path.join(root, 'Mutator-Building-Electricity-Review-v2.html'), { timeout: 120000 });
    const media = await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()));
        const videos = [...document.querySelectorAll('video')];
        await Promise.all(videos.map(video => new Promise((resolve, reject) => {
            video.preload = 'metadata'; video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(Error('Native clip decode failed')); video.load();
        })));
        return { images: [...document.images].map(image => [image.naturalWidth, image.naturalHeight]),
            videos: videos.map(video => ({ width: video.videoWidth, height: video.videoHeight, duration: video.duration })) };
    });
    assert.equal(media.images.length, 7); assert.equal(media.videos.length, 4);
    assert(media.videos.every(video => video.width === 3840 && video.height === 2160 && video.duration > 1));
    assert.equal(errors.length, 0); assert.equal(externalRequests.length, 0);
    await page.screenshot({ path: path.join(root, 'review-browser-v2.png') });
    await fs.writeFile(path.join(root, 'review-browser-v2.json'), JSON.stringify({
        status: 'PASS_OFFLINE_BUILDING_PHASE_REVIEW', media, errors, externalRequests,
    }, null, 2) + '\n', { flag: 'wx' });
    console.log('PASS_OFFLINE_BUILDING_PHASE_REVIEW; seven full-buffer images and four 4K native clips');
} finally { await browser.close(); }
