import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const output = process.argv[2];
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'FAIL', samples: [], errors: [], external: [] };
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(output, 'review.html')).href);
        for (const radio of await page.locator('input[type=radio]').all()) {
            await radio.check();
            const rows = await page.locator('.views img:visible').evaluateAll(images => images.map(img => ({
                css: [img.getBoundingClientRect().width, img.getBoundingClientRect().height],
                natural: [img.naturalWidth, img.naturalHeight], complete: img.complete,
            })));
            for (const row of rows) { assert.deepEqual(row.css, [660, 450]); assert(row.complete && row.natural[0] > 0); }
            report.samples.push({ width, rows });
        }
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close();
    await fs.writeFile(`${output}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
