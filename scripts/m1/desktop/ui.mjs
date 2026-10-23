import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkDisplayAndInput } from './input.mjs';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(`.artifacts/m1-5/ui-${Date.now()}`); await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', scope: 'Controlled native UI/input checks against a Dummy opponent; not outcome or AI evidence', errors: [], consoleErrors: [], warnings: [] };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 });
let page;
try {
    page = await app.firstWindow(); page.on('pageerror', e => result.errors.push(e.stack)); page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); if (m.type() === 'warning') result.warnings.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug; for (const k of ['conscriptHd', 'powerPlantHd', 'rhinoHd']) d.generalOptions.graphics[k].value = true;
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click(); await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const d = window.__ra2debug; window.__m15Units = d.localPlayer.getOwnedObjects().filter(u => ['HTNK', 'E2'].includes(u.name)); });
    await page.evaluate(() => {
        const r = window.__ra2debug.renderer.renderer, original = r.render;
        window.__geometryAudit = new Map();
        r.render = function(scene, ...args) {
            scene.traverse(o => {
                const g = o.geometry;
                if (!g || window.__geometryAudit.has(g.id)) return;
                const row = { id: g.id, uuid: g.uuid, type: g.type, names: [o.name, o.parent?.name, o.parent?.parent?.name],
                    vertices: g.attributes.position?.count, disposed: false, rendered: false };
                window.__geometryAudit.set(g.id, row); g.addEventListener('dispose', () => row.disposed = true);
                const before = o.onBeforeRender; o.onBeforeRender = function(...args) { row.rendered = true; return before?.apply(this, args); };
            });
            return original.call(this, scene, ...args);
        };
    });
    if (process.env.M15_LIFETIME_ONLY !== '1') {
        result.display = await checkDisplayAndInput(app, page, output);
        assert(result.display.selection.selected.includes(result.display.selection.expected));
        await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
        await page.evaluate(() => window.__ra2debug.gameScreen.pointer.lock());
        result.lockTarget = await page.evaluate(() => ({ tag: document.elementFromPoint(450, 450)?.outerHTML.slice(0, 300),
            canvas: window.__ra2debug.renderer.renderer.domElement.outerHTML.slice(0, 300) }));
        await app.evaluate(({ BrowserWindow }) => {
            const wc = BrowserWindow.getAllWindows()[0].webContents;
            wc.sendInputEvent({ type: 'mouseDown', x: 450, y: 450, button: 'left', clickCount: 1 });
            wc.sendInputEvent({ type: 'mouseUp', x: 450, y: 450, button: 'left', clickCount: 1 });
        });
        await page.waitForTimeout(500);
        result.lock = await page.evaluate(() => ({ locked: !!document.pointerLockElement, mode: window.__ra2debug.gameScreen.pointer.getUserLockMode(), focused: document.hasFocus() }));
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur());
        await page.waitForTimeout(250);
        result.blur = await page.evaluate(() => ({ locked: !!document.pointerLockElement, focused: document.hasFocus() }));
        await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
        await page.mouse.click(450, 450); await page.waitForTimeout(400);
        result.recapture = await page.evaluate(() => ({ locked: !!document.pointerLockElement, focused: document.hasFocus() }));
        await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock());
        const points = await page.evaluate(() => {
            const d = window.__ra2debug; d.unitSelection.deselectAll();
            return window.__m15Units.map(u => d.helpers.getOwnedUnitClickPointById(u.id));
        });
        const box = { x1: Math.max(5, Math.min(...points.map(p => p.x)) - 25), x2: Math.max(...points.map(p => p.x)) + 25,
            y1: Math.max(45, Math.min(...points.map(p => p.y)) - 30), y2: Math.max(...points.map(p => p.y)) + 15 };
        await page.mouse.move(box.x1, box.y1); await page.mouse.down(); await page.mouse.move(box.x2, box.y2, { steps: 12 }); await page.mouse.up();
        result.drag = await page.evaluate(() => window.__ra2debug.helpers.getSelectedUnitIds()); assert(result.drag.length > 1);
        result.panBefore = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
        const edge = await page.evaluate(() => { const d = window.__ra2debug, c = d.renderer.renderer.domElement, rect = c.getBoundingClientRect();
            return { x: rect.x + rect.width - 2, y: rect.height / 2 }; });
        await page.mouse.move(edge.x, edge.y); await page.waitForTimeout(700); await page.mouse.move(500, 400);
        result.panAfter = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
        assert.notDeepEqual(result.panBefore, result.panAfter);
        result.window = await app.evaluate(({ app, BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { pid: process.pid,
            focused: w.isFocused(), visible: w.isVisible(), hidden: app.isHidden(), fullScreenable: w.isFullScreenable(), bounds: w.getBounds() }; });
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true)); await page.waitForTimeout(5000);
        result.fullscreen = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
        await page.screenshot({ path: path.join(output, 'fullscreen.png') });
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false)); await page.waitForTimeout(1200);
        await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.pointer.unlock(); d.worldInteraction.minimapHandler.panToTile(d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV').tile);
            d.helpers.selectOwnedUnitByName('SMCV'); d.helpers.deploySelectedUnits(); });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'NACNST'), undefined, { timeout: 20000 });
        await page.waitForTimeout(1800);
        const button = await page.evaluate(() => window.__ra2debug.helpers.getSidebarTechnoClickPointByName('NAPOWR'));
        await page.mouse.click(button.x, button.y);
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 60000 });
        const buttonReady = await page.evaluate(() => window.__ra2debug.helpers.getSidebarTechnoClickPointByName('NAPOWR'));
        await page.mouse.click(buttonReady.x, buttonReady.y);
        result.sidebar = { queueReady: true, placementActivated: await page.evaluate(() => window.__ra2debug.worldInteraction.getMode().constructor.name) };
        await page.screenshot({ path: path.join(output, 'placement.png') });
    }
    result.lifetime = [];
    for (let round = 0; round < 3; round++) {
        const labels = await page.evaluate(() => {
            const d = window.__ra2debug; window.__uiPack = d.worldView.rhinoHd; window.__uiRenderer = d.renderer.renderer;
            d.gameScreen.menu.open(); return ['GUI:AbortMission', 'GUI:Quit', 'GUI:Continue', 'GUI:Back'].map(k => d.gameScreen.strings.get(k));
        });
        await page.getByText(labels[0], { exact: true }).click(); await page.getByText(labels[1], { exact: true }).click();
        await page.getByText(labels[2], { exact: true }).click({ timeout: 30000 });
        await page.getByText(labels[3], { exact: true }).click();
        await page.getByText('Offline Skirmish', { exact: true }).waitFor(); await page.waitForTimeout(300);
        result.lifetime.push(await page.evaluate(() => ({ memory: window.__uiRenderer.info.memory, programs: window.__uiRenderer.info.programs.length,
            geometriesRemaining: [...window.__geometryAudit.values()].filter(g => !g.disposed && g.rendered),
            rhinoDisposed: [...window.__uiPack.parts.values()].every(p => p.disposed && p.refs === 0), gameCleared: !window.__ra2debug.game })));
        if (round < 2) {
            await page.getByText('Offline Skirmish', { exact: true }).click(); await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
            await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
            await page.waitForTimeout(500);
        }
    }
    assert(result.lifetime.every(r => r.rhinoDisposed && r.gameCleared));
    assert.equal(result.lifetime[0].memory.textures, result.lifetime[1].memory.textures);
    assert.deepEqual(result.lifetime[1].memory, result.lifetime[2].memory);
    assert.equal(result.lifetime[0].programs, result.lifetime[1].programs);
    assert.equal(result.lifetime[1].programs, result.lifetime[2].programs);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.consoleErrors, []);
    result.physicalGates = result.lock?.locked && !result.blur?.locked && result.recapture?.locked && result.fullscreen ? 'AUTOMATED_PASS_USER_REVIEW_PENDING' : 'USER_CHECK_REQUIRED';
    result.status = 'PASS_BOUNDED_UI_AND_LIFETIME';
} catch (error) { process.exitCode = 1; result.error = error.stack; console.error(error); await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); await app.close(); console.log('OUTPUT', output); }
