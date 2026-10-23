import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const out = path.resolve('.artifacts/soviet-remaining/tile-gpu-v1');
await fs.mkdir(out, { recursive: true });
const routes = new Map([
    ['/', { body: '<html><body><script type="module" src="/probe.js"></script></body></html>', type: 'text/html' }],
    ['/probe.js', { body: await fs.readFile(path.join(out, 'hd-tile-gpu.js')), type: 'text/javascript' }],
]);
const fixtures = [];
for (const [pack, density, frame] of [
    ['soviet-power-plant-authored-body', 4, 0], ['soviet-power-plant-authored-active', 4, 21],
    ['soviet-power-plant-authored-buildup', 4, 12], ['soviet-nacnst-ngcnst-b-authored', 2, 6],
]) {
    const root = path.resolve('.local/hd-packs', pack, '2');
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
    const variant = manifest.variants.find(v => v.density === density);
    const entry = variant.frames.find(f => f.nativeFrame === frame), page = variant.pages.find(p => p.id === entry.page);
    const fixture = { name: `${pack}/${frame}`, density, rect: entry.sampleRect };
    for (const role of ['base', 'data']) {
        fixture[role] = `/${fixtures.length}-${role}.png`;
        routes.set(fixture[role], { body: await fs.readFile(path.join(root, page[role])), type: 'image/png' });
    }
    fixtures.push(fixture);
}
routes.set('/fixtures.json', { body: JSON.stringify(fixtures), type: 'application/json' });
const server = http.createServer((req, res) => {
    const route = routes.get(req.url);
    res.writeHead(route ? 200 : 404, { 'Content-Type': route?.type ?? 'text/plain' }); res.end(route?.body ?? 'Not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage(); const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.__tileResult, { timeout: 120000 });
    const result = await page.evaluate(() => window.__tileResult); result.pageErrors = pageErrors;
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result)); assert.equal(result.status, 'PASS_BYTE_EXACT_GPU_PARITY'); assert.deepEqual(pageErrors, []);
    assert.equal(result.remainingTextures, 2, 'Only the persistent palette and render target should remain');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
