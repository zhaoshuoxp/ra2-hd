// Fresh desktop-runtime outcome and restart evidence. No forced result or duration target.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.env.M03_OUTPUT ?? '.artifacts/m0-3/play');
fs.mkdirSync(output, { recursive: true });
const userData = path.join(output, 'user-data');
const result = { source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), errors: [], consoleErrors: [], samples: [],
    fixture: { map: 'MP01T4.map', seed: 1700000000000, speed: 3, units: 10, credits: 10000,
        human: 'Americans, start 0, team 0', bots: '3 Normal Libya, starts 1/2/3, team 1', schedule: 'Normal MCV deploy; no scripted defense; manual orders permitted and distinguished' } };
const save = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
const launch = () => electron.launch({ args: ['desktop/main.mjs'], env: { ...process.env, RA2_DESKTOP_USER_DATA: userData }, timeout: 60000 });
let app = await launch();
try {
    let page = await app.firstWindow();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '0', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: i, s: i, t: 1 })), null, null, null, null]) };
        for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
    });
    await page.reload();
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m03Game = d.game; window.__m03Inputs = [];
        d.game.onEnd.subscribe(() => { window.__m03End = { tick: d.game.currentTick, now: performance.now() }; });
        for (const type of ['pointerlockchange', 'pointerlockerror', 'pointerdown', 'keydown']) document.addEventListener(type, e => {
            window.__m03Inputs.push({ type, time: performance.now(), trusted: e.isTrusted, key: e.key,
                locked: !!document.pointerLockElement, focused: document.hasFocus(), visible: document.visibilityState });
        });
        d.generalOptions.graphics.shadows.value = 3;
    });
    await page.screenshot({ path: path.join(output, 'initial.png') });
    result.initial = await page.evaluate(() => {
        const d = window.__ra2debug, c = d.worldScene.camera;
        return { origin: location.origin, secure: isSecureContext, graphics: d.generalOptions.graphics.serialize(),
            camera: { type: c.type, zoom: c.zoom, rotation: c.rotation.toArray() }, assetDensity: window.__m01.assetDensity,
            viewport: d.worldScene.viewport, dpr: devicePixelRatio, archives: window.__m01.archives };
    });
    const labels = await page.evaluate(() => ({
        continue: window.__ra2debug.gameScreen.strings.get('GUI:Continue'),
        back: window.__ra2debug.gameScreen.strings.get('GUI:Back'),
    }));
    await page.waitForTimeout(20000);
    result.deploy = await page.evaluate(() => {
        const d = window.__ra2debug;
        if (!d.localPlayer.getOwnedObjects().some(o => o.name === 'AMCV')) return 'No MCV remains; no scripted deploy issued';
        d.helpers.selectOwnedUnitByName('AMCV'); d.helpers.deploySelectedUnits();
        return 'Normal deploy issued for existing MCV';
    });
    result.started = Date.now(); save(); console.log('Desktop match running; natural result observer active.');
    // A generous diagnostic ceiling prevents an abandoned test process; it is not an acceptance duration.
    while (Date.now() - result.started < 1200000) {
        const state = await page.evaluate(() => ({ tick: window.__m03Game.currentTick, status: window.__m03Game.status,
            end: window.__m03End, failure: window.__m01Failure, attempts: window.__offlineAttempts,
            players: window.__m03Game.getNonNeutralPlayers().map(p => ({ ai: p.isAi, defeated: p.defeated, built: p.getUnitsBuilt(), lost: p.getUnitsLost(), kills: p.getUnitsKilled() })) }));
        state.elapsedMs = Date.now() - result.started; result.samples.push(state); save();
        if (state.end) break;
        if (state.failure || result.errors.length || (result.samples.length > 4 && state.tick === result.samples.at(-4).tick)) throw new Error('Desktop runtime failure or stalled simulation');
        await page.waitForTimeout(2000);
    }
    assert.ok(result.samples.at(-1).end, 'No natural result observed');
    await page.getByText(labels.continue, { exact: true }).waitFor({ timeout: 30000 });
    result.outcomeText = await page.locator('body').innerText();
    result.inputs = await page.evaluate(() => window.__m03Inputs);
    await page.screenshot({ path: path.join(output, 'results.png') });
    result.phase = 'results Continue'; save();
    await page.getByText(labels.continue, { exact: true }).click();
    result.afterContinueText = await page.locator('body').innerText(); save();
    await page.locator('input[name="gameSpeed"]').waitFor({ timeout: 30000 });
    result.returnedToLobby = true;
    result.phase = 'lobby Back'; save();
    await page.getByText(labels.back, { exact: true }).click();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 30000 });
    result.returnedToMenu = true;
    result.savedSettings = await page.evaluate(() => ({ map: localStorage.getItem('_r_lastMap'), opts: localStorage.getItem('_r_hostOpts') }));
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    result.secondMatchStarted = true;
    await app.close();
    fs.copyFileSync(path.join(userData, 'last-session.json'), path.join(output, 'game-session.json'));
    const registration = fs.readFileSync(path.join(userData, 'resource-registration.json'), 'utf8');
    app = await launch(); page = await app.firstWindow();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    result.restartedSettings = await page.evaluate(() => ({ map: localStorage.getItem('_r_lastMap'), opts: localStorage.getItem('_r_hostOpts') }));
    assert.deepEqual(result.restartedSettings, result.savedSettings);
    assert.equal(fs.readFileSync(path.join(userData, 'resource-registration.json'), 'utf8'), registration);
    result.registrationPreserved = true; result.status = 'PASS';
} catch (e) {
    result.status = 'FAIL'; result.error = e.stack;
    const page = await app.firstWindow().catch(() => undefined);
    if (page) {
        result.failureText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => undefined);
        await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 3000 }).catch(() => {});
    }
}
finally { save(); await app.close(); }
console.log(JSON.stringify({ status: result.status, error: result.error, duration: result.samples.at(-1)?.elapsedMs, returnedToMenu: result.returnedToMenu, secondMatchStarted: result.secondMatchStarted }));
