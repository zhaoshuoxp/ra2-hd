// Test a lone relocated HTML file, including actual decoded frames for every embedded replay.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [input, destination] = process.argv.slice(2), out = path.resolve(destination);
await fs.mkdir(out, { recursive: false });
const copy = path.join(out, 'review-only.html');
await fs.copyFile(input, copy);
const browser = await chromium.launchPersistentContext(path.join(out, 'profile'), {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    offline: true, viewport: { width: 1320, height: 1040 },
    args: ['--disable-background-networking', '--no-first-run', '--autoplay-policy=no-user-gesture-required'],
});
try {
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.goto(pathToFileURL(copy).href, { timeout: 120000, waitUntil: 'domcontentloaded' });
    await page.locator('#pause').click();
    assert.equal(await page.locator('#cards section').count(), 24);
    assert.equal(await page.locator('#videos video').count(), 22);
    const clips = await page.evaluate(async () => {
        const results = [];
        for (const video of document.querySelectorAll('#videos video')) {
            if (!video.src.startsWith('data:video/mp4;base64,')) throw Error('External replay dependency');
            const failed = () => new Error('Media error ' + video.error?.code);
            await new Promise((resolve, reject) => {
                video.addEventListener('loadedmetadata', resolve, { once: true });
                video.addEventListener('error', () => reject(failed()), { once: true });
                video.load();
            });
            await video.play();
            const frame = await new Promise((resolve, reject) => {
                video.addEventListener('error', () => reject(failed()), { once: true });
                video.requestVideoFrameCallback((_, metadata) => resolve(metadata));
            });
            results.push({ name: video.closest('section').querySelector('h2').textContent,
                width: video.videoWidth, height: video.videoHeight, duration: video.duration,
                decodedFrames: frame.presentedFrames, embedded: true });
            video.pause();
        }
        return results;
    });
    assert(clips.every(clip => clip.width > 0 && clip.width <= 1920 && clip.height > 0
        && Number.isFinite(clip.duration) && clip.duration > 0 && clip.decodedFrames > 0));
    await page.screenshot({ path: path.join(out, 'embedded-replays.png') });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({
        status: 'PASS_ALL_EMBEDDED_REPLAYS_OFFLINE_RELOCATED_HTML', clips, errors, external,
        htmlOnly: true, appOrResourceChanges: false,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS_ALL_EMBEDDED_REPLAYS_OFFLINE_RELOCATED_HTML', clips: clips.length }));
} finally { await browser.close(); }
