import assert from 'node:assert/strict';

export async function checkDisplayInput(page, result = {}) {
    result.physicalInput = false;
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock());
    const points = await page.evaluate(() => {
        const d = window.__ra2debug; d.unitSelection.deselectAll();
        return window.__m11Units.map(u => d.helpers.getOwnedUnitClickPointById(u.id));
    });
    const box = [Math.min(...points.map(p => p.x)) - 25, Math.min(...points.map(p => p.y)) - 30,
        Math.max(...points.map(p => p.x)) + 25, Math.max(...points.map(p => p.y)) + 15];
    await page.mouse.move(box[0], box[1]); await page.mouse.down();
    await page.mouse.move(box[2], box[3], { steps: 10 }); await page.mouse.up();
    result.dragSelection = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(),
        expected: window.__m11Units.map(u => u.id) }));
    assert(result.dragSelection.expected.every(id => result.dragSelection.selected.includes(id)), 'Drag selection missed units');
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.lock());
    await page.mouse.click(box[2], box[3]);
    await page.waitForFunction(() => !!document.pointerLockElement);
    result.lock = await page.evaluate(() => {
        const p = window.__ra2debug.gameScreen.pointer;
        window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
        const before = { ...p.getPosition() };
        // Explicit synthetic relative-event probe while browser Pointer Lock is active.
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: 12, movementY: -6 }));
        return { before, after: { ...p.getPosition() }, sprite: p.getSprite().isVisible(), active: !!document.pointerLockElement };
    });
    assert(Math.abs(result.lock.after.x - result.lock.before.x - 10) < 0.001);
    assert(Math.abs(result.lock.after.y - result.lock.before.y + 5) < 0.001);
    assert(result.lock.active);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => Math.abs(window.__ra2debug.renderer.getCanvas().getBoundingClientRect().height - 800) < 0.01);
    result.lock.resized = await page.evaluate(() => {
        const p = window.__ra2debug.gameScreen.pointer, before = { ...p.getPosition() };
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: 8, movementY: -4 }));
        return { before, after: { ...p.getPosition() }, active: !!document.pointerLockElement };
    });
    assert(result.lock.resized.active);
    assert(Math.abs(result.lock.resized.after.x - result.lock.resized.before.x - 9) < 0.001);
    assert(Math.abs(result.lock.resized.after.y - result.lock.resized.before.y + 4.5) < 0.001);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => Math.abs(window.__ra2debug.renderer.getCanvas().getBoundingClientRect().height - 1080) < 0.01);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k'; });
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.mouse.click(960, 540);
    await page.waitForFunction(() => !!document.pointerLockElement);
    result.lock.reacquiredAfterLoss = true;
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock());
    await page.evaluate(() => document.documentElement.requestFullscreen());
    await page.waitForFunction(() => !!document.fullscreenElement);
    result.fullscreen = await page.evaluate(() => window.__m14.capture('1440p'));
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k'; });
    const other = await page.context().newPage(); await other.goto('about:blank'); await other.bringToFront();
    await page.bringToFront(); await other.close();
    await page.waitForFunction(() => document.hasFocus());
    const target = await page.evaluate(() => {
        const d = window.__ra2debug; d.unitSelection.deselectAll();
        return d.helpers.getOwnedUnitClickPointById(window.__m11Units[0].id);
    });
    await page.mouse.click(target.x, target.y - 8);
    result.focusRecovered = await page.evaluate(() => window.__ra2debug.helpers.getSelectedUnitIds().includes(window.__m11Units[0].id));
    assert(result.focusRecovered);
    // Enable the radar display only in this harness; no retail radar/production rules are changed.
    const radarPoint = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.unitSelection.deselectAll();
        window.__m14SavedPan = d.worldScene.cameraPan.getPan();
        Object.defineProperty(d.gameScreen.sidebarModel, 'radarEnabled', { configurable: true, get: () => true });
        const radar = d.gameScreen.hud.sidebarRadar;
        radar.coverOpen = true; radar.toggleCover(true, true);
        d.uiScene.update(performance.now()); d.renderer.render();
        const mesh = d.minimap.mesh, p = mesh.position.clone().set(0, 0, 0).applyMatrix4(mesh.matrixWorld)
            .project(d.uiScene.getCamera());
        const canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
        return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
    });
    await page.mouse.click(radarPoint.x + 12, radarPoint.y + 10);
    result.minimap = await page.evaluate(() => {
        const d = window.__ra2debug, before = window.__m14SavedPan, after = d.worldScene.cameraPan.getPan();
        delete d.gameScreen.sidebarModel.radarEnabled;
        d.worldScene.cameraPan.setPan(before);
        return { before, after, fixture: 'Harness-only radar visibility override; restored' };
    });
    assert.notDeepEqual(result.minimap.before, result.minimap.after, 'Minimap click did not pan');
    // Actual sidebar input queues native production and enters the actual placement preview.
    const sidebar = await page.evaluate(() => window.__ra2debug.helpers.getSidebarTechnoClickPointByName('GAPOWR'));
    await page.mouse.click(sidebar.x, sidebar.y);
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 60000 });
    await page.mouse.click(sidebar.x, sidebar.y);
    await page.mouse.move(1100, 600);
    await page.waitForTimeout(250);
    result.placement = await page.evaluate(() => {
        const d = window.__ra2debug, mode = d.gameScreen.playerUi.placementMode;
        return { building: mode.getBuilding()?.name, active: d.worldInteraction.getMode() === mode,
            previewVisible: mode.placementGridModel.visible, previewTiles: mode.placementGridModel.tiles.length,
            pointer: { ...d.gameScreen.pointer.getPosition() } };
    });
    assert.equal(result.placement.building, 'GAPOWR');
    assert(result.placement.active && result.placement.previewVisible && result.placement.previewTiles > 0);
    await page.mouse.click(1100, 600, { button: 'right' });
    return result;
}
