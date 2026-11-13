import assert from 'node:assert/strict';

async function settle(page, frames = 80) {
    return page.evaluate(async frames => {
        const d = window.__ra2debug, s = d.gameScreen;
        s.gameAnimationLoop.stop(); s.gameTurnMgr.setPaused(true);
        d.renderer.setVehicleShadowInstancing(true);
        for (let i = 0; i < frames; i++) {
            d.renderer.update(1000 + d.game.currentTick * 20, 0); d.renderer.render();
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        return d.renderer.vehicleShadowDiagnostics();
    }, frames);
}

async function state(page) {
    return page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), world: g.debugGetState() }; });
}

async function compare(page) {
    return page.evaluate(async () => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        const capture = () => {
            d.renderer.render(); const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
        };
        d.renderer.setVehicleShadowInstancing(false); const off = capture();
        d.renderer.setVehicleShadowInstancing(true); const on = capture();
        let differentBytes = 0;
        for (let i = 0; i < off.length; i++) if (off[i] !== on[i]) differentBytes++;
        const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(b => b.toString(16).padStart(2, '0')).join('');
        return { differentBytes, baselineSha256: await digest(off), candidateSha256: await digest(on),
            batches: d.renderer.vehicleShadowDiagnostics(), glError: gl.getError() };
    });
}

async function step(page, count, enabled) {
    return page.evaluate(({ count, enabled }) => {
        const d = window.__ra2debug, s = d.gameScreen;
        d.renderer.setVehicleShadowInstancing(enabled); s.gameTurnMgr.setPaused(false);
        try {
            for (let i = 0; i < count; i++) {
                if (!s.gameTurnMgr.doGameTurn(performance.now())) throw Error('Native continuation turn refused');
                d.renderer.update(1000 + d.game.currentTick * 20, 0); d.renderer.render();
            }
        } finally { s.gameTurnMgr.setPaused(true); }
    }, { count, enabled });
}

async function freezeNext(page) {
    await page.evaluate(() => {
        const raf = requestAnimationFrame; window.__m4LifecycleFreeze = true;
        window.requestAnimationFrame = function(callback) {
            const d = window.__ra2debug, s = d?.gameScreen;
            if (window.__m4LifecycleFreeze && d?.game?.status === 1 && s?.gameAnimationLoop) {
                window.__m4LifecycleFreeze = false; s.gameAnimationLoop.stop(); s.gameTurnMgr.setPaused(true); return 0;
            }
            return raf.call(window, callback);
        };
    });
}

export async function runShadowSaveLifecycle(initialPage, { restart, edition, labels, checkpoint }) {
    let page = initialPage;
    const result = { schema: 'm4-3a-shadow-save-lifecycle-v1', status: 'RUNNING' };
    const progress = async stage => { result.stage = stage; await checkpoint?.(result); console.log(JSON.stringify({ stage })); };
    result.initialBatches = await settle(page);
    assert(result.initialBatches.instances > 0);
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['hd:savegame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor();
    await page.getByTestId('skirmish-saves').locator('input').fill('M4.3a vehicle shadow checkpoint');
    await page.locator('[data-action=SaveGame]').click();
    await page.locator('[data-action=AcknowledgeSave]').waitFor();
    result.saved = await state(page);
    await progress('shadow-native-save-created');
    await page.locator('[data-action=AcknowledgeSave]').click();
    await page.locator('[data-action=CloseSaves]').click();
    const resume = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('GUI:ResumeMission'));
    await page.getByRole('button', { name: resume, exact: true }).click();
    await step(page, 24, false); result.baselineContinuation = await state(page);
    await progress('shadow-off-native-continuation');
    page = await restart(); result.processRestarted = true;
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController);
    await freezeNext(page);
    await page.getByRole('button', { name: labels['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').waitFor();
    await page.locator('[data-action=LoadGame]').click();
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && !window.__m4LifecycleFreeze,
        undefined, { timeout: 180000 });
    result.restored = await state(page);
    assert.deepEqual(result.restored, result.saved, 'Full available native state after process restart');
    await progress('shadow-native-save-restored');
    result.rebuiltBatches = await settle(page);
    assert(result.rebuiltBatches.instances > 0);
    result.loadedPixels = await compare(page); assert.equal(result.loadedPixels.differentBytes, 0);
    await step(page, 24, true); result.candidateContinuation = await state(page);
    assert.deepEqual(result.candidateContinuation, result.baselineContinuation, 'Off/on native continuation at the same tick');
    await progress('shadow-on-native-continuation-matches');
    result.continuedPixels = await compare(page); assert.equal(result.continuedPixels.differentBytes, 0);
    const quitLabels = await page.evaluate(() => { const d = window.__ra2debug;
        window.__m4RetainedRenderer = d.renderer; d.gameScreen.menu.open();
        return { abort: d.gameScreen.strings.get('GUI:AbortMission'), quit: d.gameScreen.strings.get('GUI:Quit'),
            continue: d.gameScreen.strings.get('GUI:Continue') }; });
    await page.getByRole('button', { name: quitLabels.abort, exact: true }).click();
    await page.getByRole('button', { name: quitLabels.quit, exact: true }).click();
    await page.getByRole('button', { name: quitLabels.continue, exact: true }).click();
    await page.waitForFunction(() => !window.__ra2debug?.game && window.__ra2debug?.mainMenuController);
    await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
    await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    result.menuRelease = await page.evaluate(() => window.__m4RetainedRenderer.vehicleShadowDiagnostics());
    assert.equal(result.menuRelease.ownedBatches, 0); assert.equal(result.menuRelease.registered, 0);
    await progress('shadow-menu-release');
    await freezeNext(page);
    await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && !window.__m4LifecycleFreeze,
        undefined, { timeout: 180000 });
    result.newMatchBatches = await settle(page);
    assert(result.newMatchBatches.instances > 0, 'New native match must rebuild vehicle instances');
    result.newMatchPixels = await compare(page); assert.equal(result.newMatchPixels.differentBytes, 0);
    assert.equal(result.newMatchPixels.batches.preparationErrors, 0);
    result.status = 'PASS_SAVE_RESTART_CONTINUATION_RELEASE_AND_NEW_MATCH';
    return result;
}
