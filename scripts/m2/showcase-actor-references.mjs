// Native reference rendering only; this does not publish or validate new HD actors.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'Controlled Original CAR poses in the actual copied M2.1 baseline. Native reference only; no production/action acceptance.';
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        window.__carReference = f.spawn('CAR', 7, { rx: f.center.rx + 6, ry: f.center.ry + 5 });
        d.worldInteraction.minimapHandler.panToTile(window.__carReference.tile);
        d.generalOptions.graphics.renderResolution.value = '4k';
        d.renderer.setRenderResolution('4k');
    });
    await page.waitForFunction(() => window.__ra2debug.renderableManager
        .getRenderableByGameObject(window.__carReference)?.vxlBuilders?.length > 0);
    await page.evaluate(() => { window.__ra2debug.gameScreen.gameAnimationLoop.stop(); });
    report.references = [];
    for (const heading of [0, 90]) {
        const result = await page.evaluate(heading => {
            const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer;
            const unit = window.__carReference, renderable = d.renderableManager.getRenderableByGameObject(unit);
            renderable.updateVxlRotation(heading, true);
            const policy = w.scene.matrixWorldAutoUpdate;
            w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = policy; }
            w.meshBatchManager.updateMeshes();
            d.renderer.render();
            const point = d.worldInteraction.mapHoverHandler.mapTileIntersectHelper.getTileCenterScreenPoint(unit.tile);
            const ratio = gl.domElement.width / d.renderer.width;
            const crop = [Math.round(point.x * ratio - 180), Math.round(point.y * ratio - 180), 360, 300];
            const canvas = document.createElement('canvas'); canvas.width = crop[2]; canvas.height = crop[3];
            canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, ...crop.slice(2));
            return { member: renderable.bodyVxlBuilder?.vxlFile.filename
                ?? renderable.vxlBuilders[0].vxlFile.filename, heading, crop, matrixPolicy: w.scene.matrixWorldAutoUpdate,
                framebuffer: [gl.domElement.width, gl.domElement.height],
                png: canvas.toDataURL('image/png').split(',')[1] };
        }, heading);
        assert.equal(result.member, 'car.vxl');
        assert.equal(result.matrixPolicy, false);
        const file = `car-native-${heading}.png`;
        await fs.writeFile(path.join(output, file), Buffer.from(result.png, 'base64'));
        delete result.png; report.references.push({ file, ...result });
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
