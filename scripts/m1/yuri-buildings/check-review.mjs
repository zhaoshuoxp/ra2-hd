// Verify the offline direction review's delivered buffers and controls in Chrome.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto('file://' + path.join(root, 'Yuri-Buildings-Representative-Review.html'));
    const decode = () => page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await decode();
    const result = await page.evaluate(() => ({
        samples: document.querySelectorAll('article').length,
        images: document.images.length,
        offline: [...document.images].every(image => image.src.startsWith('data:')),
        overflow: document.documentElement.scrollWidth > innerWidth,
        buffers: [...document.querySelectorAll('.density')].map(image => ({
            natural: [image.naturalWidth, image.naturalHeight],
            logical: [Number(image.getAttribute('width')), Number(image.getAttribute('height'))],
            display: [image.width, image.height], density: Number(image.dataset.density),
        })),
    }));
    assert.equal(result.samples, 18);
    assert(result.offline && !result.overflow);
    for (const buffer of result.buffers) {
        assert.deepEqual(buffer.natural, buffer.logical.map(value => value * buffer.density));
        assert.deepEqual(buffer.display, buffer.logical);
    }
    await page.screenshot({ path: path.join(root, 'html-desktop.png') });
    await page.selectOption('#sample', 'YACNST-SNOW');
    await page.selectOption('#owner', 'blue');
    await decode();
    assert.equal(await page.locator('article:visible').count(), 1);
    const redBlue = await page.locator('#YACNST-SNOW .d4').getAttribute('src');
    await page.selectOption('#owner', 'green');
    assert.notEqual(await page.locator('#YACNST-SNOW .d4').getAttribute('src'), redBlue);
    await page.selectOption('#owner', 'mask');
    await page.selectOption('#view', 'buffer');
    const width = await page.locator('#YACNST-SNOW .d4').evaluate(image => image.width);
    await page.selectOption('#owner', 'blue');
    assert.equal(await page.locator('#YACNST-SNOW .d4').evaluate(image => image.width), width);
    assert.equal(width, 1024);
    await page.selectOption('#view', 'logical');
    await decode();
    await page.locator('#YACNST-SNOW').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'html-snow.png') });
    assert.equal(errors.length, 0);
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify({
        status: 'PASS_OFFLINE_REPRESENTATIVE_REVIEW', ...result,
        controls: ['owner red/blue/green/mask', 'logical/buffer size', 'sample filter'], errors,
        boundary: 'Static direction samples; does not establish native gameplay owner-color or complete family exports.',
    }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'PASS_OFFLINE_REPRESENTATIVE_REVIEW', samples: result.samples, images: result.images }));
} finally {
    await browser.close();
}
