// Capture real Original rendering at source-pinned native bridge camera positions.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output, cameraFile] = process.argv.slice(2);
assert(stage && output && cameraFile);
const camera = JSON.parse(await fs.readFile(cameraFile));
const bytes = await fs.readFile(camera.sourceReport);
assert.equal(createHash('sha256').update(bytes).digest('hex'), camera.sourceReportSha256);
const source = JSON.parse(bytes);
assert.equal(source.status, 'PASS_SELECTED_NATIVE_CASES');
assert.equal(camera.edition, 'yr');
assert.equal(camera.selectedMap, source.selectedMap);
for (const sample of camera.captureRoute)
    assert(source.terrain.placedBindings.some(binding => binding.group === sample.name
        && JSON.stringify(binding.tile) === JSON.stringify(sample.tile)));
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
const { page, report, close } = session;
let failure;
try {
    assert.equal(report.selectedMap, source.selectedMap);
    await page.evaluate(async () => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.renderResolution.value = '720p';
        await new Promise(resolve => setTimeout(resolve, 100));
        graphics.renderResolution.value = '1080p';
    });
    await page.waitForFunction(() => window.__ra2debug.renderer.renderer.domElement.height === 1080);
    const before = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { tick: d.game.currentTick, terrain: d.terrainHd, environment: d.environmentHd };
    });
    for (const allocation of [before.terrain, before.environment]) {
        assert.equal(allocation.density, 1);
        assert.equal(allocation.worldChargeBytes, 0);
    }
    for (const [index, sample] of camera.captureRoute.entries()) {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, sample.tile);
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, `${String(index).padStart(2, '0')}-original-bridge.png`), Buffer.from(png, 'base64'));
    }
    const after = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert(after.tick > before.tick);
    assert.equal(after.glError, 0);
    Object.assign(report, { originalControl: 'PASS_NATIVE_ORIGINAL_BRIDGE_CONTROL', cameraFile,
        captureRoute: camera.captureRoute, before, after,
        disclosure: 'Global Original setting before loading the unchanged map. Native camera positions and existing 1080p UI preset; no image, map or geometry edits. Map reveal and paused bot AI follow the existing native session helper.' });
    console.log(JSON.stringify({ status: report.originalControl, beforeTick: before.tick, afterTick: after.tick }));
} catch (error) {
    failure = error; throw error;
} finally {
    await close(failure);
}
