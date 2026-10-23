import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = path.resolve(process.argv[2]);
const report = { status: 'FAIL', cases: [], errors: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 2, javaScriptEnabled: false });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.route('**/*', route => /^(file|data):/.test(route.request().url()) ? route.continue() : route.abort());
        await page.goto(pathToFileURL(path.join(root, 'review.html')).href);
        for (const mode of [0, 1, 2]) {
            await page.locator(`label[for="m${mode}"]`).click();
            const dimensions = await page.locator(`.stage .p${mode} img`).evaluate(img => ({
                source: [img.naturalWidth, img.naturalHeight], displayed: [img.clientWidth, img.clientHeight],
                visible: img.getClientRects().length > 0, decoded: [...document.images].every(i => i.complete && i.naturalWidth),
                overflow: document.documentElement.scrollWidth > innerWidth, devicePixelRatio, scale: visualViewport.scale,
            }));
            assert.deepEqual(dimensions.source, [1280, 1040]);
            assert.deepEqual(dimensions.displayed, [640, 520]);
            assert(dimensions.visible && dimensions.decoded && !dimensions.overflow);
            assert.equal(dimensions.devicePixelRatio, 2); assert.equal(dimensions.scale, 1);
            report.cases.push({ width, mode, ...dimensions });
            if (width === 1440) await page.locator('.stage').screenshot({ path: path.join(root, `browser-mode-${mode}.png`) });
        }
        await page.screenshot({ path: path.join(root, `browser-${width}.png`) });
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_FIXED_CSS_SIZE_AND_STATIC_SWITCHING';
} finally {
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
console.log(report.status);
