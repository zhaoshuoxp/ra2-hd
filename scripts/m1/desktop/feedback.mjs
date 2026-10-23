import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2]));
const hd = process.argv[3] !== 'original';
const output = path.resolve(`.artifacts/m1-5/feedback-${hd ? 'hd' : 'original'}-${Date.now()}`);
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', hd, errors: [], consoleErrors: [] };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
    await page.getByText('Options', { exact: true }).click();
    const select = page.getByRole('combobox', { name: 'Display resolution' });
    await select.waitFor();
    result.display = [];
    for (const id of ['1920x1080', '2560x1440', 'fullscreen', '1920x1080']) {
        if (!(await select.locator(`option[value="${id}"]`).count())) continue;
        await select.selectOption(id);
        await page.waitForTimeout(id === 'fullscreen' ? 7000 : 1500);
        const state = await page.evaluate(async () => ({ ...await window.desktopDisplay.get(),
            pixels: JSON.parse(document.querySelector('canvas[data-render-output]').dataset.renderOutput),
            error: document.querySelector('[role=alert]')?.textContent }));
        result.display.push({ requested: id, ...state });
        await page.screenshot({ path: path.join(output, `options-${id}.png`) });
        {
            assert.equal(state.id, id);
            assert.deepEqual(state.pixels.effective, [state.width, state.height]);
        }
    }
    const backLabel = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
    await page.getByText(backLabel, { exact: true }).click();
    await page.evaluate(hd => {
        const d = window.__ra2debug; window.__coverageHd = hd;
        for (const k of ['conscriptHd', 'powerPlantHd', 'rhinoHd']) d.generalOptions.graphics[k].value = hd;
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    }, hd);
    await page.getByText('Offline Skirmish', { exact: true }).click();
    const checkbox = page.locator('input[name=shortGame]');
    const before = await checkbox.evaluate(e => ({ checked: e.checked, image: getComputedStyle(e).backgroundImage }));
    await checkbox.click();
    const after = await checkbox.evaluate(e => ({ checked: e.checked, image: getComputedStyle(e).backgroundImage }));
    assert.notEqual(before.checked, after.checked); assert.notEqual(before.image, after.image);
    assert(before.image.startsWith('url(')); assert(after.image.startsWith('url('));
    result.checkbox = { originalGraphicsLoaded: true, toggles: true };
    await checkbox.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(output, 'lobby.png') });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.waitForTimeout(1000);
    result.speed = [];
    for (const speed of [4, 8]) {
        await page.evaluate(speed => { window.__ra2debug.game.desiredSpeed.value = speed; }, speed);
        await page.waitForTimeout(400);
        const before = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, time: performance.now() }));
        await page.waitForTimeout(5000);
        const after = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, time: performance.now() }));
        result.speed.push({ speed, ticksPerSecond: (after.tick - before.tick) / ((after.time - before.time) / 1000) });
    }
    assert(result.speed[1].ticksPerSecond > result.speed[0].ticksPerSecond * 1.5);
    await page.evaluate(() => { const d = window.__ra2debug; d.gameAnimationLoop?.stop?.(); d.gameScreen.gameAnimationLoop.stop(); });
    result.render = await page.evaluate(() => {
        const d = window.__ra2debug, units = d.localPlayer.getOwnedObjects().filter(u => u.name === 'E2');
        const materials = [];
        d.worldScene.scene.traverse(o => { if (o.material?.uniforms?.hdPass) materials.push({ type: o.material.type, indexed: 'INDEXED_COVERAGE' in (o.material.defines ?? {}), pass: o.material.uniforms.hdPass.value }); });
        return { units: units.map(u => ({ id: u.id, point: d.helpers.getOwnedUnitClickPointById(u.id) })), materials,
            output: JSON.parse(d.renderer.renderer.domElement.dataset.renderOutput) };
    });
    await page.screenshot({ path: path.join(output, 'game.png') });
    result.coverage = await page.evaluate(() => {
        const d = window.__ra2debug;
        const units = d.localPlayer.getOwnedObjects().filter(u => u.name === 'E2');
        const builder = d.renderableManager.getRenderableByGameObject?.(units[0])?.shpRenderable?.builder;
        const rows = [];
        d.worldScene.scene.traverse(o => {
            const m = o.material;
            if (!m?.uniforms?.hdPass) return;
            if ((window.__coverageHd && m.uniforms.hdMinFootprint.value > 1) || (!window.__coverageHd && 'INDEXED_COVERAGE' in (m.defines ?? {}))) rows.push(m);
        });
        window.__coverageMaterials = [...new Set(rows)];
        return { count: window.__coverageMaterials.length, tick: d.game.currentTick };
    });
    assert(result.coverage.count > 0);
    await page.evaluate(hd => {
        for (const m of window.__coverageMaterials) {
            if (hd) m.uniforms.hdMinFootprint.value = 1;
            else m.uniforms.hdFiltering.value = false;
        }
        window.__ra2debug.renderer.render();
    }, hd);
    await page.screenshot({ path: path.join(output, 'same-frame-before.png') });
    const point = result.render.units[0].point;
    const clip = { x: Math.max(0, point.x - 60), y: Math.max(0, point.y - 70), width: 140, height: 100 };
    await page.screenshot({ path: path.join(output, 'conscript-before.png'), clip });
    await page.evaluate(hd => {
        for (const m of window.__coverageMaterials) {
            if (hd) m.uniforms.hdMinFootprint.value = 4;
            else m.uniforms.hdFiltering.value = true;
        }
        window.__ra2debug.renderer.render();
    }, hd);
    await page.screenshot({ path: path.join(output, 'same-frame-after.png') });
    await page.screenshot({ path: path.join(output, 'conscript-after.png'), clip });
    await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
    await page.waitForTimeout(800);
    const point4k = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.renderer.update(performance.now(), 0); d.renderer.render();
        const unit = d.localPlayer.getOwnedObjects().find(u => u.name === 'E2');
        return d.helpers.getOwnedUnitClickPointById(unit.id);
    });
    const clip4k = { x: Math.max(0, point4k.x - 60), y: Math.max(0, point4k.y - 70), width: 140, height: 100 };
    for (const enabled of [false, true]) {
        await page.evaluate(({ hd, enabled }) => {
            for (const m of window.__coverageMaterials) {
                if (hd) m.uniforms.hdMinFootprint.value = enabled ? 4 : 1;
                else m.uniforms.hdFiltering.value = enabled;
            }
            window.__ra2debug.renderer.render();
        }, { hd, enabled });
        await page.screenshot({ path: path.join(output, `conscript-4k-${enabled ? 'after' : 'before'}.png`), clip: clip4k });
    }
    result.nativeOutput = await page.evaluate(() => JSON.parse(window.__ra2debug.renderer.renderer.domElement.dataset.renderOutput));
    assert.equal(result.errors.length, 0);
    assert(!result.consoleErrors.some(s => /shader|WebGL|GL_INVALID/i.test(s)));
    result.status = 'PASS';
} catch (error) { result.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(output); await app.close(); }
