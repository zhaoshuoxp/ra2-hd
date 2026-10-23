import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [reviewArg, outputArg] = process.argv.slice(2);
const review = path.resolve(reviewArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const browser = await chromium.launch({ headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const report = { status: 'RUNNING', pages: [], errors: [], externalRequests: [] };
page.on('pageerror', error => report.errors.push(error.stack));
page.on('request', request => { if (/^https?:/i.test(request.url())) report.externalRequests.push(request.url()); });
try {
    for (const file of ['M2.4-Map-Language-Fixes-Embedded.html', 'Native-Context-Embedded.html']) {
        await page.goto(pathToFileURL(path.join(review, file)).href, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
        const row = await page.evaluate(() => ({ title: document.title, images: document.images.length,
            unresolved: [...document.images].filter(image => !image.complete || !image.naturalWidth).length,
            externalImages: [...document.images].filter(image => !image.src.startsWith('data:')).length,
            slots: [...document.querySelectorAll('.banner text')].map(text => {
                const box = text.getBBox(); return { text: text.textContent, x: box.x, right: box.x + box.width };
            }), horizontalOverflow: document.documentElement.scrollWidth > innerWidth }));
        assert.equal(row.unresolved, 0); assert.equal(row.externalImages, 0);
        assert.equal(row.slots.length, 12);
        assert(row.slots.every(slot => slot.x >= 0 && slot.right <= 436));
        assert(!row.horizontalOverflow);
        for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
            await page.locator('#language').selectOption(language);
            assert.equal(await page.locator('.preview:visible').count(), 4);
            assert.equal(await page.locator('article:visible').count(), 2);
        }
        await page.locator('#native').check();
        await page.screenshot({ path: path.join(output, file.replace('.html', '.png')) });
        report.pages.push({ file, ...row });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_OFFLINE_EMBEDDED_REVIEW_IMAGES_TEXT_FIT_AND_FILTERS';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally { await browser.close(); }
await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
