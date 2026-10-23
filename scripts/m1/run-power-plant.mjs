import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { validateHdPack } from '../../desktop/profile.mjs';

const out = '.artifacts/m1-2';
const bindings = [], routes = new Map();
for (const [role, member, requiredFrames] of [['body', 'ggpowr.shp', 3], ['active', 'ggpowr_a.shp', 16], ['buildup', 'gtpowrmk.shp', 25]]) {
    const pack = await validateHdPack('.local', `power-plant-calibration-${role}`, '1');
    const files = {};
    for (const variant of pack.manifest.variants) for (const page of variant.pages) for (const channel of ['base', 'data'])
        files[page[channel]] = `/local-hd/${pack.sha256}/${variant.density}/${page.id}/${channel}.png`;
    bindings.push({ member, requiredFrames, sha256: pack.sha256, manifestRoute: `/local-hd/${pack.sha256}/manifest.json`, files });
    for (const [route, file] of pack.routes) routes.set(route, file);
    routes.set(`/source/${member}.json`, `${out}/source/${member}.json`);
}
const bundle = await Bun.build({ entrypoints: ['scripts/m1/power-plant-fixture.ts'], target: 'browser' });
assert(bundle.success, bundle.logs.join('\n'));
const script = await bundle.outputs[0].text();
const server = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>GAPOWR calibration</title><script type="module" src="/fixture.js"></script>'); }
        else if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(script); }
        else if (req.url === '/bindings.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(bindings)); }
        else if (routes.has(req.url)) {
            res.setHeader('Content-Type', req.url.endsWith('.png') ? 'image/png' : 'application/json'); res.end(await fs.readFile(routes.get(req.url)));
        } else { res.writeHead(404); res.end(); }
    } catch { res.writeHead(500); res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { status: 'FAIL', errors: [], external: [], consoleErrors: [] };
try {
    browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });
    await page.route('**/*', route => {
        if (!route.request().url().startsWith(origin + '/')) { report.external.push(route.request().url()); return route.abort(); }
        return route.continue();
    });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.consoleErrors.push(m.text()); });
    await page.goto(origin); await page.waitForFunction(() => window.runPowerPlant);
    Object.assign(report, await page.evaluate(() => window.runPowerPlant()));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); assert.deepEqual(report.consoleErrors, []);
    assert.equal(report.disposal.geometries, 0); assert.equal(report.disposal.materials, 0);
    console.log(JSON.stringify(report));
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally {
    await fs.writeFile(`${out}/calibration-render.json`, JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); await new Promise(resolve => server.close(resolve));
}
