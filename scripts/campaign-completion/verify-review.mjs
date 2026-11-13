import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const [reviewArg, outputArg, configArg] = process.argv.slice(2);
const review = path.resolve(reviewArg), out = path.resolve(outputArg);
const config = JSON.parse(await fs.readFile(path.resolve(configArg)));
const root = path.resolve(import.meta.dirname, '../..');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', review, errors: [], externalRequests: [], images: [] };
let browser, page;
try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    await page.goto(pathToFileURL(review).href, { timeout: 90000, waitUntil: 'load' });
    if (config.navigation) {
        report.navigation = await page.locator('nav a').evaluateAll(links => links.map(link => ({
            text: link.textContent, target: link.hash.slice(1), exists: !!document.getElementById(link.hash.slice(1)),
        })));
        assert.equal(report.navigation.length, new Set(config.figures.map(figure => figure[3]).filter(Boolean)).size);
        assert(report.navigation.every(link => link.exists));
        for (const index of [0, report.navigation.length - 1]) {
            await page.locator('nav a').nth(index).click();
            assert(await page.locator('#' + report.navigation[index].target).evaluate(node =>
                Math.abs(node.getBoundingClientRect().top) < 4));
        }
        await page.evaluate(() => scrollTo(0, 0));
    }
    report.images = await page.locator('figure img').evaluateAll(async images => {
        await Promise.all(images.map(async image => { image.loading = 'eager'; await image.decode(); }));
        return images.map(image => ({ width: image.naturalWidth, height: image.naturalHeight,
            embedded: image.src.startsWith('data:image/') }));
    });
    assert.equal(report.images.length, config.figures.length);
    for (const [index, figure] of config.figures.entries()) {
        const source = path.resolve(root, config.sourceRoot ?? '.artifacts/campaign-completion', figure[1]);
        const image = PNG.sync.read(await fs.readFile(source));
        assert.deepEqual(report.images[index], { width: image.width, height: image.height, embedded: true });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('figure button').first().click();
    assert(await page.locator('figure img').first().evaluate(image => image.classList.contains('native-size')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('figure button').first().click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, 'review-first-screen.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.status = 'PASS_SELF_CONTAINED_REVIEW_IMAGES_AND_NATIVE_PIXEL_TOGGLE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await browser?.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, images: report.images.length, error: report.error }));
