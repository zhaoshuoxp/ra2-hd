// Isolated current-app integration and explicitly labeled frozen-frame fixtures.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('.artifacts/soviet-remaining');
const output = path.join(root, process.env.SOVIET_RUN ?? `native-builds-${Date.now()}`);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const inventory = JSON.parse(await fs.readFile(path.join(root, 'source-v1/inventory.json'), 'utf8'));
const report = { status: 'RUNNING', app: artifact.artifact, scope: 'Actual app activation and native update paths; spawned/frozen visual fixtures are labeled separately',
    errors: [], consoleErrors: [], families: {}, gameplayAcceptance: 'PENDING_USER' };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    report.defaultHd = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value);
    assert.equal(report.defaultHd, true);
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics; g.renderResolution.value = '4k';
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null])
        }).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    report.activation = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { families: d.sovietBuildingsHd, napowr: d.napowrHd, powerPlant: d.powerPlantHd,
            conscript: d.conscriptHd, rhino: d.rhinoHd, availability: d.generalOptions.graphics.hdAvailability,
            logical: [d.renderer.width, d.renderer.height], buffer: [d.renderer.renderer.domElement.width, d.renderer.renderer.domElement.height] };
    });
    await fs.writeFile(path.join(output, 'activation.json'), JSON.stringify(report.activation, null, 2));
    for (const id of Object.keys(inventory.families)) assert.equal(report.activation.families[id]?.density, 2, `${id}: whole-family activation failed`);
    const { exercise } = await import('./native-builds.mjs');
    report.native = await exercise(page, output);
    assert.deepEqual(report.errors, []);
    report.status = report.native.status;
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2)); await app.close(); }
console.log(output, report.status);
