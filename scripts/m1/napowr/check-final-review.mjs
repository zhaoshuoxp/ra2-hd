import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '.artifacts/m1-6a/final-review-v1';
const expectedImages = Number(process.argv[3] ?? 17);
const result = { status: 'FAIL', errors: [], external: [], views: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1, javaScriptEnabled: false });
        const page = await context.newPage();
        page.on('pageerror', e => result.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url()))
            result.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(out, 'review.html')).href);
        const images = await page.locator('img').evaluateAll(imgs => imgs.map(i => ({
            loaded: i.complete && i.naturalWidth > 0, size: [i.width, i.height],
        })));
        assert.equal(images.length, expectedImages);
        assert(images.every(i => i.loaded));
        assert(images.every(i => JSON.stringify(i.size) === '[340,260]'));
        await page.screenshot({ path: `${out}/browser-${width}.png` });
        result.views.push({ width, images: images.length, sceneCss: [340, 260], javascriptRequired: false });
        await context.close();
    }
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.external, []);
    result.status = 'PASS_FIXED_SIZE_SELF_CONTAINED_REVIEW';
}
finally {
    await browser.close();
    await fs.writeFile(`${out}/browser-check.json`, JSON.stringify(result, null, 2) + '\n');
}
console.log(result.status);
