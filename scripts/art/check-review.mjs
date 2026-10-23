// Verify the delivered offline controls against actual rendered page state.
import { webkit } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const [directory, output] = process.argv.slice(2);
await fs.mkdir(output, { recursive: false });
const browser = await webkit.launch({ headless: true });
const results = [];
try {
    for (const file of (await fs.readdir(directory)).filter(f => f.endsWith('-Buildup-Review.html'))) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(directory, file)).href);
        const keys = await page.locator('#family option').allTextContents();
        for (let index = 0; index < keys.length; index++) {
            await page.locator('#family').selectOption(String(index));
            for (const density of ['2', '4']) {
                await page.locator('#density').selectOption(density);
                await page.locator('#next').click();
                await page.waitForFunction(() => ['original', 'before', 'candidate'].every(id => {
                    const image = document.getElementById(id);
                    return image.complete && image.naturalWidth > 0;
                }));
                assert.match(await page.locator('#label').textContent(), /^Phase \d+ \/ \d+$/);
            }
        }
        await page.locator('#direction').click();
        assert.equal(await page.locator('#direction').textContent(), 'Unbuild');
        const before = await page.locator('#label').textContent();
        await page.locator('#speed').selectOption('0.25');
        await page.locator('#play').click();
        await page.waitForTimeout(350);
        await page.locator('#play').click();
        assert.notEqual(await page.locator('#label').textContent(), before);
        await page.screenshot({ path: path.join(output, file.replace('.html', '.png')) });
        assert.deepEqual(errors, []);
        results.push({ file, sequences: keys, controls: 'PASS', pageErrors: errors });
        await page.close();
    }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'review-check.json'), JSON.stringify({
    status: 'PASS_OFFLINE_REVIEW_CONTROLS', results,
}, null, 2) + '\n');
console.log(JSON.stringify({ status: 'PASS_OFFLINE_REVIEW_CONTROLS', pages: results.length }));
