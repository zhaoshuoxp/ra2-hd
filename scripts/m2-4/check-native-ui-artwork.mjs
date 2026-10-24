import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const root = path.resolve(process.argv[2]), repo = process.cwd();
const out = path.join(root, process.argv.find(arg => arg.startsWith('--name='))?.slice(7) ?? 'ui-artwork-preview');
await fs.mkdir(out, { recursive: false });
const selection = JSON.parse(await fs.readFile('.local/ui-selection.json', 'utf8'));
const uiRoot = path.resolve('.local/ui-packs', selection.revision);
const html = '<!doctype html><html><head><link rel="stylesheet" href="/res/fonts/fonts.css"><link rel="stylesheet" href="/css/main-legacy.css"></head><body style="margin:0;background:black"><div id="ra2web-root" style="width:1280px;height:720px"></div><script type="module" src="/preview.js"></script></body></html>';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost').pathname;
        let file;
        if (url === '/') { response.end(html); return; }
        if (url === '/preview.js') file = path.join(root, 'ui-preview.js');
        else if (url === '/local-ui/selection.json') file = path.join(uiRoot, 'manifest.json');
        else if (url.startsWith('/local-ui/' + selection.revision + '/')) file = path.join(uiRoot, path.basename(url));
        else if (url.startsWith('/originals/')) file = path.join(root, 'original-edition-ui-palettes', path.basename(url));
        else file = path.join(repo, 'public', url);
        if (![root, uiRoot, path.join(repo, 'public')].some(parent => file.startsWith(parent + path.sep))) throw Error('Invalid path');
        response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
        response.end(await fs.readFile(file));
    } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const report = { status: 'RUNNING', errors: [], cases: [], disclosure: 'Headless Chromium component and artwork checks; separate from native Mac gameplay.' };
page.on('pageerror', error => report.errors.push(String(error.stack)));
try {
    for (const edition of ['ra2', 'yr']) {
        await page.goto(`http://127.0.0.1:${server.address().port}/?edition=${edition}`);
        await page.waitForFunction(() => window.uiArt?.enabled, undefined, { timeout: 30000 });
        const countries = ['Americans', 'French', 'Germans', 'British', 'Russians', 'Confederation', 'Africans', 'Arabs', 'Alliance',
            ...(edition === 'yr' ? ['YuriCountry'] : [])];
        for (const country of countries) {
            await page.evaluate(country => window.renderPreview(country, true), country);
            await page.waitForFunction(() => document.querySelector('canvas[data-loading-backdrop]')?.dataset.loadingSource === 'hd' &&
                document.querySelector('canvas[data-native-ui-backdrop]')?.dataset.backdropSource === 'hd', undefined, { timeout: 30000 });
            await page.waitForTimeout(100);
            const metrics = await page.evaluate(() => window.uiArt.metrics());
            assert(metrics.reservedBytes + metrics.resultHeadroomBytes <= metrics.budget);
            const presentation = await page.evaluate(() => {
                const canvas = document.querySelector('canvas[data-loading-backdrop]');
                return { width: canvas.width, height: canvas.height, logicalWidth: parseFloat(canvas.style.width),
                    source: canvas.dataset.loadingSource, artId: canvas.dataset.loadingArtId };
            });
            assert(presentation.width / presentation.logicalWidth > 1.8, 'HD loading must retain its intended canvas density');
            const image = `${edition}-${country}.png`;
            await page.screenshot({ path: path.join(out, image) });
            if (['Americans', 'Russians', 'YuriCountry'].includes(country)) {
                await page.evaluate(country => window.renderPreview(country, false), country);
                await page.waitForFunction(() => document.querySelector('canvas[data-loading-backdrop]')?.dataset.loadingSource === 'hd');
                await page.screenshot({ path: path.join(out, `${edition}-${country}-loading.png`) });
            }
            report.cases.push({ edition, country, metrics, presentation, image });
            await page.evaluate(() => window.clearPreview());
            assert.equal(await page.evaluate(() => window.uiArt.metrics().reservedBytes), 0, 'Every displayed surface must release its lease');
        }
        await page.evaluate(() => window.renderPreview('Americans', true, true));
        await page.waitForFunction(() => document.querySelector('canvas[data-loading-backdrop]')?.dataset.loadingSource === 'original');
        await page.screenshot({ path: path.join(out, `${edition}-original.png`) });
        await page.evaluate(() => window.clearPreview());
        assert.equal(await page.evaluate(() => window.uiArt.metrics().reservedBytes), 0);
        const missing = `**/loading-map-${edition}-americans.json`;
        await page.route(missing, route => route.abort());
        await page.evaluate(() => window.renderPreview('Americans'));
        await page.waitForTimeout(500);
        assert.equal(await page.locator('canvas[data-loading-backdrop]').getAttribute('data-loading-source'), 'original');
        await page.screenshot({ path: path.join(out, `${edition}-missing-map-original-fallback.png`) });
        await page.evaluate(() => window.clearPreview());
        assert.equal(await page.evaluate(() => window.uiArt.metrics().reservedBytes), 0);
        await page.unroute(missing);
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_19_EDITION_COUNTRY_HD_AND_ORIGINAL_RELEASE_CHECKS';
} catch (error) { report.status = 'FAIL'; report.failure = String(error.stack); process.exitCode = 1; }
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close(); await new Promise(resolve => server.close(resolve));
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, errors: report.errors, failure: report.failure }));
