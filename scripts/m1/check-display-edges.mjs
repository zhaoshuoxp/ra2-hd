import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const output = process.argv[2], report = { status: 'FAIL', views: [], errors: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(output, 'review.html')).href);
        const loaded = await page.locator('img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0));
        assert(loaded); assert.equal(await page.locator('img').count(), 57);
        for (let index = 0; index < 10; index++) {
            await page.locator('#frame').fill(String(index));
            assert.equal(await page.locator(`.motion-frame[data-index="${index}"]:visible`).count(), 1);
            const sizes = await page.locator('img:visible').evaluateAll(imgs => imgs.map(i => [i.getBoundingClientRect().width, i.getBoundingClientRect().height]));
            sizes.forEach(s => assert.deepEqual(s, [420, 320]));
        }
        await page.locator('#frame').fill('0'); await page.locator('#play').click();
        await page.waitForFunction(() => Number(document.getElementById('frame').value) > 0);
        await page.locator('#play').click(); assert.equal(await page.locator('#play').textContent(), 'Play samples');
        for (const href of await page.locator('a').evaluateAll(links => links.map(a => a.getAttribute('href'))))
            await fs.access(path.resolve(output, href));
        await page.locator('section').first().screenshot({ path: `${output}/browser-${width}.png` });
        report.views.push({ width, imageCount: 57, nativeCss: [420, 320], sliderAndPlayback: 'PASS' });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close(); await fs.writeFile(`${output}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
