import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const output = process.argv[2];
const report = { status: 'FAIL', samples: [], errors: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
        const page = await context.newPage();
        page.on('pageerror', e => report.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await page.goto(pathToFileURL(path.resolve(output, 'review.html')).href);
        const images = await page.locator('img').evaluateAll(elements => elements.map(img => ({
            complete: img.complete, natural: [img.naturalWidth, img.naturalHeight], declared: [img.width, img.height],
        })));
        assert.equal(images.length, 34);
        for (const img of images) {
            assert(img.complete); assert.deepEqual(img.natural, img.declared.map(n => n * 2));
        }
        for (const section of await page.locator('.animation').all()) {
            for (let phase = 0; phase < 8; phase++) {
                await section.locator('input').fill(String(phase));
                assert.equal(await section.locator('.frame:visible').count(), 1);
                assert.equal(await section.locator('.frame:visible').getAttribute('data-phase'), String(phase));
                const sizes = await section.locator('.frame:visible img').evaluateAll(els => els.map(e => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
                assert.deepEqual(sizes, [[420, 320], [420, 320]]);
            }
            await section.locator('button').click();
            await page.waitForTimeout(220);
            assert.notEqual(await section.locator('input').inputValue(), '7');
            await section.locator('button').click();
        }
        const fog = await page.locator('section').first().locator('img').evaluateAll(els => els.map(e => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
        assert.deepEqual(fog, [[600, 450], [600, 450]]);
        for (const href of await page.locator('a').evaluateAll(els => els.map(e => e.getAttribute('href')))) await fs.access(path.join(output, href));
        report.samples.push({ width, images: images.length, phases: 16, fixedCssSize: true });
        await page.screenshot({ path: `${output}/browser-${width}.png` });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); report.status = 'PASS';
} finally {
    await browser.close();
    await fs.writeFile(`${output}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
