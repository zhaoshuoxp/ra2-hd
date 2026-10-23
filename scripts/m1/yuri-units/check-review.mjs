import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const file = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const browser = await chromium.launchPersistentContext(path.join(output, 'profile'), {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, offline: true, viewport: { width: 1280, height: 1000 },
    args: ['--disable-background-networking', '--no-first-run'],
});
try {
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => [...document.images].every(im => im.complete && im.naturalWidth > 0));
    assert.equal(await page.locator('article').count(), 7);
    assert.equal(await page.locator('.pair').count(), 16);
    for (const density of ['2', '4']) {
        await page.locator('#density').selectOption(density);
        for (const scale of ['1', '2', '4']) {
            await page.locator('#scale').selectOption(scale);
            await page.waitForFunction(() => [...document.querySelectorAll('.pair')].every(im =>
                im.complete && im.naturalWidth > 0 && im.width === Number(im.dataset.width) * Number(document.querySelector('#scale').value)));
        }
    }
    await page.locator('#scale').selectOption('1');
    await page.screenshot({ path: path.join(output, 'native-size.png') });
    await page.locator('#INIT details').evaluate(el => { el.open = true; });
    await page.locator('#INIT').screenshot({ path: path.join(output, 'INIT-detail.png') });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    const result = { status: 'PASS_OFFLINE_REPRESENTATIVE_REVIEW_UI', articles: 7, nativePairs: 16,
        densities: [2, 4], scales: [1, 2, 4], errors, external,
        disclosure: 'Offline preview only; no full-family animation, remap or runtime acceptance.' };
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(result.status);
} finally { await browser.close(); }
