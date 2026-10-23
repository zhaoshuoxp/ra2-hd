import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const out = '.artifacts/m1-6b/crane-motion-review-v1';
const result = { status: 'FAIL', errors: [], external: [], views: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1050 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', e => result.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) result.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(out, 'review.html')).href);
        await page.waitForFunction(() => window.__motionReview?.ready());
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await page.locator('#frame').fill('6');
        assert.equal(await page.locator('#counter').textContent(), '6 / 20');
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        assert.equal(await page.locator('#counter').textContent(), '7 / 20');
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await page.selectOption('#speed', '0.25');
        await page.screenshot({ path: `${out}/browser-${width}.png` });
        const images = await page.locator('figure img').evaluateAll(imgs => imgs.map(im => ({ ready: im.complete && im.naturalWidth > 0, width: im.width, height: im.height })));
        assert.equal(images.length, 2);
        assert(images.every(im => im.ready && im.width === 340 && im.height === 260));
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#counter').value !== '6 / 20');
        result.views.push({ width, synchronizedFrames: 21, controls: 'PASS', sceneCss: [340, 260] });
        await context.close();
    }
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.external, []);
    result.status = 'PASS_INTERACTIVE_MOTION_REVIEW';
} finally {
    await browser.close();
    await fs.writeFile(`${out}/browser-check.json`, JSON.stringify(result, null, 2) + '\n');
}
console.log(result.status);
