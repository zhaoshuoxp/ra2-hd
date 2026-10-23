import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { validateHdPack } from '../../desktop/profile.mjs';
const output = '.artifacts/m1-1';
const pack = await validateHdPack('.local', 'conscript-calibration', '1');
const files = {};
for (const v of pack.manifest.variants) for (const p of v.pages) for (const role of ['base', 'data'])
    files[p[role]] = `/local-hd/${pack.sha256}/${v.density}/${p.id}/${role}.png`;
const binding = { sha256: pack.sha256, manifestRoute: `/local-hd/${pack.sha256}/manifest.json`, files };
const bundle = await Bun.build({ entrypoints: ['scripts/m1/conscript-fixture.ts'], target: 'browser' });
assert(bundle.success, bundle.logs.join('\n'));
const script = await bundle.outputs[0].text();
const html = `<!doctype html><meta charset="utf-8"><title>M1.1 Conscript Prototype</title>
<style>body{background:#141b18;color:#e8ede9;font:20px/1.5 system-ui;margin:24px auto;max-width:960px}h1{font-size:30px}select,input{font:inherit;margin:12px}#labels{display:flex;justify-content:space-around}canvas{display:block}</style>
<h1>M1.1 · Conscript rendering prototype</h1><p>Complete animation calibration. New HD artwork is pending.</p>
<div id="controls">Animation / facing</div><div id="labels"><span>Original · red team</span><span>2× calibration · blue team</span></div>
<div id="canvas"></div><p id="status">Loading local assets…</p><script type="module" src="/fixture.js"></script>`;
const server = http.createServer(async (request, response) => {
    try {
        if (request.url === '/' || request.url === '/?original-only') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
        else if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
        else if (request.url === '/binding.json') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(binding)); }
        else if (request.url === '/source.json') { response.setHeader('Content-Type', 'application/json'); response.end(await fs.readFile(`${output}/conscript-source.json`)); }
        else if (pack.routes.has(request.url)) {
            response.setHeader('Content-Type', request.url.endsWith('.png') ? 'image/png' : 'application/json');
            response.end(await fs.readFile(pack.routes.get(request.url)));
        } else { response.statusCode = 404; response.end(); }
    } catch { response.statusCode = 500; response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes('--serve')) {
    console.log(`Conscript diagnostic: ${origin}`);
} else {
    let browser;
    const report = { status: 'FAIL', external: [], errors: [], consoleErrors: [] };
    try {
        browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
        const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 2 });
        await page.route('**/*', route => {
            if (!route.request().url().startsWith(origin + '/')) { report.external.push(route.request().url()); return route.abort(); }
            return route.continue();
        });
        page.on('pageerror', e => report.errors.push(e.stack || e.message));
        page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.consoleErrors.push(m.text()); });
        await page.goto(origin + '/?original-only');
        await page.waitForFunction(() => window.conscriptReady || window.conscriptError);
        const baselineError = await page.evaluate(() => window.conscriptError); assert(!baselineError, baselineError);
        report.baseline = await page.evaluate(async () => ({ render: await window.acceptConscript(), disposal: window.disposeConscript() }));
        await page.goto(origin);
        await page.waitForFunction(() => window.conscriptReady || window.conscriptError, { timeout: 30000 });
        const error = await page.evaluate(() => window.conscriptError); assert(!error, error);
        Object.assign(report, await page.evaluate(() => window.acceptConscript()));
        await page.screenshot({ path: `${output}/conscript-calibration.png` });
        report.disposal = await page.evaluate(() => window.disposeConscript());
        assert.equal(report.disposal.textures, report.baseline.disposal.textures); assert(report.disposal.hdTexturesReleased); assert.equal(report.disposal.geometries, 0); assert.equal(report.disposal.materials, 0);
        assert.deepEqual(report.external, []); assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []);
        console.log(JSON.stringify(report));
    } catch (e) { report.status = 'FAIL'; report.failure = e.stack; throw e; }
    finally {
        await fs.writeFile(`${output}/conscript-render.json`, JSON.stringify(report, null, 2) + '\n');
        await browser?.close(); await new Promise(resolve => server.close(resolve));
    }
}
