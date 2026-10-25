import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const [receiptFile, priorEvidence, output] = process.argv.slice(2);
const artifact = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const prior = JSON.parse(await fs.readFile(path.join(priorEvidence, 'report.json'), 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile'), baseline = process.argv.includes('--baseline');
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
await fs.mkdir(out, { recursive: false }); await fs.cp(path.join(priorEvidence, 'profile'), profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: artifact.resources }));
const report = { status: 'RUNNING', baseline, edition: prior.edition, errors: [], transitions: [],
    disclosure: 'Copied prior delivered test profile. Actual native menu actions and frames are observed; controlled 350 ms loading-screen holds expose flag rendering and a 700 ms delay makes cancellation reproducible.' };
const app = await electron.launch({ executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
    : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp', timeout: 60000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
const page = await app.firstWindow();
page.on('pageerror', error => report.errors.push(error.stack));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
const saveReport = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function freeze() {
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug?.gameScreen?.gameAnimationLoop
        && window.__ra2debug.game !== window.__priorGame, undefined, { timeout: 120000 });
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen; s.gameAnimationLoop.stop(); s.uiAnimationLoop.start(); });
}
async function trace(name, delay = 0) {
    await page.evaluate(({ name, delay }) => {
        const d = window.__ra2debug, root = d.mainMenuController?.screens.get(0)?.rootController ?? d.gameScreen.controller;
        const gameScreen = root.screens.get(1), main = d.mainMenu, restores = [];
        const data = { name, events: [], sidebarIn: 0, sidebarOut: 0, parentResume: 0, dialogs: [], messageBoxes: [], progress: [], frames: [] };
        const mark = (event, extra = {}) => data.events.push({ event, time: performance.now(), ...extra });
        const wrap = (object, key, callback) => {
            const original = object[key]; object[key] = function (...args) { callback(args); return original.apply(this, args); };
            restores.push(() => { object[key] = original; });
        };
        if (main) {
            wrap(main, 'showButtons', () => { data.sidebarIn++; mark('sidebar-in'); });
            wrap(main, 'hideButtons', () => { data.sidebarOut++; mark('sidebar-out'); });
            wrap(d.mainMenuController.screens.get(0), 'onUnstack', () => { data.parentResume++; mark('parent-resume'); });
        } else if (d.gameScreen?.menu?.controller) {
            wrap(d.gameScreen.menu.controller.screens.get(0), 'onUnstack', () => { data.parentResume++; mark('pause-parent-resume'); });
        }
        wrap(HTMLDialogElement.prototype, 'showModal', args => { data.dialogs.push(performance.now()); mark('dialog'); });
        wrap(gameScreen.messageBoxApi, 'show', args => { data.messageBoxes.push(String(args[0])); mark('message-box'); });
        const factory = gameScreen.loadingScreenApiFactory, create = factory.create;
        factory.create = function (...args) {
            const api = create.apply(this, args), start = api.start, progress = api.onLoadProgress;
            api.start = async function (...params) {
                mark('loading-start'); await start.apply(this, params);
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            };
            api.onLoadProgress = function (percent) { data.progress.push(percent); return progress.call(this, percent); };
            return api;
        };
        restores.push(() => { factory.create = create; });
        let live = true, frame, previous;
        const record = () => {
            const state = [!!document.querySelector('[data-testid=skirmish-saves]'), !!document.querySelector('.loading-screen'),
                !!document.querySelector('.save-native-popup[open]'), !!document.querySelector('.message-box')];
            const key = state.join();
            if (key !== previous) { previous = key; data.frames.push({ time: performance.now(), state }); }
            if (live) frame = requestAnimationFrame(record);
        };
        frame = requestAnimationFrame(record);
        window.__loadTrace = { data, finish: () => { live = false; cancelAnimationFrame(frame); for (const restore of restores) restore(); return data; } };
        window.__priorGame = d.game; window.__freezeNextGame = true;
    }, { name, delay });
}
async function finishTrace() {
    const data = await page.evaluate(() => { const data = window.__loadTrace.finish(); delete window.__loadTrace; return data; });
    report.transitions.push(data); await saveReport(); return data;
}
async function checkLoaded() {
    const actual = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, hash: window.__ra2debug.game.getHash(),
        popups: document.querySelectorAll('.save-native-popup').length, cancelControls: document.querySelectorAll('[data-testid=saved-game-loading-cancel]').length,
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(actual.tick, prior.saved.tick); assert.equal(actual.hash, prior.saved.hash);
    assert.equal(actual.popups, 0, 'The exited save page must release its dialog'); assert.equal(actual.cancelControls, 0);
    assert.equal(actual.glError, 0); return actual;
}
async function checkLoadingFlag() {
    await page.waitForFunction(edition => {
        const c = document.querySelector('canvas[data-loading-backdrop]');
        return c && c.width > 1 && (edition !== 'yr' || c.dataset.loadingFlag === 'ready');
    }, prior.edition);
    const flag = await page.locator('canvas[data-loading-backdrop]').evaluate(c => {
        const x = Math.round((500 + parseFloat(c.style.width) - 800) * 2);
        const pixels = c.getContext('2d').getImageData(x, 800, 432, 240).data;
        let bright = 0;
        for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 40) bright++;
        return { ready: c.dataset.loadingFlag === 'ready', bright };
    });
    assert.equal(flag.ready, prior.edition === 'yr'); assert(flag.bright > 1000);
    return flag;
}
try {
    await page.locator(`[data-edition=${prior.edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const requestFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = function (callback) {
            const d = window.__ra2debug, loop = d?.gameScreen?.gameAnimationLoop;
            if (window.__freezeNextGame && loop && d.game !== window.__priorGame) {
                window.__freezeNextGame = false; loop.stop(); return 0;
            }
            return requestFrame.call(window, callback);
        };
    });
    await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').getByRole('option', { name: /Native persistence checkpoint/ }).click();
    await trace('home-load', 350); await page.locator('[data-action=LoadGame]').click();
    await page.locator('.loading-screen').waitFor({ timeout: 120000 });
    if (!baseline) assert.equal(await page.getByTestId('saved-game-loading-cancel').count(), 0);
    if (!baseline) report.homeLoadingFlag = await checkLoadingFlag();
    await page.screenshot({ path: path.join(out, 'home-loading.png') });
    await freeze();
    report.homeLoaded = await checkLoaded(); const home = await finishTrace();
    console.log(JSON.stringify({ stage: 'home-load', out: home.sidebarOut, in: home.sidebarIn, resume: home.parentResume,
        dialogs: home.dialogs.length, messageBoxes: home.messageBoxes.length }));
    if (baseline) { assert(home.sidebarOut >= 2 && home.sidebarIn >= 1); assert(home.dialogs.length && home.messageBoxes.length); }
    else {
        assert.equal(home.sidebarOut, 1); assert.equal(home.sidebarIn, 0); assert.equal(home.parentResume, 0);
        assert.equal(home.dialogs.length, 0); assert.equal(home.messageBoxes.length, 0);
        assert(home.frames.some(frame => frame.state[1]));
        assert(home.progress.some(percent => percent >= 40 && percent <= 60));
    }
    await page.evaluate(() => { const d = window.__ra2debug;
        for (let i = 0; i < 600; i++) if (!d.gameScreen.gameTurnMgr.doGameTurn(performance.now())) throw Error('Turn refused'); });
    report.continuation = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, hash: window.__ra2debug.game.getHash() }));
    assert.equal(report.continuation.hash, prior.continuation.hash);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').getByRole('option', { name: /Native persistence checkpoint/ }).click();
    await page.locator('[data-action=LoadGame]').click(); await page.locator('[data-action=ConfirmSaveAction]').waitFor();
    await trace('in-game-load', 350); await page.locator('[data-action=ConfirmSaveAction]').click();
    if (!baseline) {
        await page.locator('.loading-screen').waitFor({ timeout: 120000 });
        report.inGameLoadingFlag = await checkLoadingFlag();
        await page.screenshot({ path: path.join(out, 'in-game-loading.png') });
    }
    await freeze();
    report.inGameLoaded = await checkLoaded(); const inGame = await finishTrace();
    console.log(JSON.stringify({ stage: 'in-game-load', resume: inGame.parentResume, dialogs: inGame.dialogs.length, messageBoxes: inGame.messageBoxes.length }));
    if (!baseline) { assert.equal(inGame.parentResume, 0); assert.equal(inGame.dialogs.length, 0); assert.equal(inGame.messageBoxes.length, 0); }
    await page.screenshot({ path: path.join(out, 'in-game-restored.png') });
    if (!baseline) {
        await page.evaluate(() => window.__ra2debug.gameScreen.controller.goToScreenBlocking(0));
        await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
        await page.locator('[data-action=LoadGame]:enabled').waitFor({ state: 'visible' });
        await trace('explicit-back'); await page.locator('[data-action=CloseSaves]').click();
        await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).waitFor({ state: 'visible' });
        const back = await finishTrace(); assert.equal(back.parentResume, 1); assert.equal(back.sidebarOut, 1); assert.equal(back.sidebarIn, 1);
        await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
        await page.locator('[data-action=LoadGame]:enabled').waitFor({ state: 'visible' });
        await trace('cancel-load', 700); await page.locator('[data-action=LoadGame]').click();
        await page.locator('.loading-screen').waitFor({ timeout: 120000 });
        assert.equal(await page.getByTestId('saved-game-loading-cancel').count(), 0);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__ra2debug.mainMenuController?.getCurrentScreenType() === 0, undefined, { timeout: 90000 });
        await page.waitForTimeout(1000);
        assert.equal(await page.evaluate(() => !!window.__ra2debug.game), false);
        const cancelled = await finishTrace(); assert.equal(cancelled.dialogs.length, 0); assert.equal(cancelled.messageBoxes.length, 0);
        await page.screenshot({ path: path.join(out, 'cancelled-to-home.png') });
        await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
        await page.locator('[data-action=LoadGame]:enabled').waitFor({ state: 'visible' });
        await trace('cancel-restore'); await page.locator('[data-action=LoadGame]').click();
        await page.waitForFunction(() => window.__loadTrace.data.progress.some(percent => percent > 40 && percent < 60),
            undefined, { timeout: 120000 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.__ra2debug.mainMenuController?.getCurrentScreenType() === 0,
            undefined, { timeout: 90000 });
        await page.waitForTimeout(1000);
        assert.equal(await page.evaluate(() => !!window.__ra2debug.game), false);
        const restoreCancelled = await finishTrace();
        assert.equal(restoreCancelled.dialogs.length, 0); assert.equal(restoreCancelled.messageBoxes.length, 0);
    }
    assert.deepEqual(report.errors, []);
    report.status = baseline ? 'REPRODUCED_DOUBLE_SIDEBAR_ANIMATION_AND_BOTH_TRANSIENT_DIALOGS'
        : 'PASS_DIRECT_HOME_AND_IN_GAME_LOAD_NO_TRANSIENT_DIALOGS_BACK_CANCEL_AND_IDENTICAL_R4_SAVE_STATE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await saveReport(); await app.close(); }
console.log(JSON.stringify({ status: report.status, failure: report.failure }));
if (report.status === 'FAIL') process.exitCode = 1;
