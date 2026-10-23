import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(process.argv[2] ?? '.artifacts/soviet-remaining/complete-review-v1');
const runtime = JSON.parse(await fs.readFile(path.resolve(process.argv[3] ?? '.artifacts/soviet-remaining/runtime-complete-v2/result.json'), 'utf8'));
const report = { status: 'RUNNING', errors: [], families: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1050 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.goto(pathToFileURL(path.join(root, 'Soviet-Buildings-Review.html')).href);
    await page.waitForFunction(count => window.__reviewSummary?.families === count, Object.keys(runtime.families).length);
    report.inventory = await page.evaluate(() => window.__reviewSummary);
    for (const id of await page.locator('.family').evaluateAll(cards => cards.map(c => c.id))) {
        const card = page.locator(`#${id}`);
        await card.scrollIntoViewIfNeeded();
        await card.locator('img.hd').evaluate(img => img.decode());
        assert.equal(await card.locator('img.hd').evaluate(img => img.getBoundingClientRect().width), 420);
        await card.locator('select').first().selectOption('damaged');
        await card.locator('img.hd').evaluate(img => img.decode());
        const motionIndex = runtime.families[id].sequences.findIndex(s => s.files.length > 1);
        await card.locator('select').first().selectOption(String(motionIndex));
        const before = await card.locator('img.hd').getAttribute('src');
        await card.locator('.next').click();
        await card.locator('img.hd').evaluate(img => img.decode());
        assert.notEqual(await card.locator('img.hd').getAttribute('src'), before);
        await card.locator('.play').click();
        await page.waitForTimeout(800);
        assert.equal(await card.locator('.play').textContent(), 'Pause');
        await card.locator('.play').click();
        report.families.push({ family: id, status: 'PASS_NATIVE_SIZE_STATE_STEPPING_PLAYBACK' });
    }
    await page.locator('#NANRCT select').first().selectOption('normal');
    await page.locator('#NANRCT').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'native-reactor-review.png') });
    await page.locator('#zoom').click();
    assert.equal(await page.locator('#NANRCT img.hd').evaluate(img => img.getBoundingClientRect().width), 840);
    await page.locator('#zoom').click();
    await page.setViewportSize({ width: 680, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(report.errors, []);
    // Verify every referenced media file, including images not yet decoded by the UI.
    let count = 0;
    for (const [id, family] of Object.entries(runtime.families)) {
        for (const file of [...family.samples.map(s => s.file), ...family.sequences.flatMap(s => s.files)]) {
            assert((await fs.stat(path.join(root, 'media', id, file))).size > 100); count++;
        }
    }
    report.mediaChecked = count; report.status = 'PASS_COMPLETE_PORTABLE_REVIEW';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(report, null, 2)); await browser.close(); }
console.log(report.status);
