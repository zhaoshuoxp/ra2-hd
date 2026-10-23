import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const target = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--no-first-run'] });
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, offline: true });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.goto(pathToFileURL(target).href);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.waitForFunction(() => window.reviewReady);
    await page.selectOption('#action', 'FireFly');
    await page.selectOption('#owner', 'green');
    const result = await page.evaluate(() => ({ images: document.images.length,
        failed: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
        overflow: document.documentElement.scrollWidth > innerWidth }));
    assert.equal(result.failed, 0); assert.equal(result.images, 1); assert.equal(result.overflow, false);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await page.screenshot({ path: path.join(output, 'review-top.png') });
    await page.getByRole('heading', { name: 'Cameo', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'review-cameo.png') });
    await fs.writeFile(path.join(output, 'html-check.json'), JSON.stringify({
        status: 'PASS_OFFLINE_REVIEW', target, ...result, errors, external }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(result));
} finally { await browser.close(); }
