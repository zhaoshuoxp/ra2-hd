import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [reviewArg, outputArg] = process.argv.slice(2), review = path.resolve(reviewArg), out = path.resolve(outputArg);
const expectedImages = Number(process.argv.find(value => value.startsWith('--images='))?.slice(9) ?? 14);
await fs.mkdir(out, { recursive: false });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { status: 'RUNNING', errors: [], externalRequests: [], layouts: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('request', r => { if (/^https?:/i.test(r.url())) report.externalRequests.push(r.url()); });
    await page.goto(pathToFileURL(review).href);
    await page.evaluate(() => document.querySelectorAll('details').forEach(element => element.open = true));
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    for (const width of [1440, 768]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page.evaluate(() => ({ width: innerWidth, images: document.images.length,
            externalImages: [...document.images].filter(i => !i.src.startsWith('data:')).length,
            overflow: document.documentElement.scrollWidth > innerWidth }));
        assert.equal(layout.images, expectedImages); assert.equal(layout.externalImages, 0); assert(!layout.overflow);
        report.layouts.push(layout);
        await page.screenshot({ path: path.join(out, `review-${width}.png`) });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_OFFLINE_EMBEDDED_IMAGES_AND_LAYOUT';
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
