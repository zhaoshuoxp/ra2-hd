import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateBuildingDisplay(page, app, report, out) {
    const window = await app.browserWindow(page);
    report.buildingDisplay = [];
    for (const [width, height] of [[960, 540], [1440, 900]]) {
        await window.evaluate((w, size) => { w.setFullScreen(false); w.setContentSize(...size); }, [width, height]);
        await page.waitForTimeout(350);
        const rows = await page.evaluate(() => {
            const d = window.__ra2debug, renderer = d.renderer.renderer, canvas = renderer.domElement;
            d.gameScreen.gameAnimationLoop.stop();
            const original = d.generalOptions.graphics.renderResolution.value;
            const geometry = () => Object.entries(window.coverageActors).flatMap(([id, u]) => {
                const r = d.renderableManager.getRenderableByGameObject(u), model = r?.mainObj;
                return model ? [{ id, frame: model.builder.getFrame(),
                    body: Array.from(model.getShapeMesh().geometry.attributes.position.array),
                    shadow: model.getShadowMesh() && Array.from(model.getShadowMesh().geometry.attributes.position.array) }] : [];
            });
            try {
                return ['1080p', '4k'].map(mode => {
                    d.generalOptions.graphics.renderResolution.value = mode;
                    d.renderer.render();
                    return { mode, viewport: [innerWidth, innerHeight], buffer: [canvas.width, canvas.height],
                        logical: [canvas.dataset.logicalWidth, canvas.dataset.logicalHeight], tick: d.game.currentTick,
                        camera: d.worldScene.camera.projectionMatrix.toArray(), geometry: geometry(),
                        error: renderer.getContext().getError(), png: canvas.toDataURL('image/png') };
                });
            } finally {
                d.generalOptions.graphics.renderResolution.value = original;
                d.gameScreen.gameAnimationLoop.start();
            }
        });
        for (const r of rows) {
            assert.equal(r.error, 0);
            const outputHeight = r.mode === '4k' ? 2160 : 1080;
            assert.deepEqual(r.viewport, [width, height]);
            assert.deepEqual(r.buffer, [Math.round(width / height * outputHeight), outputHeight]);
            for (const key of ['logical', 'tick', 'camera', 'geometry']) assert.deepEqual(r[key], rows[0][key], key);
            const filename = `buildings-${width}x${height}-${r.mode}.png`;
            await fs.writeFile(path.join(out, filename), Buffer.from(r.png.split(',')[1], 'base64'));
            delete r.png; r.file = filename;
        }
        report.buildingDisplay.push({ requestedWindow: [width, height], rows });
    }
}
