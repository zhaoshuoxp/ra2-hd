import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const root = '.artifacts/m1-3g-shadow/review-final';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve('.artifacts/m1-3g-shadow/report-final/report.html')).href);
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
    const images = await page.locator('img').evaluateAll(images => images.map(i => ({ width: i.width, height: i.height, native: [i.naturalWidth, i.naturalHeight] })));
    assert.equal(images.length, 1);
    assert(images.every(i => i.width === i.native[0] && i.height === i.native[1]));
    const videos = [];
    for (const [index, name] of ['states', 'movement'].entries()) {
        const video = page.locator('video').nth(index);
        await video.evaluate(async (v, data) => {
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
            v.src = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
            await new Promise(resolve => v.addEventListener('loadeddata', resolve, { once: true }));
        }, (await fs.readFile(`${root}/${name}.webm`)).toString('base64'));
        const info = await video.evaluate(v => ({ width: v.videoWidth, height: v.videoHeight, display: [v.width, v.height], duration: v.duration }));
        assert.deepEqual([info.width, info.height], info.display);
        for (const t of name === 'states' ? [0.2, 1.5, 3, 6, 8, 10] : [1, 5, 7]) {
            await video.evaluate((v, t) => new Promise(resolve => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = t; }), t);
            const png = await video.evaluate(v => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL(); });
            await fs.writeFile(`${root}/${name}-${t}s.png`, Buffer.from(png.split(',')[1], 'base64'));
        }
        videos.push({ name, ...info });
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(`${root}/media-check.json`, JSON.stringify({ status: 'PASS', images, videos, errors }, null, 2) + '\n');
    await page.screenshot({ path: `${root}/report-screen.png` });
}
finally {
    await browser.close();
}
