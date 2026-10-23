import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';
import { installDisplayEdgeProbe } from './display-edge-probe.mjs';

export async function enableEdgeReviewUI(page) {
    await page.evaluate(installDisplayEdgeProbe);
    await page.evaluate(() => {
        const panel = document.createElement('div'); panel.id = 'm14-edge-review';
        panel.style.cssText = 'position:fixed;z-index:99999;top:8px;left:50%;transform:translateX(-50%);padding:8px;background:#18212eee;color:white;font:16px system-ui';
        panel.innerHTML = '<span>M1.4 experiment — </span>';
        const labels = { A: 'A Original', B: 'B Filtered', C: 'C Soft edges' };
        function select(mode) {
            window.__m14Edge.setMode(mode);
            panel.querySelectorAll('button').forEach(b => { b.style.fontWeight = b.dataset.mode === mode ? 'bold' : 'normal'; });
        }
        for (const mode of ['A', 'B', 'C']) {
            const button = document.createElement('button'); button.textContent = labels[mode]; button.dataset.mode = mode;
            button.style.cssText = 'font:inherit;margin:0 4px;padding:4px 8px;cursor:pointer';
            button.onclick = e => { e.stopPropagation(); select(mode); }; panel.appendChild(button);
        }
        const key = e => {
            if (e.altKey && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
                e.preventDefault(); e.stopImmediatePropagation(); select(['A', 'B', 'C'][Number(e.code.at(-1)) - 1]);
            }
        };
        window.addEventListener('keydown', key, true); document.body.appendChild(panel); select('A');
        window.__m14EdgeUICleanup = () => {
            window.removeEventListener('keydown', key, true); panel.remove(); window.__m14Edge.dispose();
        };
    });
}

export async function smokeEdgeReviewUI(page, output) {
    await page.evaluate(installDisplayProbe);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    const captures = [];
    try {
        for (const mode of ['A', 'B', 'C', 'A']) {
            await page.locator(`#m14-edge-review button[data-mode="${mode}"]`).click();
            const capture = await page.evaluate(() => ({ ...window.__m14.capture('4k', true), experiment: window.__m14Edge.info() }));
            assert.equal(capture.experiment.mode, mode); assert.equal(capture.glError, 0);
            captures.push(capture);
            await fs.writeFile(`${output}/manual-${mode}.png`, Buffer.from(capture.png.split(',')[1], 'base64'));
        }
        assert.equal(captures[0].png, captures[3].png);
        await page.keyboard.press('Alt+Digit3');
        assert.equal(await page.evaluate(() => window.__m14Edge.info().mode), 'C');
        await page.keyboard.press('Alt+Digit1');
        assert.equal(await page.evaluate(() => window.__m14Edge.info().mode), 'A');
        return { status: 'PASS_BUTTONS_HOTKEYS_EXACT_RESTORE',
            modes: captures.map(({ png, ...metrics }) => metrics) };
    } finally { await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start()); }
}

