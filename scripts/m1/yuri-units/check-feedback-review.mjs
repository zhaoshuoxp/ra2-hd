// Relocate one self-contained HTML file and verify images and decoded videos offline.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [input, destination, kind = 'effects'] = process.argv.slice(2), out = path.resolve(destination);
const expectedVideos = Number(process.argv[5] ?? 5);
await fs.mkdir(out, { recursive: false });
const copy = path.join(out, 'review-only.html'); await fs.copyFile(input, copy);
const browser = await chromium.launchPersistentContext(path.join(out, 'profile'), {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    offline: true, viewport: { width: 1440, height: 1000 },
    args: ['--disable-background-networking', '--no-first-run', '--autoplay-policy=no-user-gesture-required'],
});
try {
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.goto(pathToFileURL(copy).href, { timeout: 120000, waitUntil: 'domcontentloaded' });
    const images = await page.evaluate(async () => {
        await Promise.all([...document.images].map(image => image.decode()));
        return [...document.images].map(image => ({ width: image.naturalWidth, height: image.naturalHeight,
            embedded: image.src.startsWith('data:image/png;base64,') }));
    });
    assert(images.length > 0 && images.every(image => image.width > 0 && image.height > 0 && image.embedded));
    if (kind === 'art') {
        assert.equal(await page.locator('#content section').count(), 3);
        assert.equal(await page.locator('#content figure').count(), 24);
        await page.locator('#scale').click();
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth));
        const clipped = await page.evaluate(() => [...document.querySelectorAll('#content figure img')].filter(image => {
            const rect = image.getBoundingClientRect(), figure = image.closest('figure').getBoundingClientRect();
            return rect.left < figure.left || rect.right > figure.right || rect.bottom > figure.bottom;
        }).map(image => image.alt));
        assert.deepEqual(clipped, [], 'Every accepted/sample pair must fit inside its comparison card');
        await page.screenshot({ path: path.join(out, 'clean-art-4x.png') });
        await page.locator('#scale').click();
    }
    const clips = await page.evaluate(async () => {
        const rows = [];
        for (const video of document.querySelectorAll('video')) {
            if (!video.src.startsWith('data:video/mp4;base64,')) throw Error('External media dependency');
            await new Promise((resolve, reject) => {
                video.addEventListener('loadedmetadata', resolve, { once: true });
                video.addEventListener('error', () => reject(Error('Media error ' + video.error?.code)), { once: true }); video.load();
            });
            await video.play();
            const frame = await new Promise(resolve => video.requestVideoFrameCallback((_, metadata) => resolve(metadata)));
            rows.push({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, decodedFrames: frame.presentedFrames });
            video.pause();
        }
        return rows;
    });
    if (kind === 'effects') assert.equal(clips.length, expectedVideos);
    assert(clips.every(clip => clip.width > 0 && clip.height > 0 && clip.duration > 0 && clip.decodedFrames > 0));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await page.screenshot({ path: path.join(out, 'review.png') });
    const result = { status: 'PASS_OFFLINE_RELOCATED_HTML', kind, images: images.length, clips, errors, external };
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} finally { await browser.close(); }
