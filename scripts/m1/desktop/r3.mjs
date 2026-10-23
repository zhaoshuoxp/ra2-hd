import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2]));
const baseline = process.argv.includes('--baseline');
const output = path.resolve(`.artifacts/m1-5/r3-${baseline ? 'baseline' : 'native'}-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', errors: [], consoleErrors: [], logs: [] };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 });
let page;
try {
    page = await app.firstWindow(); page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text());
        if (/Viewport changed|updateViewportSize|Rerendering|Showing sidebar|Hiding sidebar/.test(m.text())) result.logs.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.getByText('Options', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Display resolution' }).waitFor();
    await page.evaluate(() => {
        const d = window.__ra2debug, screen = d.mainMenuController.getCurrentScreen();
        window.__r3Screen = screen; window.__r3Counts = { enter: 0, leave: 0 };
        for (const [method, key] of [['onEnter', 'enter'], ['onLeave', 'leave']]) {
            const original = screen[method]; screen[method] = function(...args) { window.__r3Counts[key]++; return original.apply(this, args); };
        }
    });
    await page.getByRole('combobox', { name: 'Display resolution' }).selectOption('fullscreen');
    await page.waitForTimeout(2000);
    result.firstFullscreen = await page.evaluate(async () => ({ ...await window.desktopDisplay.get(), counts: { ...window.__r3Counts } }));
    await page.evaluate(n => { for (let i = 0; i < n; i++) { window.dispatchEvent(new Event('resize')); window.visualViewport.dispatchEvent(new Event('resize')); } }, baseline ? 3 : 100);
    await page.waitForTimeout(8000);
    result.stability = await page.evaluate(() => ({ counts: window.__r3Counts,
        sameScreen: window.__r3Screen === window.__ra2debug.mainMenuController.getCurrentScreen(),
        sidebarPending: window.__ra2debug.mainMenu.sidebarNeedsRefresh }));
    await page.screenshot({ path: path.join(output, 'fullscreen-options.png') });
    if (baseline) { result.status = 'BASELINE_RECORDED'; }
    else {
        assert.equal(result.firstFullscreen.id, 'fullscreen');
        assert.deepEqual(result.stability.counts, { enter: 0, leave: 0 });
        assert.equal(result.stability.sidebarPending, false);
        const backLabel = await page.evaluate(() => window.__r3Screen.strings.get('GUI:Back'));
        await page.getByText(backLabel, { exact: true }).click();
        await page.getByText('Offline Skirmish', { exact: true }).waitFor();
        await page.evaluate(() => {
            const d = window.__ra2debug; for (const k of ['conscriptHd', 'powerPlantHd', 'rhinoHd']) d.generalOptions.graphics[k].value = true;
            const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
            Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
        });
        await page.getByText('Offline Skirmish', { exact: true }).click();
        const speed = page.getByRole('slider', { name: 'Game speed' });
        await speed.waitFor();
        result.lobbySpeed = await speed.evaluate(e => ({ min: e.min, max: e.max, value: e.value }));
        assert.deepEqual(result.lobbySpeed, { min: '0', max: '4', value: '2' });
        await speed.fill('4');
        assert.equal(await page.evaluate(() => localStorage.getItem('soloSpeedTierV1')), '4');
        assert.equal(await page.evaluate(() => localStorage.getItem('_r_hostOpts').split(';')[0]), '6');
        await speed.fill('2');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(output, 'five-speed-lobby.png') });
        // Hold completion of the normal game loader in this harness only, keeping its actual view observable.
        await page.evaluate(() => {
            const root = window.__ra2debug.mainMenuController.getCurrentScreen().rootController;
            const screen = [...root.screens.values()].find(screen => screen.gameLoader);
            window.__r3GameScreen = screen;
            const loader = screen.gameLoader, original = loader.load;
            const held = new Promise(resolve => { window.__releaseLoading = resolve; });
            loader.load = async function(...args) { const loaded = await original.apply(this, args); await held; return loaded; };
        });
        const start = page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(1700000000000); });
        await start;
        try {
            await page.locator('.loading-screen').waitFor({ timeout: 60000 });
            await page.waitForTimeout(800);
            result.loading = await page.locator('.loading-screen').evaluate(e => ({ rect: e.getBoundingClientRect().toJSON(),
                window: [innerWidth, innerHeight], content: e.querySelector('.loading-content').getBoundingClientRect().toJSON() }));
            await page.screenshot({ path: path.join(output, 'fullscreen-loading.png') });
            assert(Math.abs(result.loading.rect.width - result.loading.window[0]) < 1);
            assert(Math.abs(result.loading.rect.height - result.loading.window[1]) < 1);
        } finally { await page.evaluate(() => window.__releaseLoading()); }
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        result.initialSpeed = await page.evaluate(() => window.__ra2debug.game.desiredSpeed.value * 15);
        assert.equal(result.initialSpeed, 67.5);
        result.speed = [];
        for (const ticks of [22.5, 45, 67.5, 90, 112.5]) {
            await page.evaluate(ticks => { window.__ra2debug.game.desiredSpeed.value = ticks / 15; }, ticks);
            await page.waitForTimeout(300);
            const before = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, time: performance.now() }));
            await page.waitForTimeout(4000);
            const after = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, time: performance.now() }));
            const actual = (after.tick - before.tick) / ((after.time - before.time) / 1000);
            result.speed.push({ requested: ticks, measured: actual }); assert(Math.abs(actual - ticks) < ticks * .15);
        }
        const labels = await page.evaluate(() => {
            const d = window.__ra2debug; d.gameScreen.menu.open();
            return ['GUI:Options', 'GUI:Back', 'GUI:ResumeMission'].map(k => d.gameScreen.strings.get(k));
        });
        await page.getByText(labels[0], { exact: true }).click();
        const pausedSpeed = page.getByRole('slider', { name: 'Game speed' });
        await pausedSpeed.waitFor(); assert.equal(await pausedSpeed.getAttribute('max'), '4');
        await pausedSpeed.fill('2'); await page.waitForTimeout(300);
        const pausedTick = await page.evaluate(() => window.__ra2debug.game.currentTick);
        await page.waitForTimeout(500);
        assert.equal(await page.evaluate(() => window.__ra2debug.game.currentTick), pausedTick);
        await page.getByText(labels[1], { exact: true }).click();
        await page.getByText(labels[2], { exact: true }).click(); await page.waitForTimeout(400);
        result.pauseResumeSpeed = await page.evaluate(() => window.__ra2debug.game.desiredSpeed.value * 15);
        assert.equal(result.pauseResumeSpeed, 67.5);
        await page.screenshot({ path: path.join(output, 'game.png') });
        assert.equal(result.errors.length, 0); assert.equal(result.consoleErrors.length, 0);
        result.status = 'PASS';
    }
} catch (error) { result.failure = error.stack; process.exitCode = 1; await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(output); await app.close(); }
