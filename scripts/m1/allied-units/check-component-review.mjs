import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--no-first-run'],
});
try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, offline: true });
    for (const directory of process.argv.slice(2)) {
        const root = path.resolve(directory), page = await context.newPage(), errors = [], external = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
        await page.goto(pathToFileURL(path.join(root, 'Native-Component-Review.html')).href);
        const result = await page.evaluate(async () => {
            for (let i = 0; i < data.length; i++) {
                part.value = String(i); draw();
                for (const img of document.images) await img.decode();
                const authored = document.querySelector('#authored');
                if (authored.naturalWidth !== parseFloat(authored.style.width) * 2)
                    throw Error('Native component density mismatch at ' + i);
            }
            part.value = '0'; draw();
            return { bearings: data.length, parts: new Set(data.map(row => row.part)).size, nativeSize: true };
        });
        await page.screenshot({ path: path.join(root, 'native-review.png') });
        await page.locator('#scale').selectOption('2');
        await page.screenshot({ path: path.join(root, 'inspection-review.png') });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        await fs.writeFile(path.join(root, 'html-check.json'), JSON.stringify({
            status: 'PASS_OFFLINE_COMPONENT_REVIEW_UI', ...result, errors, external, runtimeVerified: false,
        }, null, 2) + '\n', { flag: 'wx' });
        console.log(path.basename(root), result); await page.close();
    }
} finally { await browser.close(); }
