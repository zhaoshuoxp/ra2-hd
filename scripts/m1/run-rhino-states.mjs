import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const origin = process.env.M13G_ORIGIN ?? 'http://127.0.0.1:4072';
const output = process.env.M13G_OUTPUT ?? `.artifacts/m1-3g/check-${Date.now()}`;
await fs.mkdir(output, { recursive: true });
const report = { status: 'FAIL', errors: [], consoleErrors: [], production: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.M13G_PLAY !== '1' || process.env.M13G_CONTROLS_CHECK === '1', args: ['--disable-background-networking', '--no-first-run'] });
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) {
            report.external.push(url);
            return route.abort();
        }
        if (process.env.M13G_MISSING && url.endsWith('/turret-315.mask'))
            return route.fulfill({ status: 404, body: 'Intentional missing member' });
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP23T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 0, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error')
        report.consoleErrors.push(m.text()); });
    await page.goto(`${origin}/?conscript-hd=4&power-plant-hd=4`);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        d.generalOptions.graphics.rhinoHd.value = true;
        d.skirmishLobby.startGame(1700000000000);
    });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    report.initial = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { rhino: d.rhinoHd, owned: d.localPlayer.getOwnedObjects().map(u => u.name), color: d.localPlayer.color,
            country: d.localPlayer.country, colors: [...d.game.rules.colors.values()] };
    });
    const check = process.env.M13G_SHADOW === '1'
        ? (await import('./check-rhino-shadow.mjs')).checkRhinoShadow
        : (await import('./check-rhino-states.mjs')).checkRhinoStates;
    report.checks = await check(page, output);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
}
catch (e) {
    report.failure = e.stack;
    console.error(e);
    process.exitCode = 1;
}
finally {
    await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    console.log('OUTPUT', output);
    await browser.close();
}
