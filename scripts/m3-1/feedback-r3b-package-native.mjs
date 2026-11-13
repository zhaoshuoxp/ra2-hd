import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2]), 'utf8'));
const out = path.resolve(process.argv[3]), useDefaultProfile = process.argv.includes('--default-profile');
const originalLoading = process.argv.includes('--original-loading');
await fs.mkdir(out, { recursive: false });
const executable = path.join(receipt.app, 'Contents/MacOS', receipt.executable);
const resources = path.join(receipt.app, 'Contents/Resources/GameResources');
const metadata = JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json'), 'utf8'));
const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('RA2_')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'RUNNING', executable, metadata, useDefaultProfile,
    harnessSha256: hash(await fs.readFile(import.meta.filename)),
    scope: 'Actual packaged campaign entry via native UI, display modes, edition recovery, original movie/loading, and fresh playable Normal mission. Opening simulation is accelerated for a bounded keyboard-command check. No new full-mission or Windows claim.',
    cases: [], screenshots: [], errors: [], consoleErrors: [], failedResources: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page, labels;
async function shot(name) {
    await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save();
}
async function ready() {
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection] canvas')?.dataset.frame === '0');
    await page.waitForTimeout(900);
}
async function snapshot(name) {
    const state = await page.evaluate(() => {
        const node = document.querySelector('[data-campaign-selection]');
        return { url: location.href, ready: node?.dataset.campaignReady, density: node?.dataset.campaignArtDensity,
            size: [innerWidth, innerHeight], dpr: devicePixelRatio, status: node?.querySelector('[data-campaign-status]')?.textContent,
            factions: [...document.querySelectorAll('[data-campaign-faction]')].map(button => {
                const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                return { faction: button.dataset.campaignFaction, bounds: [r.x, r.y, r.width, r.height],
                    visible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
                    hit: button.contains(document.elementFromPoint(x, y)) };
            }), ui: window.__ra2debug.uiArt.metrics() };
    });
    report.cases.push({ name, ...state }); await save();
    assert.equal(state.ready, 'true'); assert.equal(state.factions.length, 3);
    assert(state.factions.every(faction => faction.visible && faction.hit));
    assert(state.ui.reservedBytes <= state.ui.budget);
    assert.equal(new URL(state.url).searchParams.get('edition'), 'ra2');
    assert(!new URL(state.url).searchParams.has('campaign'), 'The entry route must be consumed');
    return state;
}
async function back() { await page.getByRole('button', { name: labels['gui:back'], exact: true }).click(); }
async function campaign() { await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click(); }
async function selectEdition(edition) {
    await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).click();
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).waitFor({ timeout: 90000 });
}
async function keyboardCommand(command) {
    const binding = await page.evaluate(command => window.__ra2debug.gameScreen.keyBinds.getHotKey(command), command);
    assert(binding, command);
    const names = { 27: 'Escape', 32: 'Space', 13: 'Enter', 9: 'Tab' };
    const chord = [binding.metaKey && 'Meta', binding.altKey && 'Alt', binding.ctrlKey && 'Control', binding.shiftKey && 'Shift',
        names[binding.keyCode] || String.fromCharCode(binding.keyCode)].filter(Boolean).join('+');
    await page.keyboard.press(chord); await page.waitForTimeout(100);
}
async function savedCheckpoint() {
    return page.evaluate(async () => await new Promise((resolve, reject) => {
        const request = indexedDB.open('ra2-hd-campaign-saves', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const db = request.result, get = db.transaction('checkpoints', 'readonly').objectStore('checkpoints').get('ra2/sov01t.map/normal');
            get.onsuccess = () => { resolve(get.result ?? null); db.close(); };
            get.onerror = () => { reject(get.error); db.close(); };
        };
    }));
}
try {
    app = await electron.launch({ executablePath: executable, cwd: '/private/tmp', timeout: 60000,
        env: { ...environment, ...(useDefaultProfile ? {} : { RA2_DESKTOP_USER_DATA: path.join(out, 'profile') }) } });
    app.process().stdout?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await ready();
    report.bootstrap = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath(),
        userData: app.getPath('userData'), resources: process.env.RA2_UI_RESOURCE_ROOT, campaign: process.env.RA2_CAMPAIGN_RESOURCE_ROOT }));
    assert(report.bootstrap.packaged); assert.equal(report.bootstrap.resources, resources);
    assert.equal(report.bootstrap.campaign, path.join(resources, 'campaign'));
    const registration = JSON.parse(await fs.readFile(path.join(report.bootstrap.userData, 'resource-registration.json'), 'utf8'));
    assert.equal(registration.directory, resources);
    const browserWindow = await app.browserWindow(page);
    report.title = await browserWindow.evaluate(window => window.getTitle());
    assert.equal(report.title, metadata.productName);
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    await snapshot('Direct RA2 campaign startup'); await shot('01-direct-ra2-faction-menu');
    if (useDefaultProfile) {
        const before = await savedCheckpoint();
        await back(); await campaign(); await ready();
        await snapshot('Default profile campaign reentry');
        const after = await savedCheckpoint(); assert.deepEqual(after, before);
        report.savePreservation = { exists: before !== null, sha256: hash(JSON.stringify(before)), unchanged: true };
    } else {
        const hd = await page.evaluate(() => {
            const canvas = document.querySelector('[data-campaign-selection] canvas');
            return { size: [canvas.width, canvas.height], sourceSize: canvas.dataset.campaignSourceSize,
                backdrop: canvas.dataset.campaignBackdrop };
        });
        const source = PNG.sync.read(await fs.readFile(path.join(resources, 'campaign/ra2/sov01t/interface-selection-2x.png')));
        assert.equal(hd.sourceSize, `${source.width},${source.height}`); assert(hd.size[0] * hd.size[1] <= 1700000);
        assert.equal(hd.backdrop, 'campaign-backdrop-topography-r2a.png'); report.hdPixels = { ...hd, preservedSourceSha256: hash(source.data) };
        for (const size of [[1280, 900], [1774, 1163]]) {
            await browserWindow.evaluate((window, size) => { window.setFullScreen(false); window.unmaximize(); window.setContentSize(...size); }, size);
            await page.waitForTimeout(700); await snapshot('Window ' + size.join('x')); await shot('02-window-' + size.join('x'));
        }
        report.fullscreen = await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
        await page.waitForTimeout(1200);
        assert(report.fullscreen.fullscreen); await snapshot('Application fullscreen'); await shot('03-application-fullscreen');
        await page.evaluate(async () => {
            const display = await window.desktopDisplay.get();
            await window.desktopDisplay.set(display.choices.find(choice => choice.id !== 'fullscreen').id);
        });
        await browserWindow.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 900); });
        await page.waitForTimeout(1000);
        await page.locator('[data-campaign-faction=soviet]').hover();
        await page.waitForFunction(() => Number(document.querySelector('[data-campaign-faction=soviet] svg').dataset.frame) > 0);
        const first = await page.locator('[data-campaign-faction=soviet] svg').getAttribute('data-frame');
        await page.waitForFunction(first => document.querySelector('[data-campaign-faction=soviet] svg').dataset.frame !== first, first);
        report.animation = { first, next: await page.locator('[data-campaign-faction=soviet] svg').getAttribute('data-frame') };
        await back(); await selectEdition('yr'); await campaign();
        await page.waitForSelector('[data-campaign-edition-guide]'); await page.waitForTimeout(900);
        report.editionGuide = await page.locator('[data-campaign-edition-guide]').innerText();
        assert(report.editionGuide.includes(labels['hd:campaignrequiresra2'])); await shot('04-yr-direct-ra2-entry');
        await page.locator('[data-campaign-open-ra2]').click(); await ready(); await snapshot('YR central button returns to RA2 selection');
        await back(); await selectEdition('yr'); await campaign(); await page.waitForSelector('[data-campaign-edition-guide]');
        await back(); await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).waitFor();
        await campaign();
        await page.getByRole('button', { name: labels['hd:campaignopenra2'], exact: true })
            .and(page.locator(':not([data-campaign-open-ra2])')).click();
        await ready(); await snapshot('YR sidebar button returns to RA2 selection');
        await back(); await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value = false);
        await campaign(); await ready(); const original = await snapshot('Original faction menu reentry');
        assert.equal(original.density, '1'); await shot('05-original-faction-menu');
        await back(); await page.evaluate(enabled => window.__ra2debug.generalOptions.graphics.hdEnabled.value = enabled, !originalLoading);
        await campaign(); await ready(); await snapshot(originalLoading ? 'Original loading fallback entry' : 'HD faction menu reentry');
        if (originalLoading) {
            report.arrowFrames = [];
            for (let pass = 0; pass < 4; pass++) for (const faction of ['allied', 'tutorial', 'soviet']) {
                await page.locator('[data-campaign-faction=' + faction + ']').hover();
                await page.waitForTimeout(85);
                const frame = await page.locator('[data-campaign-faction=' + faction + '] canvas').getAttribute('data-frame');
                assert(frame !== null && Number(frame) >= 1 && Number(frame) <= 7); report.arrowFrames.push({ faction, frame });
            }
            await page.mouse.move(10, 10);
        }
        await page.evaluate(() => { window.__packageObservedGame = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1); });
        await page.locator('[data-campaign-faction=soviet]').click();
        await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .5);
        report.intro = await page.evaluate(() => {
            const video = document.querySelector('[data-campaign-media] video');
            return { dimensions: [video.videoWidth, video.videoHeight], currentTime: video.currentTime, audioDecodedBytes: video.webkitAudioDecodedByteCount };
        });
        assert.deepEqual(report.intro.dimensions, [640, 480]); assert(report.intro.audioDecodedBytes > 0); await shot('06-original-introduction');
        await page.locator('[data-campaign-media] button').click();
        await page.waitForSelector('[data-campaign-loading] canvas[data-campaign-sprite="ls800s01.shp"]', { timeout: 90000 });
        await page.waitForFunction(() => document.querySelector('[data-campaign-loading] canvas[data-campaign-sprite="ls800s01.shp"]')?.dataset.frame === '0');
        report.loading = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]'), canvas = node.querySelector('canvas[data-campaign-sprite="ls800s01.shp"]');
            const housing = node.querySelector('[data-campaign-sprite="spldbrl.shp"]'), fill = node.querySelector('[role=progressbar]');
            const screen = window.__packageObservedGame;
            const sprite = screen.loadingScreenApi.presentation.sprites.mission;
            const source = sprite.hdFrame ?? sprite.frames[0], alpha = (x, y) => source.data[(y * source.width + x) * 4 + 3];
            return { density: node.dataset.campaignArtDensity, size: [canvas.width, canvas.height], ui: window.__ra2debug.uiArt.metrics(),
                sourceSize: canvas.dataset.campaignSourceSize, backdrop: canvas.dataset.campaignBackdrop,
                outsideSubjectAlpha: [[20, 25], [400, 480], [755, 120]].map(([x, y]) => alpha(x * source.width / 800, y * source.height / 520)),
                housing: { left: housing.style.left, width: housing.style.width }, fillLeft: fill.style.left };
        });
        assert.equal(report.loading.density, originalLoading ? '1' : '2');
        assert.equal(report.loading.sourceSize, originalLoading ? '800,520' : '1600,1040');
        assert(report.loading.size[0] * report.loading.size[1] <= 1700000);
        assert.equal(report.loading.backdrop, 'campaign-backdrop-world-r2a.png');
        assert(report.loading.outsideSubjectAlpha.every(alpha => alpha === 0));
        if (originalLoading) { assert.equal(report.loading.housing.width, '800px');
            assert(Math.abs(parseFloat(report.loading.fillLeft) - parseFloat(report.loading.housing.left) - 172) < .01); }
        assert(report.loading.ui.reservedBytes <= report.loading.ui.budget); await shot('07-hd-soviet01-loading');
        await page.waitForFunction(() => window.__ra2debug?.game?.campaign && window.__ra2debug.game.status === 1, undefined, { timeout: 180000 });
        report.opening = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            manager.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
            if (g.currentTick === 0) {
                manager.setCampaignPaused(false);
                manager.doGameTurn(performance.now());
                manager.setCampaignPaused(true);
            }
            const initial = { tick: g.currentTick, diagnostic: g.campaign.launch.diagnostic, failure: g.campaign.failure,
                commands: g.campaign.journal.commands.length,
                bridgeExplosions: g.campaign.trace.filter(action => action.key === '0823BDEC'),
                brokenBridges: g.world.getAllObjects().filter(object => object.cabHutTrait?.canRepairBridge()).length };
            manager.setCampaignPaused(false);
            try { for (let i = 0; i < 3000 && g.campaign.inputLocked; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); }
            return { ...initial, unlockedAtTick: g.currentTick, inputLocked: g.campaign.inputLocked };
        });
        assert.equal(report.opening.diagnostic, false); assert(!report.opening.failure); assert.equal(report.opening.commands, 0);
        assert.equal(report.opening.bridgeExplosions.length, 8); assert.equal(report.opening.brokenBridges, 2); assert(!report.opening.inputLocked);
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(false); d.gameScreen.pointer.unlock(true); });
        await keyboardCommand('CombatantSelect'); await keyboardCommand('CombatantSelect'); await keyboardCommand('GuardObject');
        await page.waitForFunction(() => window.__ra2debug.game.campaign.journal.commands.length > 0, undefined, { timeout: 10000 });
        report.input = await page.evaluate(() => {
            const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
            return { tick: d.game.currentTick, commands: d.game.campaign.journal.commands, failure: d.game.campaign.failure,
                glError: d.renderer.renderer.getContext().getError() };
        });
        assert(!report.input.failure); assert.equal(report.input.glError, 0); await shot('08-playable-soviet01-real-keyboard-order');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await ready(); await snapshot('Abort returns to campaign without entry loop'); await back();
        await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).waitFor();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.failedResources, []);
    report.status = useDefaultProfile ? 'PASS_DEFAULT_PROFILE_DIRECT_ENTRY_AND_SAVE_PRESERVATION' : 'PASS_PACKAGED_ENTRY_EDITION_RECOVERY_AND_PLAYABLE_MISSION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await fs.copyFile(import.meta.filename, path.join(out,'harness.mjs')); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, cases: report.cases.length, error: report.error }));
