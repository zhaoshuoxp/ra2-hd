import fs from 'node:fs/promises';
import http from 'node:http';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const output = '.artifacts/m1-1';
await fs.mkdir(output, { recursive: true });
const bundle = await Bun.build({ entrypoints: ['scripts/m1/parity-fixture.ts'], target: 'browser', minify: false });
assert(bundle.success, bundle.logs.join('\n'));
const script = await bundle.outputs[0].text();
const server = http.createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>M1.1 GPU parity</title><script type="module" src="/fixture.js"></script>'); }
    else if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
    else { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const report = { status: 'FAIL', external: [], errors: [], consoleErrors: [] };
try {
    browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
    await page.route('**/*', route => {
        if (!route.request().url().startsWith(origin + '/')) { report.external.push(route.request().url()); return route.abort(); }
        return route.continue();
    });
    page.on('pageerror', e => report.errors.push(e.stack || e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.consoleErrors.push(m.text()); });
    await page.goto(origin);
    Object.assign(report, await page.evaluate(() => window.runParity()));
    report.browser = browser.version();
    assert.deepEqual(report.external, []);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.consoleErrors, []);
    console.log(JSON.stringify({ status: report.status, geometryCases: report.geometryCases, metrics: report.metrics }));
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; throw e; }
finally {
    await fs.writeFile(`${output}/gpu-parity.json`, JSON.stringify(report, null, 2) + '\n');
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
