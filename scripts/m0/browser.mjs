import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const executablePath = process.env.M01_BROWSER_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await context.tracing.start({ screenshots: true, snapshots: true });
fs.mkdirSync('.artifacts/compat', { recursive: true });
const evidence = { status: 'PASS', freshStorage: true, requests: [], externalAttempts: [], console: [], errors: [], websocketAttempts: [], workers: [] };
await context.route('**/*', route => {
    const url = route.request().url();
    evidence.requests.push(url);
    if (!url.startsWith('http://127.0.0.1:4000/') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        evidence.externalAttempts.push(url); return route.abort();
    }
    return route.continue();
});
const page = await context.newPage();
page.on('console', msg => evidence.console.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', err => evidence.errors.push(err.message));
page.on('worker', worker => evidence.workers.push(worker.url()));
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
cdp.on('Network.webSocketCreated', info => evidence.websocketAttempts.push(info.url));
async function capture(name) {
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ state: 'visible', timeout: 45000 });
    await page.screenshot({ path: `.artifacts/compat/${name}.png` });
    return page.evaluate(() => ({ validation: window.__m01, attempts: window.__offlineAttempts,
        failure: window.__m01Failure, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        body: document.body.innerText }));
}
try {
    await page.goto('http://127.0.0.1:4000/');
    evidence.first = await capture('offline-start');
    await page.reload();
    evidence.restart = await capture('offline-restart');
    assert.equal(evidence.first.failure, undefined);
    assert.deepEqual(evidence.first.validation.compatibility.additions, ['General.ParadropPlane']);
    assert.equal(evidence.restart.failure, evidence.first.failure);
    assert.deepEqual(evidence.first.validation.validation.resources, evidence.restart.validation.validation.resources);
    assert.equal(evidence.externalAttempts.length, 0);
    assert.equal(evidence.first.attempts.length, 0);
    assert.equal(evidence.restart.attempts.length, 0);
    assert.equal(evidence.websocketAttempts.length, 0);
    assert.deepEqual(evidence.errors, []);
    assert.deepEqual(evidence.workers, []);
    evidence.routeChecks = [];
    for (const [pathname, expected] of [
        ['/local-assets/ra2md.mix', 404], ['/local-support/ini.mix', 404],
        ['/.local/ra2-core-manifest.json', 403], ['/%2elocal/ra2-core-manifest.json', 403],
        ['/@fs/private/etc/hosts', 403], ['/.git/config', 403],
    ]) {
        const response = await context.request.get(`http://127.0.0.1:4000${pathname}`);
        evidence.routeChecks.push({ pathname, status: response.status() });
        assert.equal(response.status(), expected);
    }
    const manifest = await (await context.request.get('http://127.0.0.1:4000/local-assets/manifest.json')).json();
    assert.equal(manifest.files.length, 3);
    assert.equal(JSON.stringify(manifest).includes('sourcePath'), false);
    assert.equal(JSON.stringify(manifest).includes('destination'), false);
    evidence.diagnosticChecks = 'PASS: offline main menu, isolated VFS reload, compatibility adapter and network boundary verified';
    console.log(JSON.stringify({ diagnosticChecks: evidence.diagnosticChecks, blocker: evidence.first.failure,
        externalAttempts: evidence.externalAttempts, viewport: evidence.first.viewport }, null, 2));
} catch (error) {
    evidence.status = 'FAIL';
    evidence.error = error.stack;
    throw error;
} finally {
    fs.writeFileSync('.artifacts/compat/smoke.json', JSON.stringify(evidence, null, 2));
    await context.tracing.stop({ path: '.artifacts/compat/smoke-trace.zip' });
    await browser.close();
}
