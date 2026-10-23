import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';
import { checkDisplayInput } from './check-display-input.mjs';

export async function runDisplayReview(page, output) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', environment: 'macOS Chrome automation; browser emulation, no physical certification',
        matrix: [], comparisons: [], interactions: {} };
    const cdp = await page.context().newCDPSession(page);
    async function saveCapture(capture, name) {
        if (capture.png) {
            await fs.writeFile(`${output}/${name}.png`, Buffer.from(capture.png.split(',')[1], 'base64'));
            delete capture.png; capture.file = `${name}.png`;
        }
        return capture;
    }
    async function metrics(width, height, dpr) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.uiScene.update(performance.now());
            d.worldScene.updateCamera(d.worldScene.cameraPan.getPan(), d.worldScene.camera.zoom);
            d.worldScene.scene.updateMatrixWorld(true);
        });
    }
    try {
        await page.evaluate(installDisplayProbe);
        await page.evaluate(() => {
            const d = window.__ra2debug; d.unitSelection.deselectAll();
            d.gameScreen.pointer.unlock();
            d.gameScreen.gameAnimationLoop.stop();
        });
        const densityBefore = await page.evaluate(() => window.__m14.capture('native'));
        await metrics(1920, 1080, 1);
        const densityAfter = await page.evaluate(() => window.__m14.capture('native'));
        assert.deepEqual(densityBefore.buffer, [3840, 2160]);
        assert.deepEqual(densityAfter.buffer, [1920, 1080]);
        assert.deepEqual(densityBefore.camera, densityAfter.camera);
        report.densityChange = { before: densityBefore.buffer, after: densityAfter.buffer,
            note: 'Same CSS size and unchanged Auto setting; emulated DPR migration' };
        const cases = [[1920, 1080, 2], [1920, 1080, 1], [2048, 1152, 1.25], [2560, 1440, 1.5],
            [3840, 2160, 1], [3840, 2160, 2], [1512, 982, 2], [1728, 1117, 2], [1600, 1000, 1.5], [800, 600, 1]];
        for (const [width, height, dpr] of cases) {
            await metrics(width, height, dpr);
            const samples = await page.evaluate(() => ['original', '720p', '1080p', '1440p', 'native', '4k']
                .map(mode => window.__m14.capture(mode)));
            const a = samples[0];
            assert(a.ui.sidebarCard && a.ui.sidebarRadar && a.ui.commandButtons.length, 'HUD bounds missing');
            assert.equal(a.logical[1], 900);
            assert(Math.abs(a.logical[0] - 900 * width / height) < 0.001);
            assert(Math.abs(a.display[2] - width) < 0.01 && Math.abs(a.display[3] - height) < 0.01);
            for (const s of samples) {
                for (const key of ['logical', 'display', 'ui', 'camera', 'viewport', 'models', 'target', 'tick', 'hd'])
                    assert.deepEqual(s[key], a[key], `${key} drift at ${width}x${height}/${dpr}/${s.mode}`);
                assert.equal(s.glError, 0); assert.equal(s.visualScale, 1);
                assert(s.draws.length > 0 && s.draws.every(draw => draw.defaultFramebuffer));
                const requestedHeight = { original: height, '720p': 720, '1080p': 1080, '1440p': 1440,
                    native: height * dpr, '4k': 2160 }[s.mode];
                const expectedHeight = Math.min(requestedHeight, Math.sqrt(16777216 * height / width));
                assert(Math.abs(s.buffer[1] - expectedHeight) <= 1);
                assert(Math.abs(s.buffer[0] - expectedHeight * width / height) <= 1);
                const expectedViewport = [0, (900 - s.viewport.height) * s.ratio,
                    s.viewport.width * s.ratio, s.viewport.height * s.ratio];
                for (const draw of s.draws) draw.viewport.forEach((n, i) => assert(Math.abs(n - expectedViewport[i]) <= 1));
            }
            const first = report.matrix[0]?.samples[0];
            if (first) {
                assert.equal(a.tick, first.tick);
                assert.deepEqual(a.camera.position, first.camera.position, 'Resize moved camera away from its center');
                for (const [i, model] of a.models.entries()) {
                    const reference = first.models[i];
                    assert.equal(model.frame, reference.frame);
                    for (const axis of [0, 1]) {
                        const span = model.displayBounds[axis + 2] - model.displayBounds[axis];
                        const originalSpan = reference.displayBounds[axis + 2] - reference.displayBounds[axis];
                        assert(Math.abs(span / height - originalSpan / 1080) < 1e-6, 'Normalized object scale drift');
                    }
                }
                for (const key of ['sidebarTop', 'sidebarRadar', 'sidebarCard', 'sidebarPower']) {
                    for (const axis of [0, 1]) assert(Math.abs((a.ui[key][axis + 2] - a.ui[key][axis])
                        - (first.ui[key][axis + 2] - first.ui[key][axis])) < 1e-6, 'Reference HUD size drift');
                }
                assert.equal(a.camera.bounds[2], first.camera.bounds[2]);
                assert.equal(a.camera.bounds[3], first.camera.bounds[3]);
                assert.deepEqual(a.camera.rotation, first.camera.rotation);
                if (Math.abs(width / height - 16 / 9) < 0.0001) assert.deepEqual(a.camera.bounds, first.camera.bounds);
            }
            report.matrix.push({ width, height, dpr, samples });
        }
        await metrics(1920, 1080, 2);
        const samples = await page.evaluate(() => ['1080p', '1440p', '4k'].map(m => window.__m14.capture(m, true)));
        for (const s of samples) report.comparisons.push(await saveCapture(s, `sampling-${s.mode}`));
        const pair = await page.evaluate(() => window.__m14.artworkPair());
        report.artwork = {};
        for (const [key, c] of Object.entries(pair)) report.artwork[key] = await saveCapture(c, `artwork-${key}`);
        assert.equal(pair.hd.tick, pair.original.tick);
        assert.deepEqual(pair.hd.models, pair.original.models);
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        // Use real browser events at transformed display coordinates.
        const target = await page.evaluate(() => {
            const d = window.__ra2debug; d.unitSelection.deselectAll();
            return d.helpers.getOwnedUnitClickPointById(window.__m11Units[0].id);
        });
        await page.mouse.click(target.x, target.y - 8);
        report.interactions.selection = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(),
            expected: window.__m11Units[0].id }));
        assert(report.interactions.selection.selected.includes(report.interactions.selection.expected), 'Selection missed');
        await page.evaluate(() => document.exitPointerLock());
        const panBefore = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
        await page.mouse.move(1918, 540); await page.waitForTimeout(400); await page.mouse.move(960, 540);
        const panAfter = await page.evaluate(() => window.__ra2debug.worldScene.camera.position.toArray());
        assert.notDeepEqual(panBefore, panAfter); report.interactions.edgeScroll = { panBefore, panAfter };
        report.interactions.extended = {};
        await checkDisplayInput(page, report.interactions.extended);
        // Browser mouse commands exercise actual transformed move/attack targets.
        const move = await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__m11Units[0];
            d.unitSelection.deselectAll(); d.unitSelection.addToSelection(u);
            const point = d.helpers.getOwnedUnitClickPointById(u.id), rect = d.renderer.getCanvas().getBoundingClientRect();
            for (const [dx, dy] of [[100, -20], [80, -40], [20, 60], [-80, 30]]) {
                const x = point.x + dx, y = point.y + dy;
                const tile = d.mapTileIntersectHelper.getTileAtScreenPoint({ x: (x - rect.x) / 1.2, y: (y - rect.y) / 1.2 });
                if (tile && !d.game.map.tileOccupation.getObjectsOnTile(tile).length
                    && d.game.map.terrain.getPassableSpeed(tile, u.rules.speedType, true, false) > 0)
                    return { x, y, tile: [tile.rx, tile.ry], button: d.generalOptions.rightClickMove.value ? 'right' : 'left' };
            }
            throw Error('No empty movement target in the visible fixture');
        });
        await page.mouse.click(move.x, move.y, { button: move.button });
        await page.waitForFunction(() => window.__m11Units[0].isMoving);
        report.interactions.moveCommand = move;
        report.walk = await saveCapture(await page.evaluate(() => window.__m14.capture('4k', true)), 'walk');
        const attack = await page.evaluate(() => {
            const d = window.__ra2debug; d.unitSelection.deselectAll();
            window.__m11Units.forEach(u => d.unitSelection.addToSelection(u));
            return { ...d.helpers.getOwnedBuildingClickTargetsById(window.__m12Plant.id).centerScreenPoint,
                button: d.generalOptions.rightClickMove.value ? 'right' : 'left' };
        });
        await page.keyboard.down('Control');
        await page.mouse.click(attack.x, attack.y, { button: attack.button });
        await page.keyboard.up('Control');
        report.interactions.attackCommand = attack;
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health < 85, undefined, { timeout: 45000 });
        await page.waitForFunction(() => window.__m11Units.some(u => u.isFiring));
        report.fire = await saveCapture(await page.evaluate(() => window.__m14.capture('4k', true)), 'fire');
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health < 48, undefined, { timeout: 45000 });
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 11));
        await page.waitForTimeout(300);
        report.damaged = {};
        for (const [key, c] of Object.entries(await page.evaluate(() => window.__m14.artworkPair())))
            report.damaged[key] = await saveCapture(c, `damaged-${key}`);
        report.status = 'DISPLAY_CONTRACT_PASS';
    } finally {
        const restoreFailure = await page.evaluate(() => window.__m14RestoreFailure).catch(() => undefined);
        if (restoreFailure) for (const [key, png] of Object.entries(restoreFailure))
            await fs.writeFile(`${output}/restore-failure-${key}.png`, Buffer.from(png.split(',')[1], 'base64'));
        await page.evaluate(() => window.__ra2debug?.gameScreen?.gameAnimationLoop?.start()).catch(() => {});
        await cdp.detach();
        await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    }
    return { status: report.status, output };
}
