import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const output = process.argv[2];
const expected = JSON.parse(await fs.readFile(`${output}/images.json`, 'utf8'));
const report = { status: 'FAIL', views: [], errors: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(output, 'review.html')).href);
        const images = await page.locator('img').evaluateAll(els => els.map(e => ({ complete: e.complete,
            css: [e.getBoundingClientRect().width, e.getBoundingClientRect().height], natural: [e.naturalWidth, e.naturalHeight] })));
        assert.equal(images.length, expected.length);
        images.forEach((image, i) => {
            assert(image.complete); assert.deepEqual(image.css, expected[i].css); assert.deepEqual(image.natural, expected[i].pixels);
        });
        for (const file of expected) await fs.access(path.join(output, file.file));
        report.views.push({ width, images: images.length, fixedSizes: true });
        await page.screenshot({ path: `${output}/browser-${width}.png` });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close(); await fs.writeFile(`${output}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
