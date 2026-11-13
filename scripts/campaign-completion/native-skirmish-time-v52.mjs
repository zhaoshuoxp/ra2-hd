import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const edition = process.argv.includes('--yr') ? 'yr' : 'ra2';
const mapOverride = process.argv.find(argument => argument.startsWith('--map='))?.slice(6);
const packaged = process.argv.find(a => a.startsWith('--app='))?.slice(6);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
if (!packaged) await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-${edition}-zh-CN.json`))).labels,
    ...JSON.parse(await fs.readFile(path.join(root, 'public/res/locale/zh-CN.json'))) };
const report = { status: 'RUNNING', edition, errors: [], failedResources: [],
    scope: 'Real-time skirmish at two nonidentical speeds, ordinary menu pause/save, full application quit/restart, exact restored world/hash/RNG/time, continued physical play and ordinary public Abort score. No accelerated simulation, trainer effects or forced victory.' };
let app, page;
async function launch() {
    app = await electron.launch({ executablePath: packaged ? path.join(packaged, 'Contents/MacOS/RA2 HD Editions')
        : await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: packaged ? [] : [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    app.process().stderr.on('data', b => { void fs.appendFile(path.join(out, 'electron.log'), b); });
    page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('response', r => { if (r.status() >= 400) report.failedResources.push([r.url(), r.status()]); });
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const raf = window.requestAnimationFrame;
        window.__freezeNextGame = true;
        window.requestAnimationFrame = function(callback) {
            const s = window.__ra2debug?.gameScreen;
            if (window.__freezeNextGame && s?.gameAnimationLoop && s?.gameTurnMgr) {
                window.__freezeNextGame = false; s.gameTurnMgr.setPaused(true); s.gameAnimationLoop.stop(); return 0;
            }
            return raf.call(window, callback);
        };
    });
}
async function freeze() {
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.gameScreen?.playerUi && !window.__freezeNextGame, undefined, { timeout: 180000 });
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen;
        s.gameTurnMgr.setPaused(true); s.gameAnimationLoop.stop(); s.uiAnimationLoop.start(); s.pointer.unlock(true); });
}
async function state() {
    return page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), world: g.debugGetState(),
            physicalMs: g.playTime.elapsedMs, simulationMs: g.currentTime,
            speed: window.__ra2debug.gameScreen.pausedAtSpeed ?? g.speed.value }; });
}
async function play(ms, speed) {
    return page.evaluate(async ({ ms, speed }) => {
        const s = window.__ra2debug.gameScreen, g = window.__ra2debug.game;
        if (speed) g.desiredSpeed.value = speed;
        s.gameTurnMgr.setPaused(false); s.gameAnimationLoop.start();
        await new Promise(resolve => setTimeout(resolve, 80));
        const start = performance.now(), measured = g.playTime.elapsedMs, tick = g.currentTick;
        await new Promise(resolve => setTimeout(resolve, ms));
        s.gameTurnMgr.setPaused(true);
        return { wallMs: performance.now() - start, measuredMs: g.playTime.elapsedMs - measured,
            ticks: g.currentTick - tick, speed: g.speed.value };
    }, { ms, speed });
}
try {
    await launch();
    await page.evaluate(({ edition, mapOverride }) => {
        const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true; d.generalOptions.graphics.hdDensity.value = 2;
        const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        Object.entries({ _r_lastMap: mapOverride ?? (edition === 'yr' ? 'xmp03t4.map' : 'mp03t4.map'), _r_lastMode: '1',
            _r_lastCountry: '0', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;0;1;1;0;1;1;;0;1;0;0', _r_lastBots: JSON.stringify(bots) })
            .forEach(([k, v]) => localStorage.setItem(`_edition:${edition}:${k}`, v));
    }, { edition, mapOverride });
    await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await freeze();
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    assert(report.terrain?.groups.length && report.terrain.groups.every(group => group.status === 'PUBLISHED'));
    report.slow = await play(2200, 1.5);
    report.beforePause = await state();
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.waitForTimeout(2000); report.afterPause = await state();
    assert.deepEqual(report.afterPause, report.beforePause);
    await page.getByRole('button', { name: labels['gui:resumemission'], exact: true }).click();
    report.fast = await play(2200, 6);
    assert(report.fast.ticks > report.slow.ticks * 2, 'Different speeds must advance different simulation durations');
    for (const run of [report.slow, report.fast]) assert(Math.abs(run.measuredMs - run.wallMs) < 80);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['hd:savegame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor(); report.saved = await state();
    await page.getByTestId('skirmish-saves').locator('input').fill('Physical play time v52');
    await page.locator('[data-action=SaveGame]').click(); await page.locator('[data-action=AcknowledgeSave]').waitFor();
    await page.screenshot({ path: path.join(out, 'saved-paused.png') });
    await app.close(); app = undefined;
    await launch();
    await page.getByRole('button', { name: labels['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor(); await page.locator('[data-action=LoadGame]').click();
    await freeze(); report.restored = await state();
    assert.deepEqual(report.restored, report.saved, 'World, tick, RNG, speed and measured time must survive process restart');
    await page.waitForTimeout(1300); assert.deepEqual(await state(), report.restored);
    report.continued = await play(1400, 3);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    report.finished = await state();
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-score-play-time]', { timeout: 90000 });
    report.score = await page.locator('[data-score-play-time]').innerText();
    const seconds = Math.floor(report.finished.physicalMs / 1000), h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60;
    const time = [String(h), ...[m, seconds % 60].map(n => String(n).padStart(2, '0'))].join(':');
    assert(report.score.endsWith(time), `${report.score} != ${time}`);
    assert(Math.abs(report.finished.simulationMs - report.finished.physicalMs) > 5000);
    await page.screenshot({ path: path.join(out, 'physical-time-score.png') });
    await page.waitForTimeout(1400); assert.equal(await page.locator('[data-score-play-time]').innerText(), report.score);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_PHYSICAL_TIME_PAUSE_SPEED_PROCESS_RESTART_AND_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
