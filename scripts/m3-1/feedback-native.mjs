import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2]), 'utf8'));
const out = path.resolve(process.argv[3]), requestedLanguage = process.argv[4] ?? 'zh-CN';
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', app: receipt.app, requestedLanguage, cases: [], screenshots: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Native packaged UI, responsive chrome, real localized movie with controlled seeks, and trainer clicks. Opening simulation is accelerated. Native pointer lock is attempted and any host rejection is recorded. If unavailable, locked handoff is a controlled lock-state fixture with real mouse events. Physical mouse feel remains user review.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const labelsFor = async language => ({ ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
    ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) });
let app, page, browserWindow, labels;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function ready() { await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 }); await page.waitForTimeout(500); }
async function size(dimensions) {
    await browserWindow.evaluate((window, dimensions) => { window.unmaximize(); window.setContentSize(...dimensions); }, dimensions);
    await page.waitForTimeout(350);
}
async function selectionBounds() {
    const state = await page.evaluate(() => {
        const menu = window.__ra2debug.mainMenu, sidebarX = menu.sidebarContainer.getPosition().x;
        const panel = document.querySelector('[data-campaign-selection]').getBoundingClientRect();
        const content = document.querySelector('[data-campaign-selection-content]').getBoundingClientRect();
        const effectiveScale = content.width / 632;
        const sidebar = { left: sidebarX * effectiveScale, right: (sidebarX + menu.getImage('sdtp.shp').width) * effectiveScale };
        return { viewport: [innerWidth, innerHeight], sidebar, panel: panel.toJSON(), content: content.toJSON(),
            menu: { viewport: menu.viewport, scale: effectiveScale, internalScale: menu.menuScale }, ui: window.__ra2debug.uiArt.metrics() };
    });
    report.cases.push({ name: 'Full viewport faction chrome', ...state }); await save();
    assert(Math.abs(state.sidebar.right - state.viewport[0]) < 2, JSON.stringify(state));
    assert(Math.abs(state.panel.left) < 2); assert(Math.abs(state.panel.right - state.sidebar.left) < 2);
    assert(Math.abs(state.menu.viewport.height * state.menu.scale - state.viewport[1]) < 2);
    assert(state.content.left >= -1 && state.content.top >= -1 && state.content.bottom <= state.viewport[1] + 1);
    assert(state.ui.reservedBytes <= state.ui.budget);
}
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); browserWindow = await app.browserWindow(page);
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await ready(); labels = await labelsFor(await page.evaluate(() => document.documentElement.lang));
    if (requestedLanguage !== await page.evaluate(() => document.documentElement.lang)) {
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.getByRole('button', { name: labels['hd:menuoptions'], exact: true }).click();
        await page.locator('[data-language-options] .select-value').click();
        const name = requestedLanguage === 'en-US' ? 'English' : labels['hd:traditionalchinese'];
        await page.locator('[data-language-options] .select-layer').getByText(name, { exact: true }).click();
        await page.waitForFunction(language => document.documentElement.lang === language && window.__ra2debug?.mainMenuController,
            requestedLanguage, { timeout: 90000 });
        labels = await labelsFor(requestedLanguage);
        await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click(); await ready();
    }
    assert.equal(await page.evaluate(() => document.documentElement.lang), requestedLanguage);
    if (requestedLanguage === 'zh-CN') {
        for (const dimensions of [[800, 600], [1280, 720], [1680, 720], [720, 900]]) {
            await size(dimensions); await selectionBounds(); await shot('selection-' + dimensions.join('x'));
        }
        report.fullscreen = await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
        assert(report.fullscreen.fullscreen); await page.waitForTimeout(450); await selectionBounds(); await shot('selection-fullscreen');
        await page.evaluate(async () => { const display = await window.desktopDisplay.get();
            await window.desktopDisplay.set(display.choices.find(choice => choice.id !== 'fullscreen').id); });
        await size([1280, 720]);
        await page.locator('[data-campaign-faction=allied]').click();
        await page.locator('[data-campaign-faction=soviet]').hover();
        await page.waitForFunction(() => Number(document.querySelector('[data-campaign-faction=soviet] svg').dataset.frame) > 0
            && document.querySelector('[data-campaign-faction=allied] svg').dataset.frame === '0');
        report.arrows = await page.locator('[data-campaign-faction] svg').evaluateAll(nodes => nodes.map(node => ({ frame: node.dataset.frame,
            quality: node.querySelector('[data-campaign-arrow-quality]')?.getAttribute('data-campaign-arrow-quality') })));
        await shot('arrows-one-active-faction');
        await page.mouse.move(10, 10);
        await page.waitForFunction(() => [...document.querySelectorAll('[data-campaign-faction] svg')].every(node => node.dataset.frame === '0'));
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.getByRole('button', { name: labels['hd:menuoptions'], exact: true }).click();
        await page.getByRole('checkbox', { name: labels['trainer:enable'], exact: true }).check();
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click(); await ready();
        assert.equal(await page.locator('.trainer-bar').count(), 0);
    }
    await page.evaluate(() => {
        const game = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1);
        const factory = game.loadingScreenApiFactory, create = factory.create.bind(factory);
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...parameters) => { await start(...parameters); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve); };
            return api;
        };
    });
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > 1.6);
    await page.evaluate(() => document.querySelector('[data-campaign-media] video').pause());
    const first = labels['hd:movie:s01_f00e:00'];
    await page.waitForFunction(first => document.querySelector('[data-campaign-movie-subtitle]').textContent === first, first);
    report.caption = await page.locator('[data-campaign-movie-subtitle]').evaluate(node => ({ text: node.textContent,
        font: getComputedStyle(node).font, size: node.getBoundingClientRect().toJSON() }));
    await shot('subtitle-' + requestedLanguage);
    for (const [time, key] of [[0, null], [3.6, '01'], [2, '00'], [102, null]]) {
        await page.evaluate(time => { document.querySelector('[data-campaign-media] video').currentTime = time; }, time);
        const expected = key ? labels['hd:movie:s01_f00e:' + key] : '';
        await page.waitForFunction(expected => document.querySelector('[data-campaign-movie-subtitle]').textContent === expected, expected);
    }
    await page.locator('[data-campaign-media] button').click();
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    assert.equal(await page.locator('[data-campaign-media]').count(), 0);
    report.loadingArtwork = await page.evaluate(() => {
        const sprite = window.__heldLoading.presentation.sprites.mission, frame = sprite.hdFrame ?? sprite.frames[0];
        const alpha = (x, y) => frame.data[(Math.floor(y * frame.height / 520) * frame.width + Math.floor(x * frame.width / 800)) * 4 + 3];
        const message = document.querySelector('[data-campaign-load-message]');
        return { outsideSubjects: [[20, 25], [400, 480], [755, 120]].map(([x, y]) => ({ x, y, alpha: alpha(x, y) })),
            focusAlpha: alpha(400, 100), photoAlpha: alpha(270, 400), title: message.textContent, titleZ: getComputedStyle(message).zIndex };
    });
    assert(report.loadingArtwork.outsideSubjects.every(sample => sample.alpha === 0));
    assert.equal(report.loadingArtwork.focusAlpha, 255); assert.equal(report.loadingArtwork.photoAlpha, 255);
    assert(report.loadingArtwork.title.trim()); assert.equal(report.loadingArtwork.titleZ, '4');
    for (const dimensions of requestedLanguage === 'zh-CN' ? [[800, 600], [1280, 720], [1680, 720], [720, 900]] : [[1280, 720]]) {
        await size(dimensions); await page.evaluate(() => window.__heldLoading.onLoadProgress(62));
        const state = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]'), frame = node.querySelector('[data-campaign-loading-frame]');
            return { viewport: [innerWidth, innerHeight], bounds: frame.getBoundingClientRect().toJSON(), density: node.dataset.campaignArtDensity,
                metal: node.querySelector('[data-loading-metal]')?.getAttribute('data-loading-metal'), ui: window.__ra2debug.uiArt.metrics() };
        });
        assert(Math.abs(state.bounds.width - state.viewport[0]) < 2 && Math.abs(state.bounds.height - state.viewport[1]) < 2);
        assert.equal(state.density, '2'); assert.equal(state.metal, 'retail-reference-r2'); assert(state.ui.reservedBytes <= state.ui.budget);
        report.cases.push({ name: 'Held real loading screen, progress set to 62% for visual comparison', ...state });
        await shot('loading-' + requestedLanguage + '-' + dimensions.join('x'));
        if (requestedLanguage === 'zh-CN' && dimensions[0] === 1280) {
            const housing = page.locator('svg[data-campaign-sprite="spldbrl.shp"]');
            report.cable = await housing.evaluate(node => {
                const box = node.querySelector('[data-loading-metal]').getBBox();
                return { box: node.getBoundingClientRect().toJSON(), overflow: getComputedStyle(node).overflow,
                    zIndex: getComputedStyle(node).zIndex, spriteBounds: { x: box.x, y: box.y, width: box.width, height: box.height } };
            });
            assert.equal(report.cable.overflow, 'visible'); assert(report.cable.spriteBounds.y < -10);
            const bounds = report.cable.box, extra = bounds.height * 12.35 / 40;
            await page.screenshot({ path: path.join(out, 'loading-complete-component.png'),
                clip: { x: bounds.x, y: bounds.y - extra, width: bounds.width, height: bounds.height + extra } });
            report.screenshots.push('loading-complete-component.png');
        }
    }
    await size([1280, 720]); await page.evaluate(() => window.__releaseLoading());
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    report.opening = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false);
        try { if (!g.currentTick) manager.doGameTurn(performance.now()); for (let i = 0; i < 3000 && g.campaign.inputLocked; i++) manager.doGameTurn(performance.now()); }
        finally { manager.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); }
        return { tick: g.currentTick, inputLocked: g.campaign.inputLocked, modified: !!g.campaign.inspectionModified,
            bridgeExplosions: g.campaign.trace.filter(action => action.key === '0823BDEC').length };
    });
    assert(!report.opening.inputLocked && !report.opening.modified); assert.equal(report.opening.bridgeExplosions, 8);
    report.objective = await page.locator('[data-campaign-objective]').evaluate(node => {
        const d = window.__ra2debug, bounds = node.getBoundingClientRect(), canvas = d.gameScreen.renderer.getCanvas().getBoundingClientRect();
        const scale = d.gameScreen.viewport.value.scale ?? 1, native = document.createElement('span');
        native.style.color = d.localPlayer.color.asHexString();
        return { bounds: bounds.toJSON(), fontSize: getComputedStyle(node).fontSize, expectedTop: canvas.top,
            scale, expectedFontSize: 13 * scale, nativeMessageFont: d.gameScreen.hud.messages.ctx.font,
            inlineColor: node.style.color, nativeInlineColor: native.style.color,
            maxRight: canvas.right - d.gameScreen.hud.sidebarWidth * scale };
    });
    assert(Math.abs(parseFloat(report.objective.fontSize) - report.objective.expectedFontSize) < .01);
    assert(report.objective.nativeMessageFont.includes('13px')); assert.equal(report.objective.inlineColor, report.objective.nativeInlineColor);
    assert(Math.abs(report.objective.bounds.top - report.objective.expectedTop) < 1);
    assert(Math.abs(report.objective.bounds.right - report.objective.maxRight) < 1);
    await page.waitForFunction(() => { const node = document.querySelector('[data-campaign-subtitle]');
        return node && !node.hidden && !!node.textContent; }, undefined, { timeout: 20000 });
    report.speechHud = await page.locator('[data-campaign-subtitle]').evaluate(node => ({ text: node.textContent,
        bounds: node.getBoundingClientRect().toJSON(), objective: document.querySelector('[data-campaign-objective]').getBoundingClientRect().toJSON(),
        font: getComputedStyle(node).font, fontSize: getComputedStyle(node).fontSize, color: getComputedStyle(node).color }));
    assert.equal(report.speechHud.fontSize, report.objective.fontSize);
    assert(report.speechHud.font.includes('Fira Sans Condensed'));
    assert(Math.abs(report.speechHud.bounds.top - report.speechHud.objective.bottom) < 1);
    assert(Math.abs(report.speechHud.bounds.right - report.speechHud.objective.right) < 1);
    await shot('game-information-upper-right');
    if (requestedLanguage === 'zh-CN') {
        await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true });
            const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus(); window.webContents.focus(); });
        await page.evaluate(() => window.__ra2debug.gameScreen.pointer.lock());
        await app.evaluate(({ BrowserWindow }) => {
            const contents = BrowserWindow.getAllWindows()[0].webContents;
            contents.sendInputEvent({ type: 'mouseDown', x: 400, y: 250, button: 'left', clickCount: 1 });
            contents.sendInputEvent({ type: 'mouseUp', x: 400, y: 250, button: 'left', clickCount: 1 });
        });
        await page.waitForTimeout(500);
        report.pointerRequest = await page.evaluate(async () => {
            const pointer = window.__ra2debug.gameScreen.pointer, target = document.elementFromPoint(400, 250);
            let error;
            if (!document.pointerLockElement) {
                try { await Promise.race([pointer.getPointerLock().request(), new Promise((_, reject) => setTimeout(() => reject(new Error('Native lock request timed out')), 2000))]); }
                catch (value) { error = value.message; }
            }
            return { error, clickTarget: target?.tagName, targetIsCanvas: target === pointer.canvas };
        });
        report.pointerLock = await page.evaluate(() => ({ native: !!document.pointerLockElement, focus: document.hasFocus(),
            permission: window.__ra2debug.gameScreen.pointer.userPermissionGranted,
            mode: window.__ra2debug.gameScreen.pointer.getUserLockMode() }));
        await save();
        await page.evaluate(() => {
            const d = window.__ra2debug, pointer = d.gameScreen.pointer, v = d.gameScreen.viewport.value;
            const rect = document.querySelector('.trainer-bar button').getBoundingClientRect();
            Object.assign(pointer.getPosition(), { x: (rect.left + rect.width / 2 - (v.x ?? 0)) / v.scale,
                y: (rect.top + rect.height / 2 - (v.y ?? 0)) / v.scale });
            window.__trainerWorldEvents = [];
            for (const type of ['mousedown', 'mouseup', 'click']) pointer.canvas.addEventListener(type, () => window.__trainerWorldEvents.push(type));
        });
        if (report.pointerLock.native) { await page.waitForTimeout(100); await page.mouse.down(); await page.mouse.up(); }
        else {
            await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true));
            await page.getByRole('button', { name: labels['trainer:economy'], exact: true }).click();
        }
        await page.locator('.trainer-popover').waitFor();
        await page.waitForFunction(() => !window.__ra2debug.gameScreen.pointer.restoringPosition);
        report.trainerBefore = await page.evaluate(() => ({ credits: window.__ra2debug.localPlayer.credits,
            commands: window.__ra2debug.game.campaign.journal.commands.length, worldEvents: window.__trainerWorldEvents,
            enabled: window.__ra2debug.trainer.canAct, locked: !!document.pointerLockElement }));
        assert(report.trainerBefore.enabled && !report.trainerBefore.locked); assert.deepEqual(report.trainerBefore.worldEvents, []);
        await page.locator('[data-trainer-number=credits]').fill('1234');
        assert.equal(await page.evaluate(() => window.__ra2debug.trainer.preferences.credits), 1234);
        await page.locator('[data-trainer-number=credits]').fill('10000');
        report.trainerParameterEditing = true;
        await page.locator('[data-trainer-action=addCredits]').click();
        await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); m.setCampaignPaused(true); });
        await page.waitForFunction(() => window.__ra2debug.trainer.session.modified);
        report.trainerAfter = await page.evaluate(async () => {
            const d = window.__ra2debug; let checkpointError;
            try { await d.game.campaign.journal.capture(d.game); } catch (error) { checkpointError = error.message; }
            return { credits: d.localPlayer.credits, modified: d.game.campaign.inspectionModified, checkpointError,
                commands: d.game.campaign.journal.commands.length, status: document.querySelector('.trainer-status').textContent,
                worldEvents: window.__trainerWorldEvents };
        });
        report.trainerLayers = await page.evaluate(() => {
            const ancestors = []; let node = document.querySelector('.trainer-host');
            while (node) { const style = getComputedStyle(node); ancestors.push({ tag: node.tagName, id: node.id, class: node.className,
                z: style.zIndex, transform: style.transform, opacity: style.opacity, position: style.position, isolation: style.isolation }); node = node.parentElement; }
            return ancestors;
        });
        assert.equal(report.trainerLayers[1].tag, 'BODY');
        assert.equal(report.trainerLayers[0].position, 'fixed');
        assert.equal(report.trainerAfter.credits, report.trainerBefore.credits + 10000);
        assert(report.trainerAfter.modified && report.trainerAfter.checkpointError); assert.deepEqual(report.trainerAfter.worldEvents, []);
        assert.equal(report.trainerAfter.commands, report.trainerBefore.commands); await shot('trainer-clickable-modified-campaign');
        await page.locator('.trainer-panel-heading button').click();
        await page.waitForFunction(() => !document.querySelector('.trainer-popover') && window.__ra2debug.trainer.canUseKeys);
        report.trainerInputReturned = true;
        if (!report.pointerLock.native) {
            // The automation host rejects native pointer lock. Exercise the existing
            // locked-input path separately without presenting the fixture as OS evidence.
            await page.evaluate(() => {
                const d = window.__ra2debug, pointer = d.gameScreen.pointer, lock = pointer.getPointerLock(), v = d.gameScreen.viewport.value;
                const rect = document.querySelector('.trainer-bar button').getBoundingClientRect();
                Object.assign(pointer.getPosition(), { x: (rect.left + rect.width / 2 - (v.x ?? 0)) / v.scale,
                    y: (rect.top + rect.height / 2 - (v.y ?? 0)) / v.scale });
                const actual = lock.isActive.bind(lock), unlock = pointer.unlock.bind(pointer);
                lock.isActive = () => true; window.__fixtureHandoffs = 0;
                pointer.unlock = (...args) => { lock.isActive = actual; pointer.unlock = unlock; window.__fixtureHandoffs++; return unlock(...args); };
            });
            await page.mouse.down(); await page.mouse.up(); await page.locator('.trainer-popover').waitFor();
            report.lockedInputFixture = await page.evaluate(() => ({ mode: 'CONTROLLED_LOCK_STATE_WITH_REAL_CANVAS_MOUSE_EVENTS',
                handoffs: window.__fixtureHandoffs, worldEvents: window.__trainerWorldEvents,
                layer: getComputedStyle(document.querySelector('.trainer-host')).zIndex }));
            assert.equal(report.lockedInputFixture.handoffs, 1); assert.deepEqual(report.lockedInputFixture.worldEvents, []);
            assert.equal(report.lockedInputFixture.layer, '2000');
            await page.locator('.trainer-panel-heading button').click();
            await page.waitForFunction(() => window.__ra2debug.trainer.canUseKeys);
        }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); report.status = 'PASS_NATIVE_RESPONSIVE_CAPTIONS_AND_TRAINER';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
