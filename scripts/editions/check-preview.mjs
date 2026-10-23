import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const dir = path.resolve('.artifacts/editions/selection-preview');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const report = { status: 'RUNNING', errors: [], screens: [] };
try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    page.on('pageerror', e => report.errors.push(e.message));
    for (const [width, height] of [[1920,1080],[1920,1200],[1512,982],[1280,832],[1024,768],[390,844]]) {
        await page.setViewportSize({ width, height });
        await page.goto(pathToFileURL(path.join(dir, 'review.html')).href);
        await page.locator('img').first().waitFor();
        const bounds = await page.locator('button').evaluateAll(buttons => buttons.map(b => {
            const r = b.getBoundingClientRect(), image = b.querySelector('img');
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, loaded: image.complete && image.naturalWidth > 0, fit: getComputedStyle(image).objectFit };
        }));
        assert.equal(bounds.length, 2);
        assert(bounds.every(b => b.x >= 0 && b.y >= 0 && b.right <= width && b.bottom <= height && b.loaded && b.fit === 'contain'));
        await page.screenshot({ path: path.join(dir, `${width}x${height}.png`) });
        await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
        assert.equal(await page.locator('[data-edition="ra2"]').getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Tab'); await page.keyboard.press('Space');
        assert.equal(await page.locator('[data-edition="yr"]').getAttribute('aria-pressed'), 'true');
        await page.locator('[data-edition="ra2"]').click();
        assert.equal(await page.locator('[data-edition="ra2"]').getAttribute('aria-pressed'), 'true');
        report.screens.push({ width, height, bounds });
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_INTERFACE_PREVIEW_ONLY';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally { await browser.close(); await fs.writeFile(path.join(dir, 'result.json'), JSON.stringify(report, null, 2)); console.log(report.status); }
