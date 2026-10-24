import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { auditFactionVoices } from './native-faction-voices.mjs';

const [receiptFile, output] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const artifact = receipt.receipt ?? receipt;
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out, { recursive: false });
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({
    schemaVersion: 1, directory: artifact.resources,
}));
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--2x') ? 2 : 4;
const trainerCheck = process.argv.includes('--trainer');
const voiceAuditFile = process.argv.find(arg => arg.startsWith('--voice-audit-file='))?.slice('--voice-audit-file='.length)
    ?? '../project-history/skirmish-repairs-main-20261024/Evidence/skirmish-save-ui-r4-20261023/retail-voice-audit.json';
const country = process.argv.includes('--yuri') ? 9 : process.argv.includes('--soviet') ? 8 : 0;
const names = country === 9 ? ['PCV', 'YAPOWR', 'YABRCK', 'INIT', 'YAREFN']
    : country === 8 ? ['SMCV', 'NAPOWR', 'NAHAND', 'E2', 'NAREFN'] : ['AMCV', 'GAPOWR', 'GAPILE', 'E1', 'GAREFN'];
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', edition, density, trainerCheck, errors: [], stages: [],
    disclosure: 'Live built-in AI and legal queued human commands. Manual simulation ticks accelerate validation. No spawned, destroyed or revealed fixtures before persistence and continuation comparisons.' };
