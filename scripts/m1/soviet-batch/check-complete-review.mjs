import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const out = path.resolve(process.argv[2] ?? '.artifacts/m1-6b/complete-review-v1');
const result = { status: 'FAIL', errors: [], external: [], views: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    for (const width of [1440, 600]) {
        const context = await browser.newContext({ viewport: { width, height: 1050 }, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', e => result.errors.push(e.message));
        page.on('request', r => { if (/^https?:/.test(r.url())) result.external.push(r.url()); });
        await page.goto(pathToFileURL(path.join(out, 'review.html')).href, { timeout: 90000 });
        await page.locator('#families button').first().waitFor();
        await page.locator('#play').click();
        const families = await page.locator('#families button').evaluateAll(bs => bs.map(b => b.dataset.family));
        const view = { width, families: [], controls: 'PASS', sceneCss: [340, 260] };
        for (const family of families) {
            await page.locator(`[data-family="${family}"]`).click();
            const groups = await page.locator('#sequence option').evaluateAll(os => os.map(o => ({ value: o.value, name: o.textContent })));
            let frames = 0;
            for (const group of groups) {
                await page.selectOption('#sequence', group.value);
                const max = Number(await page.locator('#frame').getAttribute('max'));
                for (let i = 0; i <= max; i++) {
                    await page.locator('#frame').fill(String(i));
                    await page.locator('#original, #hd').evaluateAll(async imgs => Promise.all(imgs.map(im => im.decode())));
                    assert.equal(await page.locator('#position').textContent(), `Frame ${i + 1} / ${max + 1}`);
                    frames++;
                }
                if (max > 0) {
                    await page.locator('#next').click();
                    assert.equal(await page.locator('#frame').inputValue(), '0');
                    await page.locator('#previous').click();
                    assert.equal(await page.locator('#frame').inputValue(), String(max));
                    await page.selectOption('#speed', '0.25');
                    await page.locator('#play').click();
                    await page.waitForFunction(last => document.querySelector('#frame').value !== last, String(max));
                    await page.locator('#play').click();
                }
            }
            const images = await page.locator('.panels img').evaluateAll(async imgs => {
                await Promise.all(imgs.map(im => im.decode()));
                return imgs.map(im => ({ ready: im.complete && im.naturalWidth > 0, width: im.width, height: im.height }));
            });
            assert.equal(images.length, 6);
            assert(images.every(im => im.ready && im.width === 340 && im.height === 260));
            view.families.push({ family, groups: groups.length, frames });
        }
        await page.selectOption('#sequence', '4');
        await page.locator('#frame').fill('6');
        await page.locator('#original, #hd').evaluateAll(async imgs => Promise.all(imgs.map(im => im.decode())));
        await page.screenshot({ path: path.join(out, `browser-${width}.png`) });
        result.views.push(view);
        await context.close();
    }
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.external, []);
    result.status = 'PASS_COMPLETE_INTERACTIVE_REVIEW';
} finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'browser-check.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(result.status);
