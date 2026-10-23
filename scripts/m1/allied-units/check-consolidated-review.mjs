import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const file = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--no-first-run'],
});
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, offline: true });
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.goto(pathToFileURL(file).href);
    const inventory = await page.evaluate(() => rows.map(row => ({
        identity: row.identity, group: row.group, reviews: row.reviews.length, clips: row.clips.length,
    })));
    assert.equal(inventory.length, 30);
    assert.equal(new Set(inventory.map(row => row.identity)).size, 30);
    assert(inventory.every(row => row.clips > 0));
    for (const group of [...new Set(inventory.map(row => row.group))]) {
        await page.locator('#groups button', { hasText: group }).click();
        assert.equal(await page.locator('article').count(), inventory.filter(row => row.group === group).length);
        const article = page.locator('article').first();
        await article.locator('nav button').first().click();
        if (await article.locator('iframe').count()) {
            await article.frameLocator('iframe').locator('h1').waitFor();
            await article.frameLocator('iframe').locator('#scale').selectOption('2');
            await article.frameLocator('iframe').locator('#scale').selectOption('1');
        }
        await article.locator('nav button').last().click();
        await page.waitForFunction(() => [...document.querySelectorAll('video')].some(v => v.readyState >= 1));
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await page.screenshot({ path: output.replace(/\.json$/, '.png') });
    await fs.writeFile(output, JSON.stringify({ status: 'PASS_CONSOLIDATED_OFFLINE_REVIEW_UI',
        families: inventory, errors, external }, null, 2) + '\n', { flag: 'wx' });
    console.log('PASS_CONSOLIDATED_OFFLINE_REVIEW_UI', inventory.length);
} finally { await browser.close(); }