export async function runDisplayEdgeReview(page, output, productionComparison = false) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', sets: [], occlusion: [], scope: 'Harness-only A/B/C; no art or production defaults changed' };
    await page.evaluate(installDisplayProbe);
    await page.evaluate(installDisplayEdgeProbe);
    if (productionComparison) {
        const { installProductionComparison } = await import('./production-c-probe.mjs');
        await page.evaluate(installProductionComparison);
        report.scope = 'A legacy / B accepted experimental C / C production C; same-tick comparison';
    }
    await page.evaluate(() => {
        window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k';
        window.__ra2debug.unitSelection.deselectAll(); window.__ra2debug.gameScreen.pointer.unlock();
    });
    await page.waitForTimeout(150);
    async function capture(name, outputMode = '4k', alternateColor = false) {
        const cases = await page.evaluate(({ outputMode, alternateColor }) => {
            const d = window.__ra2debug;
            const paletteChanges = [];
            if (alternateColor) d.worldScene.get3DObject().traverseVisible(mesh => {
                if (!mesh.isBatchedMesh || mesh.material?.type !== 'HdSpriteMaterial') return;
                const image = mesh.material.palette.image, pixels = image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
                let best = -Infinity, row = -1;
                for (let y = 0; y < image.height; y++) {
                    let score = 0;
                    for (let x = 16; x < 32; x++) {
                        const i = (y * image.width + x) * 4; score += pixels[i + 2] - pixels[i];
                    }
                    if (score > best) { best = score; row = y; }
                }
                if (row < 0 || best <= 0) throw Error('No blue owner palette control');
                paletteChanges.push([mesh, mesh.getPaletteIndex()]); mesh.setPaletteIndex(row);
            });
            if (alternateColor) {
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
            }
            // All modes render synchronously, so simulation, camera, pose and light are identical.
            const results = [];
            try {
                for (const mode of ['A', 'B', 'C', 'A']) {
                    window.__m14Edge.setMode(mode);
                    const capture = window.__m14.capture(outputMode, true);
                    results.push({ ...capture, experiment: window.__m14Edge.info(), alternateColor });
                }
            } finally {
                for (const [mesh, index] of paletteChanges) mesh.setPaletteIndex(index);
                if (alternateColor) {
                    d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                }
            }
            return results;
        }, { outputMode, alternateColor });
        assert.equal(cases[0].png, cases[3].png, 'Original pixels failed exact restoration');
        for (const c of cases) {
            assert.equal(c.glError, 0);
            for (const key of ['camera', 'models', 'tick', 'logical', 'display', 'hd', 'units', 'viewport'])
                assert.deepEqual(c[key], cases[0][key], `Changed ${key}`);
            assert.equal(c.logical[1], 900);
        }
        assert(cases[1].experiment.patchedBatches > 0 && cases[2].experiment.visibleEdgeMeshes > 0);
        for (const [index, c] of cases.entries()) {
            c.file = `${name}-${['A', 'B', 'C', 'restored'][index]}.png`;
            if (index < 3) await fs.writeFile(`${output}/${c.file}`, Buffer.from(c.png.split(',')[1], 'base64'));
            delete c.png;
        }
        report.sets.push({ name, cases: cases.slice(0, 3), exactRestoration: true });
    }
    async function move(offset) {
        await page.evaluate(offset => {
            const d = window.__ra2debug, p = window.__m12Plant;
            d.actionsApi.orderUnits([window.__m11Units[0].id], 0, p.tile.rx + offset[0], p.tile.ry + offset[1]);
        }, offset);
    }
    async function occlusion(name) {
        const data = await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__m11Units[0];
            const unit = d.renderableManager.getRenderableByGameObject(u).shpRenderable.getShapeMesh();
            const building = d.renderableManager.getRenderableByGameObject(window.__m12Plant).get3DObject();
            const gl = d.renderer.renderer.getContext();
            const target = d.helpers.getOwnedUnitClickPointById(u.id);
            const x = Math.round(target.x * 2) - 64, y = gl.drawingBufferHeight - Math.round(target.y * 2) - 32;
            const result = [];
            const masks = [];
            const old = [unit.visible, building.visible];
            function read(showUnit, showBuilding) {
                unit.visible = showUnit; building.visible = showBuilding;
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
                const pixels = new Uint8Array(128 * 144 * 4);
                gl.readPixels(x, y, 128, 144, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
            }
            function changed(a, b) {
                const mask = new Uint8Array(a.length / 4);
                for (let i = 0; i < a.length; i += 4)
                    if ([0, 1, 2].some(c => Math.abs(a[i + c] - b[i + c]) > 2)) mask[i / 4] = 1;
                return mask;
            }
            try {
                for (const mode of ['A', 'B', 'C']) {
                    window.__m14Edge.setMode(mode);
                    const normal = read(true, true), noUnit = read(false, true), noBuilding = read(true, false), neither = read(false, false);
                    const visible = changed(normal, noUnit), unobstructed = changed(noBuilding, neither);
                    masks.push({ visible, unobstructed });
                    result.push({ mode, visible: visible.reduce((a, b) => a + b, 0),
                        unobstructed: unobstructed.reduce((a, b) => a + b, 0), glError: gl.getError() });
                }
            } finally {
                [unit.visible, building.visible] = old; window.__m14Edge.setMode('A');
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            }
            let testedInteriorPixels = 0, newlyVisibleBehindOpaquePixels = 0;
            const hidden = masks[0].unobstructed.map((v, i) => v && !masks[0].visible[i] ? 1 : 0);
            for (let y = 2; y < 142; y++) for (let x = 2; x < 126; x++) {
                let interior = true;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
                    if (!hidden[(y + dy) * 128 + x + dx]) interior = false;
                if (interior) { testedInteriorPixels++; newlyVisibleBehindOpaquePixels += masks[2].visible[y * 128 + x]; }
            }
            return { tick: d.game.currentTick, unitTile: [u.tile.rx, u.tile.ry], result,
                testedInteriorPixels, newlyVisibleBehindOpaquePixels };
        });
        report.occlusion.push({ name, ...data });
        data.result.forEach(r => assert.equal(r.glError, 0));
        assert.equal(data.newlyVisibleBehindOpaquePixels, 0, 'Soft edges exposed pixels inside hard occlusion');
    }
    try {
        await capture('normal-2160');
        await capture('blue-remap-2160', '4k', true);
        await capture('normal-1080', '1080p');
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k'; });
        await move([1, -1]);
        for (let i = 0; i < 10; i++) { await page.waitForTimeout(100); await capture(`move-${String(i).padStart(2, '0')}`); }
        await page.waitForFunction(() => !window.__m11Units[0].isMoving, undefined, { timeout: 20000 });
        await capture('exposed-flank'); await occlusion('exposed-flank');
        await move([-1, 1]);
        await page.waitForTimeout(3500); await capture('partly-occluded'); await occlusion('partly-occluded');
        await move([-1, -1]);
        await page.waitForTimeout(3500); await capture('rear-flank'); await occlusion('rear-flank');
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 3, window.__m12Plant.id);
        });
        await page.waitForFunction(() => window.__m11Units.some(u => u.isFiring), undefined, { timeout: 45000 });
        await capture('firing');
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health < 48, undefined, { timeout: 60000 });
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 11));
        await page.waitForTimeout(250); await capture('damaged');
        // Sustained C exercises live animation/batch updates between captures.
        await page.evaluate(() => { window.__m14Edge.setMode('C'); });
        await move([-2, -2]); await page.waitForTimeout(1800);
        report.liveC = await page.evaluate(() => ({ ...window.__m14Edge.info(), tick: window.__ra2debug.game.currentTick }));
        await capture('after-live-C');
        assert(report.sets.some(s => s.name.startsWith('move-') && s.cases[0].units[0].moving), 'Movement not observed');
        assert(report.sets.find(s => s.name === 'firing').cases[0].units.some(u => u.firing));
        assert(report.sets.find(s => s.name === 'damaged').cases[0].buildingHealth < 48);
        assert(report.occlusion.some(s => s.result.every(r => r.unobstructed > r.visible && r.unobstructed > 0)), 'Occlusion not reproduced');
        assert(report.occlusion.some(s => s.testedInteriorPixels > 0), 'No hard-occlusion interior was tested');
        report.status = 'PASS_BOUNDED_EDGE_DIAGNOSTIC_REVIEW_PENDING';
    } finally {
        await page.evaluate(() => window.__m14Edge?.dispose()).catch(() => {});
        await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    }
    return { status: report.status, output, sets: report.sets.length };
}
