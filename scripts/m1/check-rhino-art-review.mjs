import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const root = path.resolve(process.argv[2] ?? '.artifacts/m1-3a/review-v2');
const analysis = JSON.parse(await fs.readFile(path.join(root, 'review-validation.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'FAIL', cases: [], errors: [], external: [] };
try {
    for (const [width, javaScriptEnabled] of [[1200, false], [600, false], [1200, true]]) {
        const context = await browser.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: 2, javaScriptEnabled });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.route('**/*', route => {
            if (!/^(file|data):/.test(route.request().url())) {
                report.external.push(route.request().url()); return route.abort();
            }
            return route.continue();
        });
        await page.goto(pathToFileURL(path.join(root, 'review.html')).href);
        await page.locator('label[for="primary-4k-B"]').click();
        const measure = await page.evaluate(() => {
            const stack = document.getElementById('primary-4k-B').parentElement.querySelector('.stack');
            const a = stack.querySelector('.a'), b = stack.querySelector('.b');
            return { imageCount: document.images.length, allDecoded: [...document.images].every(i => i.complete && i.naturalWidth > 0),
                source: [b.naturalWidth, b.naturalHeight], displayed: [b.clientWidth, b.clientHeight],
                controlHidden: getComputedStyle(a).display === 'none', candidateVisible: getComputedStyle(b).display === 'block',
                viewportScale: visualViewport.scale, devicePixelRatio, userAgent: navigator.userAgent,
                documentOverflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(measure.imageCount, analysis.imageCount);
        assert(measure.allDecoded && measure.controlHidden && measure.candidateVisible && !measure.documentOverflow);
        assert.deepEqual(measure.source, [720, 520]); assert.deepEqual(measure.displayed, [360, 260]);
        assert.equal(measure.viewportScale, 1); assert.equal(measure.devicePixelRatio, 2);
        report.cases.push({ width, javaScriptEnabled, ...measure });
        await page.screenshot({ path: path.join(root, `browser-${width}-${javaScriptEnabled}.png`) });
        await context.close();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    report.status = 'PASS_NATIVE_CSS_AND_STATIC_TOGGLE_ONLY';
    console.log(JSON.stringify(report));
} finally {
    await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
