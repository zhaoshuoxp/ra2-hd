import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
});
const report = { status: 'RUNNING', errors: [], network: [], videos: [] };
try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
    });
    await page.route('**/*', (route) => {
        const url = route.request().url();
        if (/^(file|data|blob):/.test(url)) return route.continue();
        report.network.push(url);
        return route.abort();
    });
    page.on('pageerror', (e) => report.errors.push(e.message));
    const delivery = JSON.parse(await fs.readFile(path.join(root, 'delivery.json'), 'utf8'));
    await page.goto('file://' + path.join(root, delivery.review), {
        timeout: 120000,
    });
    await page.waitForFunction(
        () => [...document.images].every((i) => i.complete && i.naturalWidth > 0),
        undefined,
        { timeout: 60000 },
    );
    assert.equal(await page.locator('article').count(), 24);
    report.images = await page.evaluate(() =>
        [...document.images].map((i) => ({
            alt: i.alt,
            native: [i.naturalWidth, i.naturalHeight],
            shown: [i.width, i.height],
        })),
    );
    assert(report.images.every((i) => i.native[0] === i.shown[0] && i.native[1] === i.shown[1]));
    for (const group of ['infantry', 'ground', 'air-naval']) {
        await page.locator(`nav button[data-group="${group}"]`).click();
        const visible = await page
            .locator('article:visible')
            .evaluateAll((a) => a.map((e) => e.dataset.group));
        assert(visible.length > 0 && visible.every((g) => g === group));
    }
    await page.locator('nav button[data-group="all"]').click();
    await page.screenshot({ path: path.join(root, 'review-browser.png') });
    for (const button of await page.locator('[data-video]').all()) {
        const id = await button.getAttribute('data-video');
        await button.click();
        await page.waitForFunction(
            () => {
                const v = document.querySelector('video');
                return v && v.readyState >= 2;
            },
            undefined,
            { timeout: 30000 },
        );
        const data = await page.evaluate(async () => {
            const v = document.querySelector('video');
            v.pause();
            v.currentTime = 2;
            await new Promise((resolve) => v.addEventListener('seeked', resolve, { once: true }));
            return {
                width: v.videoWidth,
                height: v.videoHeight,
                time: v.currentTime,
                error: v.error?.message ?? null,
            };
        });
        assert.equal(data.width, 1491, id);
        assert.equal(data.height, 1080, id);
        assert.equal(data.error, null, id);
        report.videos.push({ id, ...data });
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.network, []);
    report.status = 'PASS_24_EMBEDDED_NATIVE_VIDEOS_IMAGES_FILTERS_ZERO_NETWORK';
} catch (e) {
    report.status = 'FAIL';
    report.failure = e.stack;
    process.exitCode = 1;
} finally {
    await fs.writeFile(
        path.join(root, 'browser-check.json'),
        JSON.stringify(report, null, 2) + '\n',
    );
    await browser.close();
}
console.log(report.status);
