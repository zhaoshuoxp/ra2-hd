import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

export const root = path.resolve(import.meta.dirname, '../..');
const shadowReports = new WeakMap();
// A Windows portable root contains the executable beside its shared GameResources.
export function packagedLaunch(packaged, platform = process.platform) {
    const directory = path.resolve(packaged);
    if (platform === 'win32') return { executablePath: path.join(directory, 'Red Alert 2 HD.exe'),
        resources: path.join(directory, 'GameResources') };
    return { executablePath: path.join(directory, 'Contents/MacOS/RA2 HD Editions') };
}
async function developmentElectron() {
    return process.platform === 'win32' ? fs.realpath(path.join(root, 'node_modules/electron/dist/electron.exe'))
        : fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'));
}
export async function campaignSession(out, report, { edition = 'ra2', density = 0, observeIntroduction, beforeCampaign } = {}) {
    if (process.argv.includes('--vehicle-shadow-instancing')) report.vehicleShadowPrototypeRequested = 'on';
    const profile = path.join(out, 'profile');
    await fs.mkdir(profile, { recursive: true });
    const packaged = process.argv.find(value => value.startsWith('--app='))?.slice(6);
    const launch = packaged && packagedLaunch(packaged);
    if (!packaged) await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
    // The Windows transfer keeps one shared resource tree outside the program folder.
    else if (launch.resources) await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: launch.resources }));
    const app = await electron.launch({ executablePath: launch ? launch.executablePath : await developmentElectron(),
        args: packaged ? [] : [path.join(root, 'desktop/main.mjs')], cwd: process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(), env: {
            ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
            ...(launch?.resources ? { RA2_UI_RESOURCE_ROOT: launch.resources } : {}) } });
    app.process().stderr.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    let page;
    try { page = await app.firstWindow({ timeout: 90000 }); }
    catch (error) { await app.close().catch(() => {}); throw error; }
    if (packaged) report.packagedApplication = path.resolve(packaged);
    if (process.argv.includes('--vehicle-shadow-instancing')) shadowReports.set(page, report);
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') (report.consoleErrors ??= []).push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    await beforeCampaign?.({ app, page });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-${edition}-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-ready=true]')
        || !!document.querySelector('[data-campaign-media$="-introduction"] video'), undefined, { timeout: 90000 });
    const introduction = page.locator('[data-campaign-media$="-introduction"]');
    if (await introduction.count()) {
        await introduction.locator('video').waitFor();
        (report.campaignEntryIntroductions ??= []).push(await introduction.getAttribute('data-campaign-media'));
        await observeIntroduction?.({ app, page, labels, edition });
        await introduction.locator('button').click();
    }
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    // Campaign entry finishes loading its stored options. Assign the requested
    // observer setting afterward, as the source inventory observer does.
    const graphics = await page.evaluate(density => { const graphics = window.__ra2debug.generalOptions.graphics;
        const before = { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value };
        graphics.hdEnabled.value = density > 0; if (density) graphics.hdDensity.value = density;
        return { requested: density, before, after: { enabled: graphics.hdEnabled.value, density: graphics.hdDensity.value } };
    }, density);
    (report.campaignSessionGraphics ??= []).push(graphics);
    return { app, page, labels };
}
export async function pauseWorld(page) {
    const probe = await page.evaluate(vehicleShadows => { const d = window.__ra2debug;
        d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        if (vehicleShadows) {
            d.renderer.setVehicleShadowInstancing(true); d.renderer.render();
            return { tick: d.game.currentTick, mission: d.game.campaign.launch.mission,
                ...d.renderer.vehicleShadowDiagnostics() };
        }
    }, process.argv.includes('--vehicle-shadow-instancing'));
    const report = shadowReports.get(page);
    if (probe && report) (report.vehicleShadowChecks ??= []).push(probe);
}
export async function openMissionSelection(page, labels, faction = 'soviet') {
    await page.getByRole('button', { name: labels['hd:campaignselectmission'], exact: true }).click();
    await page.locator('[data-campaign-mission-faction]').selectOption(faction);
    await page.waitForSelector('[data-campaign-mission]');
}
export async function returnCampaignHome(page, labels) {
    const sidebarReady = () => page.waitForFunction(() => {
        const menu = window.__ra2debug?.mainMenuController?.mainMenu;
        return menu && !menu.sidebarCollapsed && !menu.sidebarNeedsRefresh;
    });
    await sidebarReady();
    if (await page.locator('[data-campaign-missions]').count()) {
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.waitForSelector('[data-campaign-selection][data-campaign-ready=true]');
        // The main panel commits before the sidebar's transition replaces its
        // callbacks. Wait for the new action before clicking Back again.
        await page.getByRole('button', { name: labels['hd:campaignselectmission'], exact: true }).waitFor();
        await sidebarReady();
    }
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).waitFor();
    await sidebarReady();
}
export async function switchCampaignEdition(page, labels, edition) {
    await returnCampaignHome(page, labels);
    await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).click();
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector('[data-campaign-ready=true]')
        || !!document.querySelector('[data-campaign-media$="-introduction"] video'), undefined, { timeout: 90000 });
    const introduction = page.locator('[data-campaign-media$="-introduction"]');
    if (await introduction.count()) await introduction.locator('button').click();
    await page.waitForSelector('[data-campaign-ready=true]');
}
export async function stepWorld(page, ticks) {
    const end = await page.evaluate(ticks => window.__ra2debug.game.currentTick + ticks, ticks);
    let last;
    do {
        const gate = await page.evaluate(() => {
            const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr;
            const value = manager.paused; manager.setPaused(true); return value;
        });
        await page.waitForFunction(() => !window.__ra2debug.game.campaign.captureMedia?.().movies
            .some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused'), undefined, { timeout: 180000 });
        last = await page.evaluate(count => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            if (manager.getErrorState?.()) throw Error('Native product error stopped simulation: ' + document.body.innerText.slice(-1200));
            manager.setPaused(false); manager.setCampaignPaused(false);
            try {
                for (let i = 0; i < 120 && g.currentTick < count && !g.campaign.result && !g.campaign.failure; i++) {
                    if (g.campaign.captureMedia?.().movies.some(movie => movie.placement === 'fullscreen' || movie.placement === 'transmission-paused')) break;
                    manager.doGameTurn(performance.now());
                }
            } finally { manager.setCampaignPaused(true); manager.setPaused(true); }
            return { tick: g.currentTick, result: g.campaign.result, failure: g.campaign.failure };
        }, end);
        await page.evaluate(gate => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(gate), gate);
        assert(!last.failure, last.failure); if (last.result) break;
    } while (last.tick < end);
    return last;
}
export async function waitWorld(page, mission, previousGameId) {
    await page.waitForFunction(({ mission, previousGameId }) => {
        const d = window.__ra2debug;
        const ready = d.game?.campaign?.launch.mission === mission && d.gameScreen?.playerUi
            && (!previousGameId || d.game.id !== previousGameId);
        // Pause in the readiness observation itself. An additional host IPC can
        // otherwise allow extra turns before the initial-world snapshot.
        if (ready) d.gameScreen.gameTurnMgr.setCampaignPaused(true);
        // The UI publishes its references before asynchronous shader preparation
        // finishes. Preserve the initial tick while waiting for a drawable world.
        const drawable = ready && d.renderer && d.worldScene
            && !d.renderer.preparingScenes?.has(d.worldScene);
        return drawable || !!document.querySelector('[data-game-error]')
            || document.body?.innerText.includes('Offline startup blocked')
            || /(?:^|\n)Error:/.test(document.body?.innerText ?? '');
    },
        { mission, previousGameId }, { timeout: 180000 });
    assert(await page.evaluate(() => !!window.__ra2debug.gameScreen?.playerUi), await page.locator('body').innerText());
    await pauseWorld(page);
}
export async function worldState(page) {
    return page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length })); });
}
