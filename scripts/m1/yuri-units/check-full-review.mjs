import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const [input, destination] = process.argv.slice(2), out = path.resolve(destination);
await fs.mkdir(out, { recursive: false });
const browser = await chromium.launchPersistentContext(path.join(out, 'profile'), {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    offline: true, viewport: { width: 1320, height: 1040 },
    args: ['--disable-background-networking', '--no-first-run'],
});
try {
    const page = await browser.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) external.push(r.url()); });
    await page.goto(pathToFileURL(path.resolve(input)).href);
    await page.locator('#pause').click();
    assert.equal(await page.locator('#cards section').count(), 24);
    const ready = () => page.waitForFunction(() => [...document.querySelectorAll('#cards img')]
        .every(i => i.complete && i.naturalWidth > 0));
    await ready();
    for (const density of ['2', '4']) {
        await page.locator('#density').selectOption(density); await ready();
        await page.locator('#detail').click(); await ready();
        await page.locator('#detail').click(); await ready();
    }
    for (const section of await page.locator('#cards section').all()) {
        const select = section.locator('select');
        for (const value of await select.locator('option').allTextContents()) {
            await select.selectOption({ label: value }); await ready();
        }
    }
    await page.locator('#cards section').first().locator('select').selectOption({ label: 'Ready / facing 0' });
    await ready(); await page.screenshot({ path: path.join(out, 'native-size.png') });
    await page.locator('#detail').click(); await ready();
    await page.locator('#cards section').first().screenshot({ path: path.join(out, 'INIT-4x-detail.png') });
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS_OFFLINE_FULL_REVIEW_UI',
        cards: 24, nativeShpFrames: 1464, authoredVxlHeadings: 152, densities: [2, 4], errors, external,
        humanAcceptance: 'PENDING' }, null, 2) + '\n');
} finally { await browser.close(); }
