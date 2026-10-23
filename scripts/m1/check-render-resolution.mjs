import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkRenderResolutionMenu(page, output) {
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 45000 });
    await page.getByText('Options', { exact: true }).click();
    const select = page.locator('.render-resolution-select');
    await select.locator('.select-value').click();
    await select.getByText('High (2160 high)', { exact: true }).click();
    await page.mouse.move(50, 50);
    await page.screenshot({ path: `${output}/4k-settings.png` });
    const layout = await page.locator('.general-opts').evaluate(el => ({
        clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        overflow: getComputedStyle(el).overflowY,
        contained: el.getBoundingClientRect().bottom <= el.parentElement.getBoundingClientRect().bottom + 1,
    }));
    assert(layout.contained && layout.overflow === 'auto');
    const outputText = await page.locator('.render-output').innerText();
    assert(outputText.includes('3840 x 2160'));
    const menuCursor = await page.locator('#ra2web-root').evaluate(el => getComputedStyle(el).cursor);
    assert(menuCursor.includes('data:image/png') && menuCursor.includes('0 0'));
    await page.setViewportSize({ width: 800, height: 600 });
    await page.screenshot({ path: `${output}/narrow-settings.png` });
    const narrow = await select.boundingBox();
    assert(narrow.x >= 0 && narrow.x + narrow.width <= 800 && narrow.y + narrow.height <= 600);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => document.documentElement.requestFullscreen());
    await select.locator('.select-value').click();
    await select.getByText('High (2160 high)', { exact: true }).last().click();
    await page.evaluate(() => document.exitFullscreen());
    const back = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
    await page.getByText(back, { exact: true }).click();
    await page.reload();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 45000 });
    const persisted = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.renderResolution.value);
    assert.equal(persisted, '4k');
    return { selectedThroughUi: true, persistedAfterReload: persisted, layout, narrow, outputText, menuCursor, fullscreenSelectable: true };
}

export async function checkRenderResolutionMatch(page, output) {
    const samples = await page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer.renderer, canvas = renderer.domElement;
        const setting = d.generalOptions.graphics.renderResolution;
        const unit = window.__m11Units[0], r = d.renderableManager.getRenderableByGameObject(unit);
        const camera = d.worldScene.camera, point = d.helpers.getOwnedUnitClickPointById(unit.id);
        const rect = canvas.getBoundingClientRect();
        const samples = [];
        for (const mode of ['original', '720p', '1080p', '1440p', 'native', '4k']) {
            setting.value = mode;
            d.renderer.render();
            samples.push({ mode, tick: d.game.currentTick, frame: r.shpRenderable.builder.getFrame(),
                buffer: [canvas.width, canvas.height], ratio: renderer.getPixelRatio(),
                logical: [canvas.dataset.logicalWidth, canvas.dataset.logicalHeight],
                camera: [camera.left, camera.right, camera.top, camera.bottom, camera.zoom],
                body: Array.from(r.shpRenderable.getShapeMesh().geometry.attributes.position.array),
                point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                viewport: Array.from(renderer.getContext().getParameter(renderer.getContext().VIEWPORT)),
                png: ['original', '4k'].includes(mode) ? canvas.toDataURL('image/png') : undefined,
                glError: renderer.getContext().getError() });
        }
        return samples;
    });
    const baseline = samples[0];
    const expected = { original: [1920, 1080], '720p': [1280, 720], '1080p': [1920, 1080],
        '1440p': [2560, 1440], native: [3840, 2160], '4k': [3840, 2160] };
    for (const sample of samples) {
        assert.deepEqual(sample.buffer, expected[sample.mode]);
        for (const key of ['tick', 'frame', 'logical', 'camera', 'body', 'point', 'rect']) {
            assert.deepEqual(sample[key], baseline[key], `${key} changed at ${sample.mode}`);
        }
        assert.equal(sample.glError, 0);
        if (sample.png) {
            await fs.writeFile(`${output}/same-frame-${sample.mode}.png`, Buffer.from(sample.png.split(',')[1], 'base64'));
            delete sample.png;
        }
    }
    // Real browser input after a buffer-only change must hit the same logical unit.
    const target = await page.evaluate(() => {
        const d = window.__ra2debug; d.unitSelection.deselectAll();
        return d.helpers.getOwnedUnitClickPointById(window.__m11Units[0].id);
    });
    await page.mouse.click(target.x, target.y - 8);
    const selection = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(), expected: window.__m11Units[0].id }));
    assert(selection.selected.includes(selection.expected), '4K selection missed');
    const panBefore = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
    await page.mouse.move(1918, 540);
    await page.waitForTimeout(500);
    const panAfter = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
    await page.mouse.move(960, 540);
    assert.notDeepEqual(panBefore, panAfter, 'Right-edge map scroll did not move at 4K');
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(300);
    const resized = await page.evaluate(() => {
        const r = window.__ra2debug.renderer.renderer;
        return { buffer: [r.domElement.width, r.domElement.height], ratio: r.getPixelRatio(),
            logical: [r.domElement.dataset.logicalWidth, r.domElement.dataset.logicalHeight] };
    });
    assert.deepEqual(resized.buffer, [2880, 2160]);
    assert.deepEqual(resized.logical, ['1200', '900']);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    return { samples, selection, edgeScroll: { panBefore, panAfter }, resized };
}
