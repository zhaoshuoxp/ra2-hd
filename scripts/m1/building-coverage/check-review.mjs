import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = '.artifacts/m1-6c/review-v1';
const report = { status: 'FAIL', errors: [], externalRequests: [], views: [] };
const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
});
try {
    for (const [width, height] of [[1920, 1080], [1440, 900], [600, 900]]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('request', request => {
            if (/^https?:/.test(request.url())) report.externalRequests.push(request.url());
        });
        await page.goto(pathToFileURL(path.resolve(out, 'Soviet-Buildings-Representative-Review.html')).href);
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
        const images = await page.locator('img').evaluateAll(items => items.map(image => ({
            loaded: image.complete && image.naturalWidth > 0,
            css: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
            embedded: image.src.startsWith('data:image/png;base64,'),
        })));
        assert.equal(images.length, 24);
        assert(images.every(image => image.loaded && image.embedded));
        assert.deepEqual(images[0].css, [278, 220]);
        assert.deepEqual(images[1].css, [278, 220]);
        assert.deepEqual(images[4].css, [130, 118]);
        assert.deepEqual(images[5].css, [130, 118]);
        const first = await page.locator('#buildHd').getAttribute('src');
        await page.locator('#step').click();
        assert.equal(await page.locator('#frame').inputValue(), '1');
        assert.notEqual(await page.locator('#buildHd').getAttribute('src'), first);
        await page.locator('#reverse').check();
        await page.locator('#step').click();
        assert.equal(await page.locator('#frame').inputValue(), '0');
        assert.equal(await page.locator('#buildHd').getAttribute('src'), first);
        await page.locator('#reverse').uncheck();
        await page.locator('#play').click();
        await page.waitForFunction(() => Number(document.getElementById('frame').value) >= 2);
        await page.locator('#play').click();
        assert.equal(await page.locator('#play').textContent(), 'Play');
        await page.locator('#frame').fill('25');
        await page.locator('#frame').dispatchEvent('input');
        assert.equal(await page.locator('#frameLabel').textContent(), '25 / 25');
        await page.locator('#construction').screenshot({ path: `${out}/construction-${width}.png` });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${out}/browser-${width}.png` });
        report.views.push({ width, height, embeddedImages: images.length, nativeSizePreserved: true,
            playPause: true, frameStep: true, reverse: true, endpoint: true });
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_OFFLINE_NATIVE_SIZE_AND_ANIMATION_CONTROLS';
} finally {
    await browser.close();
    await fs.writeFile(`${out}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