const saveReport = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function launch() {
    app = await electron.launch({
        executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
            : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
    });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error')
        report.errors.push(message.text().slice(0, 1200)); });
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const requestFrame = window.requestAnimationFrame;
        window.__freezeNextGame = true;
        window.requestAnimationFrame = function (callback) {
            const loop = window.__ra2debug?.gameScreen?.gameAnimationLoop;
            if (window.__freezeNextGame && loop && window.__ra2debug.game !== window.__priorGame) {
                window.__freezeNextGame = false;
                loop.stop();
                return 0;
            }
            return requestFrame.call(window, callback);
        };
    });
}
async function freeze() {
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug?.gameScreen?.gameAnimationLoop &&
        window.__ra2debug.game !== window.__priorGame,
        undefined, { timeout: 120000 });
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen; s.gameAnimationLoop.stop(); s.uiAnimationLoop.start(); });
}
async function state() {
    return page.evaluate(() => {
        const d = window.__ra2debug, game = d.game;
        return { tick: game.currentTick, hash: game.getHash(), state: game.debugGetState(),
            players: game.getCombatants().map(p => ({ name: p.name, credits: p.credits, defeated: p.defeated,
                units: p.getOwnedObjects().map(o => ({ id: o.id, name: o.name, health: o.healthTrait?.health,
                    tile: [o.tile.rx, o.tile.ry], moving: o.isMoving })),
                queues: p.production.getAllQueues().map(q => ({ type: q.type, status: q.status,
                    items: q.getAll().map(i => ({ name: i.rules.name, quantity: i.quantity, progress: i.progress, spent: i.creditsSpent })) })) })),
            trainer: { enabled: d.trainer.preferences.enabled, effects: { ...d.trainer.session.effects },
                protected: [...d.trainer.session.protectedObjects].map(o => o.id).sort((a, b) => a - b),
                pending: d.trainer.session.pendingCommands().map(command => 'targets' in command
                    ? { ...command, targets: command.targets.map(object => object.id) } : { ...command }) },
            glError: d.renderer.renderer.getContext().getError() };
    });
}
async function ticks(count) {
    await page.evaluate(async count => {
        const d = window.__ra2debug;
        for (let i = 0; i < count; i++) {
            if (d.game.status !== 1 || !d.gameScreen.gameTurnMgr.doGameTurn(performance.now())) throw Error('Turn refused');
            if (i % 100 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
    }, count);
}
async function dialog(mode = 'save', alreadyPaused = false) {
    if (!alreadyPaused) await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: locale[mode === 'save' ? 'hd:savegame' : 'hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor();
}
async function clickAction(name) {
    await page.locator(`[data-action=${name}]`).click();
}
async function checkLayouts(home = false) {
    const cdp = await page.context().newCDPSession(page);
    const layouts = [];
    report[home ? 'homeLayouts' : 'layouts'] = layouts;
    for (const [width, height] of [[640, 480], [800, 600], [1024, 768], [1280, 720], [1440, 900],
        [1920, 1080], [2560, 1856], [2560, 1080], [3440, 1440]]) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await page.waitForTimeout(150);
        const layout = await page.evaluate(() => {
            const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect();
                return { x: b.x, y: b.y, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
            return { width: innerWidth, height: innerHeight, page: rect('.save-native-screen'), content: rect('.save-file-content'),
                list: rect('.save-native-list'), name: document.querySelector('.save-native-name') && rect('.save-native-name'),
                actions: [...document.querySelectorAll('button[data-action]')].filter(button => button.classList.contains('menu-button')).map(button => {
                    const b = button.getBoundingClientRect();
                    return { action: button.dataset.action, x: b.x, y: b.y, right: b.right, bottom: b.bottom,
                        width: b.width, height: b.height };
                }), inherited: !document.querySelector('.save-native-menu'),
                expanded: window.__ra2debug.gameScreen?.menu?.controller?.contentExpanded,
                homePage: window.__ra2debug.mainMenuController?.getCurrentScreenType() === 22,
                ui: window.__ra2debug.uiArt.metrics() };
        });
        layouts.push(layout);
        assert(layout.inherited && (home ? layout.homePage : layout.expanded), 'Use the actual parent page stack and sidebar');
        assert(layout.content.x >= -1 && layout.content.y >= -1 && layout.content.right < width && layout.content.bottom <= height);
        assert(layout.list.width > 200 && layout.list.height > 100);
        if (layout.name) assert(layout.name.y >= layout.list.bottom && layout.name.bottom < height);
        assert(layout.ui.reservedBytes + layout.ui.resultHeadroomBytes <= layout.ui.budget);
        assert.equal(layout.actions.length, 3);
        for (const button of layout.actions) {
            assert(button.x >= layout.content.right - 2 && button.right <= width && button.y >= 0 && button.bottom <= height);
            assert(button.width >= 50 && button.height >= 10);
        }
        await clickAction('DeleteSave');
        await page.waitForFunction(() => document.querySelector('.save-native-popup')?.dataset.buttonArt === 'hd'
            && document.querySelector('.save-popup-panel canvas')?.dataset.backdropSource === 'hd'
            && document.querySelector('.save-popup-panel canvas')?.dataset.backdropDensity === '2');
        const popup = await page.locator('.save-popup-panel').boundingBox();
        assert(popup.width >= Math.min(420, width - 32) - 1 && popup.width <= Math.min(900, width - 32) + 1
            && popup.height <= height - 47 && popup.x >= 0 && popup.y >= 0);
        if ([800, 1280, 2560].includes(width)) await page.screenshot({ path: path.join(out, `${home ? 'home-load' : 'save'}-${width}x${height}-popup.png`) });
        await clickAction('CancelSaveAction');
        if ([640, 1280, 2560, 3440].includes(width)) await page.screenshot({ path: path.join(out, `${home ? 'home-load' : 'save'}-${width}x${height}.png`) });
        layout.popup = popup;
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.detach();
}
try {
    await launch();
    await page.evaluate(({ edition, density, country }) => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        d.generalOptions.graphics.hdDensity.value = density;
        const bots = Array(8).fill(null);
        bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        Object.entries({ _r_lastMap: edition === 'yr' ? 'xmp03t4.map' : 'mp03t4.map', _r_lastMode: '1',
            _r_lastCountry: String(country), _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;0;1;1;0;1;1;;0;1;0;0', _r_lastBots: JSON.stringify(bots),
        }).forEach(([key, value]) => localStorage.setItem(`_edition:${edition}:${key}`, value));
    }, { edition, density, country });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await freeze();
    report.start = await state();
    if (process.argv.includes('--voice-only')) {
        report.voices = await auditFactionVoices(page, edition, country, names[3],
            voiceAuditFile);
        report.status = 'PASS_NATIVE_FACTION_VOICES';
        await saveReport(); await app.close();
        console.log(JSON.stringify({ status: report.status, faction: report.voices.faction, count: report.voices.records.length }));
        process.exit(0);
    }
    console.log(JSON.stringify({ stage: 'live-match-started', tick: report.start.tick }));
    await saveReport();
    await page.evaluate(names => {
        const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(o => o.name === names[0]);
        if (!mcv) throw Error('Expected native initial MCV');
        d.actionsApi.orderUnits([mcv.id], 10);
    }, names);
    await ticks(100);
    await page.evaluate(names => window.__ra2debug.actionsApi.queueForProduction(0, 2, names[1], 1), names);
    await ticks(600);
    report.powerReady = await state();
    assert.equal(report.powerReady.players[0].queues[0].status, 3);
    await saveReport();
    await page.evaluate(names => {
        const d = window.__ra2debug, worker = d.game.getConstructionWorker(d.localPlayer);
        const tile = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t) &&
            worker.canPlaceAt(names[1], t, { normalizedTile: true }));
        if (!tile) throw Error('No legal power plant foundation');
        d.actionsApi.placeBuilding(names[1], tile.rx, tile.ry);
    }, names);
    await ticks(100);
    if (process.argv.includes('--extended')) {
        await page.evaluate(names => window.__ra2debug.actionsApi.queueForProduction(0, 2, names[2], 1), names);
        await ticks(500);
        await page.evaluate(names => {
            const d = window.__ra2debug, worker = d.game.getConstructionWorker(d.localPlayer);
            const tile = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t) &&
                worker.canPlaceAt(names[2], t, { normalizedTile: true }));
            if (!tile) throw Error('No legal barracks foundation');
            d.actionsApi.placeBuilding(names[2], tile.rx, tile.ry);
        }, names);
        await ticks(100);
        await page.evaluate(names => window.__ra2debug.actionsApi.queueForProduction(2, 3, names[3], 3), names);
        await ticks(700);
        report.infantry = await state();
        await page.evaluate(names => {
            const d = window.__ra2debug, infantry = d.localPlayer.getOwnedObjects().filter(o => o.name === names[3]);
            if (!infantry.length) throw Error('Legal infantry production did not complete');
            const unit = infantry[0], target = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) &&
                d.game.map.terrain.getPassableSpeed(t, unit.rules.speedType, false, false) > 0)
                .sort((a, b) => Math.abs(Math.hypot(a.rx - unit.tile.rx, a.ry - unit.tile.ry) - 18) -
                    Math.abs(Math.hypot(b.rx - unit.tile.rx, b.ry - unit.tile.ry) - 18))[0];
            d.actionsApi.orderUnits(infantry.map(o => o.id), 0, target.rx, target.ry);
        }, names);
    }
    if (process.argv.includes('--voice-audit')) {
        report.voices = await auditFactionVoices(page, edition, country, names[3],
            voiceAuditFile);
        await saveReport();
        console.log(JSON.stringify({ stage: 'native-voices-verified', faction: report.voices.faction, count: report.voices.records.length }));
    }
    if (trainerCheck) {
        await page.evaluate(() => {
            const d = window.__ra2debug, trainer = d.trainer;
            trainer.setEnabled(true);
            for (const command of [{ type: 'credits', mode: 'add', value: 20000 },
                { type: 'effect', effect: 'minimum', enabled: true, value: 15000 },
                { type: 'effect', effect: 'power', enabled: true, value: 1000 },
                { type: 'effect', effect: 'technology', enabled: true },
                { type: 'effect', effect: 'construction', enabled: true },
                { type: 'effect', effect: 'placement', enabled: true },
                { type: 'effect', effect: 'production', enabled: true, value: 1 },
                { type: 'effect', effect: 'recharge', enabled: true },
                { type: 'protect', targets: [...d.localPlayer.getOwnedObjects()] }, { type: 'reveal' }])
                if (!trainer.send(command)) throw Error('Trainer command rejected: ' + command.type);
        });
        await ticks(1);
        await page.evaluate(() => { const t = window.__ra2debug.trainer; t.setEnabled(false); t.setEnabled(true);
            t.send({ type: 'effect', effect: 'minimum', enabled: true, value: 15000 });
            t.send({ type: 'effect', effect: 'power', enabled: true, value: 1000 });
            t.send({ type: 'protect', targets: [...window.__ra2debug.localPlayer.getOwnedObjects()] });
        });
        await ticks(1);
    }
    await page.evaluate(names => window.__ra2debug.actionsApi.queueForProduction(0, 2, names[4], 1), names);
    await ticks(80);
    await dialog();
    if (trainerCheck) await page.evaluate(() => {
        if (!window.__ra2debug.trainer.send({ type: 'credits', mode: 'add', value: 500 })) throw Error('Paused trainer command rejected');
    });
    report.saved = await state();
    if (process.argv.includes('--extended')) assert(report.saved.players[0].units.some(u => u.name === names[3] && u.moving),
        'Save a live human movement task');
    await saveReport();
    await page.getByTestId('skirmish-saves').locator('input').fill('Native persistence checkpoint');
    await clickAction('SaveGame');
    await page.locator('[data-action=AcknowledgeSave]').waitFor();
    console.log(JSON.stringify({ stage: 'saved', tick: report.saved.tick }));
    await page.waitForFunction(() => document.querySelector('.save-popup-panel canvas')?.dataset.backdropSource === 'hd'
        && document.querySelector('.save-popup-panel canvas')?.dataset.backdropDensity === '2'
        && document.querySelector('.save-native-popup')?.dataset.buttonArt === 'hd');
    await page.screenshot({ path: path.join(out, 'saved-notice.png') });
    await clickAction('AcknowledgeSave');
    await page.waitForFunction(() => document.querySelector('.save-file-background')?.dataset.backdropSource === 'hd');
    await page.screenshot({ path: path.join(out, 'save-dialog.png') });
    if (process.argv.includes('--layout-matrix')) await checkLayouts();
    if (process.argv.includes('--original-toggle')) {
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
        await page.waitForFunction(() => document.querySelector('.save-file-background')?.dataset.backdropSource === 'original');
        await page.screenshot({ path: path.join(out, 'save-original.png') });
        await clickAction('DeleteSave');
        await page.waitForFunction(() => document.querySelector('.save-popup-panel canvas')?.dataset.backdropSource === 'original'
            && document.querySelector('.save-native-popup')?.dataset.buttonArt === 'original');
        await page.screenshot({ path: path.join(out, 'popup-original.png') });
        await clickAction('CancelSaveAction');
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
        await page.waitForFunction(() => document.querySelector('.save-file-background')?.dataset.backdropSource === 'hd');
        report.originalToggle = 'PASS_SOURCE_FACTION_BACKGROUND_BUTTONS_AND_EDITION_POPUP_RESTORED_TO_HD';
    }
    const pausedTick = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__ra2debug.game.currentTick), pausedTick);
    await clickAction('CloseSaves');
    const resumeLabel = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:ResumeMission'));
    await page.getByRole('button', { name: resumeLabel, exact: true }).click();
    await ticks(600);
    report.continuation = await state();
    await saveReport();
    await app.close();
    await launch();
    console.log(JSON.stringify({ stage: 'application-restarted' }));
    await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor();
    await page.waitForFunction(() => document.querySelector('.save-file-background')?.dataset.backdropSource === 'hd');
    await page.locator('[data-action=LoadGame]').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(out, 'load-dialog.png') });
    if (process.argv.includes('--layout-matrix')) await checkLayouts(true);
    await clickAction('LoadGame');
    await freeze();
    report.restored = await state();
    assert.equal(report.restored.tick, report.saved.tick, 'Load must stop at the exact saved boundary');
    assert.equal(report.restored.hash, report.saved.hash, 'Restored state hash');
    assert.deepEqual(report.restored.state, report.saved.state, 'Complete available simulation debug state');
    assert.deepEqual(report.restored.players, report.saved.players, 'Credits, queues, units and health');
    assert.deepEqual(report.restored.trainer, report.saved.trainer, 'Trainer effects, protected IDs and paused pending commands');
    await ticks(600);
    report.resumed = await state();
    assert.equal(report.resumed.hash, report.continuation.hash, 'AI and unit continuation hash');
    assert.deepEqual(report.resumed.state, report.continuation.state, 'AI continuation state');
    assert.deepEqual(report.resumed.trainer, report.continuation.trainer, 'Trainer continuation');
    assert.equal(report.resumed.glError, 0);
    await dialog();
    await page.getByTestId('skirmish-saves').locator('input').fill('Saved after loading');
    await clickAction('SaveGame');
    await page.locator('[data-action=AcknowledgeSave]').waitFor();
    report.secondSave = await state();
    await page.screenshot({ path: path.join(out, 'resaved.png') });
    await clickAction('AcknowledgeSave');
    await clickAction('CloseSaves');
    await dialog('load', true);
    await clickAction('LoadGame');
    await clickAction('CancelSaveAction');
    assert.equal(await page.evaluate(() => window.__ra2debug.game.currentTick), report.secondSave.tick);
    await page.evaluate(() => { window.__priorGame = window.__ra2debug.game; window.__freezeNextGame = true; });
    await clickAction('LoadGame');
    await clickAction('ConfirmSaveAction');
    await freeze();
    report.reloadedSecondSave = await state();
    assert.deepEqual(report.reloadedSecondSave.state, report.secondSave.state, 'Resaved history must remain complete');
    await dialog();
    await page.getByTestId('skirmish-saves').getByRole('option', { name: /Saved after loading/ }).click();
    await clickAction('SaveGame'); await clickAction('CancelSaveAction');
    assert.equal(await page.getByTestId('skirmish-saves').getByRole('option').count(), 2);
    await clickAction('SaveGame'); await clickAction('ConfirmSaveAction');
    await page.locator('[data-action=AcknowledgeSave]').waitFor();
    await page.getByTestId('skirmish-saves').getByRole('option', { name: /Saved after loading/ }).waitFor({ state: 'attached' });
    await clickAction('AcknowledgeSave');
    await clickAction('DeleteSave'); await clickAction('CancelSaveAction');
    assert.equal(await page.getByTestId('skirmish-saves').getByRole('option').count(), 2);
    await clickAction('DeleteSave'); await clickAction('ConfirmSaveAction');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=skirmish-saves] [role=option]').length === 1);
    report.controls = 'PASS_LOAD_CANCEL_OVERWRITE_CANCEL_OVERWRITE_DELETE_CANCEL_DELETE';
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    report.status = 'PASS_NATIVE_RESTART_SAVE_LOAD_CONTINUATION_AND_RESAVE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    report.failureText = await page?.locator('body').innerText().catch(() => '');
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await saveReport();
    await app?.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, tick: report.saved?.tick, failure: report.failure }));
if (report.status === 'FAIL') process.exitCode = 1;
