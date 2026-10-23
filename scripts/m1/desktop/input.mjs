import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function checkDisplayAndInput(app, page, output) {
    const report = { comparisons: [] };
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus(); });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.pointer.unlock(); d.gameScreen.gameAnimationLoop.stop(); });
    for (const preset of ['1080p', '4k', 'native']) {
        const row = await page.evaluate(preset => {
            const d = window.__ra2debug; d.generalOptions.graphics.renderResolution.value = preset;
            d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            const r = d.renderer.renderer, c = r.domElement, rect = c.getBoundingClientRect(), camera = d.worldScene.camera;
            const text = d.gameScreen.hud.sidebarCredits.text;
            return { preset, tick: d.game.currentTick, css: [rect.width, rect.height], buffer: [c.width, c.height], dpr: devicePixelRatio,
                logical: [c.dataset.logicalWidth, c.dataset.logicalHeight], ratio: r.getPixelRatio(), camera: camera.projectionMatrix.toArray(),
                position: camera.position.toArray(), viewport: d.worldScene.viewport,
                points: window.__m15Units.filter(u => !u.isDestroyed).map(u => d.helpers.getOwnedUnitClickPointById(u.id)),
                hd: [d.conscriptHd, d.powerPlantHd, d.rhinoHd], text: [text.ctx.canvas.width, text.ctx.canvas.height],
                gl: r.getContext().getError(), png: c.toDataURL() };
        }, preset);
        await fs.writeFile(`${output}/same-scale-${preset}.png`, Buffer.from(row.png.split(',')[1], 'base64')); delete row.png;
        report.comparisons.push(row);
        assert.equal(row.logical[1], '900'); assert.equal(row.gl, 0);
        if (report.comparisons.length > 1) for (const key of ['css', 'logical', 'camera', 'position', 'viewport', 'points', 'hd', 'tick'])
            assert.deepEqual(row[key], report.comparisons[0][key], `${key} changed with output`);
    }
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    // The existing helper already maps presentation coordinates into CSS pixels.
    const target = await page.evaluate(() => {
        const d = window.__ra2debug, u = window.__m15Units.find(u => u.name === 'HTNK'), r = d.renderer.renderer.domElement;
        const p = d.helpers.getOwnedUnitClickPointById(u.id), rect = r.getBoundingClientRect();
        d.unitSelection.deselectAll();
        return { id: u.id, x: p.x, y: p.y - 5 };
    });
    await page.mouse.click(target.x, target.y); await page.waitForTimeout(300);
    report.selection = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(), locked: !!document.pointerLockElement }));
    // Recovery click may only acquire lock. Use the native pointer's current logical location for a second click.
    if (!report.selection.selected.includes(target.id)) { await page.mouse.click(target.x, target.y); await page.waitForTimeout(200);
        report.selection = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(), locked: !!document.pointerLockElement })); }
    report.selection.expected = target.id;
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    const labels = await page.evaluate(() => { const s = window.__ra2debug.gameScreen.strings; return { options: s.get('GUI:Options'), back: s.get('GUI:Back'), resume: s.get('GUI:ResumeMission') }; });
    await page.getByText(labels.options, { exact: true }).click();
    report.cursor = await page.locator('#ra2web-root').evaluate(el => getComputedStyle(el).cursor);
    assert(report.cursor.includes('data:image/png') && report.cursor.includes('0 0'));
    const speed = page.locator('input[name="gameSpeed"]');
    const tick = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await speed.focus(); await speed.press('End');
    await page.waitForTimeout(400); assert.equal(await page.evaluate(() => window.__ra2debug.game.currentTick), tick);
    report.pausedSpeed = await speed.inputValue();
    // Exercise live Rhino restoration while both SHP families stay bound to this match.
    for (const value of ['Original', 'HD', 'Original', 'HD']) {
        const row = page.locator('[data-hd-family="rhino"]');
        await row.locator('.select-value').click(); await row.getByText(value, { exact: true }).click();
    }
    await page.screenshot({ path: `${output}/paused-options.png` });
    await page.getByText(labels.back, { exact: true }).click();
    // GameMenu.close is the same ordinary Resume action used by its menu button.
    await page.getByText(labels.resume, { exact: true }).click();
    await page.waitForTimeout(350);
    report.resume = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick, speed: window.__ra2debug.game.desiredSpeed.value,
        rhino: window.__m15Units.filter(u => u.name === 'HTNK').map(u => window.__ra2debug.renderableManager.getRenderableByGameObject(u).rhinoHd.active) }));
    assert(report.resume.tick > tick); assert(report.resume.rhino.every(Boolean));
    const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1120, 820); });
    await page.waitForTimeout(350);
    report.resized = await page.evaluate(() => { const c = window.__ra2debug.renderer.renderer.domElement; return { logical: [c.dataset.logicalWidth, c.dataset.logicalHeight], buffer: [c.width, c.height] }; });
    assert.equal(report.resized.logical[1], '900');
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), bounds);
    await page.waitForTimeout(350);
    return report;
}
