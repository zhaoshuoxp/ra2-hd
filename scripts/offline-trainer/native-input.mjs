import assert from 'node:assert/strict';
import path from 'node:path';
export async function validateTrainerInput(page, app, report, out, locale) {
    const r = report.trainer.input = {};
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.trainer.releaseInput(); d.gameScreen.pointer.unlock();
        d.game.speed.value = d.game.desiredSpeed.value = Number.EPSILON;
        document.activeElement?.blur();
    });
    r.keyboard = await page.evaluate(() => {
        const d = window.__ra2debug, t = d.trainer, s = t.session, keyboard = d.gameScreen.playerUi.worldInteraction.keyboardHandler;
        const checks = [], check = (ok, msg) => { if (!ok) throw Error(msg); checks.push(msg); };
        const event = (options = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Digit1', key: '!', keyCode: 49, ctrlKey: true, shiftKey: true, ...options }));
        t.setEnabled(false); const credits = d.localPlayer.credits;
        keyboard.executeCommand('FreeMoney'); keyboard.executeCommand('BuildCheat'); keyboard.executeCommand('ToggleShroud'); event();
        check(s.pending === 0 && d.localPlayer.credits === credits, 'Old/new shortcuts blocked OFF');
        t.setEnabled(true); event({ repeat: true }); event({ isComposing: true }); check(s.pending === 0, 'Repeat and IME suppressed');
        keyboard.executeCommand('FreeMoney'); keyboard.executeCommand('BuildCheat'); keyboard.executeCommand('ToggleShroud');
        check(s.pending === 3, 'All three legacy shortcuts enter validated queue ON');
        t.send({ type: 'reset' }); event(); check(s.pending === 1, 'Default Ctrl+Shift+1 routes to dispatcher');
        t.send({ type: 'reset' });
        const before = t.preferences.bindings.heal;
        check(!t.setBinding('heal', 1) && t.preferences.bindings.heal === before, 'Conflicting binding rejected without replacing user setting');
        t.setBinding('addCredits', undefined); t.setBinding('ready', 1); event();
        check(s.queue[0].command.type === 'ready', 'Remapped shortcut dispatches chosen action');
        t.send({ type: 'reset' }); t.setBinding('ready', undefined); t.setBinding('addCredits', 1);
        const own = window.trainerFixture.own;
        d.game.getUnitSelection().deselectAll?.(); d.game.getUnitSelection().addToSelection(own);
        return checks;
    });
    await page.getByRole('button', { name: locale['trainer:economy'], exact: true }).click();
    const field = page.locator('.trainer-popover input[type=number]').first();
    await field.focus(); await page.keyboard.press('Control+Shift+1');
    assert.equal(await page.evaluate(() => window.__ra2debug.trainer.session.pending), 0);
    r.textFocus = 'PASS_NUMERIC_INPUT_NO_SHORTCUT';
    await field.fill('-1'); await page.locator('[data-trainer-action=addCredits]').click();
    assert.equal(await page.evaluate(() => window.__ra2debug.trainer.session.pending), 0);
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    await field.fill('10000'); r.invalidVisibleInput = 'PASS_REJECTED_WITHOUT_USING_STALE_VALID_VALUE';
    await page.getByRole('button', { name: locale['trainer:close'], exact: true }).click();
    await page.getByRole('button', { name: locale['trainer:targets'], exact: true }).click();
    await page.locator('[data-trainer-action=heal]').click();
    r.selection = await page.evaluate(() => {
        const t = window.__ra2debug.trainer, target = t.session.queue[0]?.command.targets?.[0];
        return { retained: target === window.trainerFixture.own, selected: window.__ra2debug.game.getUnitSelection().getSelectedUnits().map(o => o.id), pending: t.session.pending };
    });
    assert(r.selection.retained); assert.equal(r.selection.pending, 1);
    await page.getByRole('button', { name: locale['trainer:close'], exact: true }).click();
    r.targeting = await page.evaluate(() => {
        const d = window.__ra2debug, t = d.trainer, f = window.trainerFixture, g = d.game;
        t.send({ type: 'reset' }); g.changeObjectOwner(f.target, g.getCombatants().find(p => p !== d.localPlayer));
        const wi = d.gameScreen.playerUi.worldInteraction;
        t.run('transfer'); const mode = wi.getMode();
        const active = t.targeting && !!mode;
        mode.execute({ gameObject: f.target, tile: f.target.tile }, false);
        const queuedExactTarget = t.session.queue[0]?.command.targets?.[0] === f.target;
        g.update(); const transferred = f.target.owner === d.localPlayer;
        t.run('transfer'); t.setEnabled(false);
        return { active, queuedExactTarget, transferred, cancelledOff: !t.targeting && !wi.getMode(), inputReleased: !wi.keyboardHandler.isPaused };
    });
    assert(Object.values(r.targeting).every(Boolean));
    await page.evaluate(() => window.__ra2debug.trainer.setEnabled(true));
    await page.getByRole('button', { name: locale['trainer:targets'], exact: true }).click();
    await page.evaluate(() => {
        const d = window.__ra2debug, target = window.trainerFixture.target;
        d.worldScene.cameraPan.setPan(d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper.computeCameraPanFromTile(target.tile.rx, target.tile.ry));
    });
    await page.waitForTimeout(150);
    const point = await page.evaluate(() => {
        const d = window.__ra2debug, target = window.trainerFixture.target;
        const point = d.helpers.getOwnedUnitClickPointById(target.id);
        d.game.changeObjectOwner(target, d.game.getCombatants().find(p => p !== d.localPlayer));
        return point;
    });
    await page.locator('[data-trainer-action=transfer]').click();
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock());
    await page.mouse.move(point.x, point.y - 8); await page.mouse.click(point.x, point.y - 8);
    r.mouseCapture = await page.evaluate(() => {
        const d = window.__ra2debug, target = window.trainerFixture.target;
        const queuedExactTarget = d.trainer.session.queue[0]?.command.targets?.[0] === target;
        d.game.update(); return { queuedExactTarget, transferred: target.owner === d.localPlayer };
    });
    assert(Object.values(r.mouseCapture).every(Boolean));
    r.unfocusedGuard = await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(document, 'hasFocus');
        const before = window.__ra2debug.trainer.session.pending;
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
        try {
            document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'Digit1', keyCode: 49, ctrlKey: true, shiftKey: true }));
            return { blocked: window.__ra2debug.trainer.session.pending === before, category: 'RENDERER_FOCUS_STATE_FIXTURE',
                physicalAppSwitch: 'UNVERIFIED: automation retained document focus during attempted native window changes' };
        } finally {
            if (descriptor) Object.defineProperty(document, 'hasFocus', descriptor);
            else delete document.hasFocus;
        }
    });
    assert(r.unfocusedGuard.blocked);
    // Same view and simulation tick at three output sampling densities.
    r.outputs = [];
    for (const preset of ['1080p', '1440p', '4k']) {
        await page.evaluate(preset => { const d = window.__ra2debug; d.generalOptions.graphics.renderResolution.value = preset; d.renderer.render(); }, preset);
        await page.waitForTimeout(100);
        const value = await page.evaluate(() => {
            const d = window.__ra2debug, camera = d.worldScene.camera;
            return { tick: d.game.currentTick, logical: d.gameScreen.viewport.value, canvas: [d.renderer.getCanvas().width, d.renderer.getCanvas().height],
                camera: { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, zoom: camera.zoom },
                bar: [document.querySelector('.trainer-bar').offsetWidth, document.querySelector('.trainer-bar').offsetHeight], gl: d.renderer.renderer.getContext().getError() };
        });
        r.outputs.push({ preset, ...value });
        await page.screenshot({ path: path.join(out, `trainer-${preset}.png`) });
    }
    for (const row of r.outputs) {
        assert.equal(row.tick, r.outputs[0].tick); assert.deepEqual(row.logical, r.outputs[0].logical);
        assert.deepEqual(row.camera, r.outputs[0].camera); assert.deepEqual(row.bar, r.outputs[0].bar); assert.equal(row.gl, 0);
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: locale['trainer:powers'], exact: true }).click();
    r.fullscreen = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
    assert(r.fullscreen); await page.screenshot({ path: path.join(out, 'trainer-fullscreen.png') });
    const close = page.getByRole('button', { name: locale['trainer:close'], exact: true });
    if (await close.count()) await close.click();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await page.evaluate(() => { const d = window.__ra2debug; d.generalOptions.graphics.renderResolution.value = '1080p'; d.game.speed.value = d.game.desiredSpeed.value = 6; });
}
