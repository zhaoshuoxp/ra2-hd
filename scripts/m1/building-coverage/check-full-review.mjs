import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] ?? '.artifacts/m1-6c/full-review-v2';
const report = { status: 'RUNNING', errors: [], externalRequests: [], families: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
    await page.goto(pathToFileURL(path.resolve(root, 'Soviet-Buildings-Complete-Review.html')).href, { timeout: 60000 });
    await page.locator('#play').click();
    for (const key of await page.locator('#family option').evaluateAll(items => items.map(i => i.value))) {
        await page.locator('#family').selectOption(key);
        await page.waitForFunction(() => document.querySelector('#info').textContent.includes(document.querySelector('#family').value.split('-')[0].toUpperCase()));
        await page.waitForTimeout(100);
        const check = await page.evaluate(() => {
            const c = document.querySelector('#hd'), p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            return { pixels: p.filter((_, i) => i % 4 === 3).some(v => v > 0),
                native: [c.clientWidth, c.clientHeight], original: [document.querySelector('#original').clientWidth, document.querySelector('#original').clientHeight],
                states: document.querySelector('#state').options.length };
        });
        assert(check.pixels, key); assert.deepEqual(check.native, check.original, key);
        await page.locator('#state').selectOption(String(check.states - 1));
        await page.locator('#next').click();
        assert.equal(await page.locator('#frame').inputValue(), '1');
        report.families.push({ key, ...check });
    }
    await page.locator('#family').selectOption('naindp-temperate');
    await page.locator('#state').selectOption({ label: 'Construction / reverse to sell' });
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#frame').value) > 1);
    await page.locator('#play').click();
    await page.locator('#frame').fill('25');
    await page.screenshot({ path: path.join(root, 'browser-final.png') });
    assert.equal(report.families.length, 23);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_ALL_EMBEDDED_FAMILIES_NATIVE_SIZE_AND_ANIMATION_CONTROLS';
} finally {
    await browser.close();
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(report, null, 2));
}
console.log(report.status);
