import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] ?? '.artifacts/menu-ui/review-original-v3');
const radarText = process.argv.includes('--radar-text');
const cameoCorrections = process.argv.includes('--cameo-corrections');
const remaining = process.argv.includes('--remaining');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-ui-html-only-'));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const results = [];
try {
    const remainingCount = remaining ? JSON.parse(await fs.readFile(path.join(root, 'receipt.json'), 'utf8')).embeddedImages : 0;
    const pages = remaining ? [['review.html', remainingCount]] : cameoCorrections ? [['review.html', 18]] : radarText ? [['review.html', 16]] : [['review.html', 163], ['radar.html', 198], ['screens.html', 28]];
    for (const [name, expected] of pages) {
        const destination = path.join(temporary, name);
        await fs.copyFile(path.join(root, name), destination);
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [], externalImages = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (r.resourceType() === 'image' && !r.url().startsWith('data:')) externalImages.push(r.url()); });
        await page.goto(pathToFileURL(destination).href);
        await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
        assert.equal(await page.locator('img').count(), expected);
        assert(await page.locator('img').evaluateAll(images => images.every(i => i.src.startsWith('data:image/'))));
        if (radarText || cameoCorrections || remaining) {
            await page.getByRole('button', { name: '2x inspection' }).click();
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale')), '2');
            await page.getByRole('button', { name: '1x UI size' }).click();
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale')), '1');
        } else {
            await page.locator('#size').selectOption('2.4');
            assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--scale')), '2.4');
        }
        if (name === 'radar.html') {
            for (const slider of await page.locator('[data-radar-slider]').all()) {
                for (let frame = 0; frame < 33; frame++) {
                    await slider.fill(String(frame));
                    assert.equal(await slider.evaluate(s => s.closest('section').querySelector('[data-radar-frame]:not([hidden])').dataset.radarFrame), String(frame));
                }
            }
        }
        if (name === 'screens.html') {
            const image = page.locator('.screens img').first();
            await image.click();
            assert(await image.evaluate(i => i.getBoundingClientRect().width === i.naturalWidth));
        }
        assert.deepEqual(errors, []); assert.deepEqual(externalImages, []);
        results.push({ name, images: expected, status: 'PASS', isolatedHtmlOnly: true, externalImages: 0 });
        if (name === 'review.html') await page.screenshot({ path: path.join(root, 'page-preview.png') });
        await page.close();
    }
    await fs.writeFile(path.join(root, 'embedded-check.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
} finally {
    await browser.close();
    await fs.rm(temporary, { recursive: true, force: true });
}
