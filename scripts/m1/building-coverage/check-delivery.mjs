import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'RUNNING', errors: [], externalRequests: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    await page.goto(pathToFileURL(path.join(folder, 'REVIEW-DASHBOARD.html')).href);
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth));
    assert.equal(await page.locator('tbody tr').count(), 162);
    for (const link of await page.locator('a').evaluateAll(items => items.map(item => item.getAttribute('href')))) {
        await fs.access(path.join(folder, link));
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'dashboard.png'), fullPage: true });
    await page.getByRole('link', { name: 'Open embedded original / HD artwork and animation review' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#family option').length === 23, undefined, { timeout: 60000 });
    assert.equal(await page.locator('#family option').count(), 23);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_OFFLINE_DELIVERY_DASHBOARD_AND_REVIEW_LINK';
} finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
}
console.log(report.status);
