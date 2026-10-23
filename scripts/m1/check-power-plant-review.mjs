import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = path.resolve(process.argv[2] ?? '.artifacts/m1-2/full-art-review-v1');
const expectedImages = Number(process.argv[3] ?? 6);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'FAIL', errors: [], external: [], cases: [] };
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.route('**/*', route => {
            if (!route.request().url().startsWith('file:') && !route.request().url().startsWith('data:')) {
                report.external.push(route.request().url()); return route.abort();
            }
            return route.continue();
        });
        await page.goto(pathToFileURL(path.join(root, 'review.html')).href);
        const result = await page.evaluate(() => ({
            images: [...document.images].map(image => ({ complete: image.complete, size: [image.naturalWidth, image.naturalHeight] })),
            overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        assert(result.images.length === expectedImages && result.images.every(image => image.complete && image.size[0] > 0));
        assert(!result.overflow);
        report.cases.push({ width, javaScript: false, ...result });
        await page.screenshot({ path: path.join(root, `review-${width}.png`) });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    report.status = 'PASS_STATIC_REVIEW_ONLY';
    console.log(JSON.stringify(report));
} finally {
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
