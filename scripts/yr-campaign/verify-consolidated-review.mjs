import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const [htmlArg, outputArg] = process.argv.slice(2);
assert(htmlArg && outputArg, 'Usage: verify-consolidated-review.mjs REVIEW_HTML OUTPUT');
const htmlFile = path.resolve(htmlArg), out = path.resolve(outputArg);
await fs.mkdir(out, { recursive: false });
const bytes = await fs.readFile(htmlFile), manifest = JSON.parse(await fs.readFile(htmlFile.replace(/\.html$/, '.json')));
const sha = value => createHash('sha256').update(value).digest('hex');
const embedded = [...bytes.toString().matchAll(/src="data:image\/webp;base64,([^"]+)"/g)];
assert.equal(embedded.length, manifest.figures.length);
for (const [i, match] of embedded.entries()) {
    assert.equal(sha(Buffer.from(match[1], 'base64')), manifest.figures[i].embeddedSha256);
    assert.equal(manifest.figures[i].codec, 'WEBP_LOSSLESS_PIXEL_VERIFIED');
}
const report = { schema: 'yr-consolidated-review-native-proof-v1', status: 'RUNNING',
    html: htmlFile, htmlSha256: sha(bytes), images: embedded.length, errors: [], externalRequests: [], viewports: [] };
const main = path.join(out, 'review-main.cjs');
await fs.writeFile(main, `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
app.whenReady().then(() => { const window = new BrowserWindow({ width: 1440, height: 900,
webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
window.loadFile(${JSON.stringify(htmlFile)}); });`);
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        args: [main], cwd: '/private/tmp' });
    const page = await app.firstWindow({ timeout: 60000 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) report.externalRequests.push(request.url()); });
    await page.waitForFunction(count => document.images.length === count, embedded.length, { timeout: 90000 });
    await page.evaluate(() => { for (const image of document.images) image.loading = 'eager'; });
    await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0),
        undefined, { timeout: 90000 });
    const dimensions = await page.evaluate(() => [...document.images].map(image => [image.naturalWidth, image.naturalHeight]));
    assert.deepEqual(dimensions, manifest.figures.map(row => [row.width, row.height]));
    assert.equal(await page.locator('tbody tr').count(), 14);
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
        await page.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height, [width, height]);
        const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
            documentWidth: document.documentElement.scrollWidth, table: !!document.querySelector('table'),
            headings: [...document.querySelectorAll('h2')].map(node => node.textContent) }));
        assert(metrics.documentWidth <= metrics.width + 1);
        report.viewports.push(metrics);
        await page.screenshot({ path: path.join(out, `review-top-${width}x${height}.png`) });
    }
    const first = page.locator('figure').first();
    await first.locator('button').click();
    assert(await first.locator('img').evaluate(node => node.classList.contains('native-size')));
    await first.locator('button').click();
    await page.locator('table').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'review-mission-table.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.nativePixelToggle = true;
    report.status = 'PASS_OFFLINE_EMBEDDED_REVIEW_ALL_IMAGES_DIMENSIONS_TABLE_LAYOUT_AND_NATIVE_PIXEL_CONTROL';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await app?.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, images: report.images, error: report.error }));
