import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const output = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'FAIL', views: [], errors: [], external: [] };
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(output, 'review.html')).href);
        const images = await page.locator('img').evaluateAll(items => items.map(img => ({
            css: [img.getBoundingClientRect().width, img.getBoundingClientRect().height],
            natural: [img.naturalWidth, img.naturalHeight], complete: img.complete,
        })));
        assert.equal(images.length, 23);
        for (const image of images) {
            assert(image.complete && image.natural[0] > 0);
            assert.deepEqual(image.css.map(v => v * 2), image.natural);
        }
        for (const href of await page.locator('a').evaluateAll(items => items.map(a => a.getAttribute('href'))))
            await fs.access(path.resolve(output, href));
        await page.screenshot({ path: `${output}/browser-${width}.png`, fullPage: true });
        report.views.push({ width, images });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    report.status = 'PASS_NATIVE_CROP_SIZE_NO_SCRIPT_NO_EXTERNAL';
} finally {
    await browser.close();
    await fs.writeFile(`${output}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
