import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArg, executableArg, outputArg] = process.argv.slice(2);
const kit = path.resolve(kitArg), executable = path.resolve(executableArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: process.platform, windows: 'NOT_RUN', errors: [],
    boundary: 'Copied immutable C8 Mac runtime; restrict only cached VXL bearing preparation. Frozen controls are not Windows FPS.' };
let app;
try {
    app = await electron.launch({ executablePath: executable,
        args: ['--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=3'], timeout: 60000,
        env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' } });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForFunction(() => window.__ra2WinDiagnostic && window.__ra2debug?.game?.status === 1,
        undefined, { timeout: 120000 });
    const started = Date.now();
    while (await page.evaluate(() => window.__ra2debug.game.currentTick < 9000)) {
        if (Date.now() - started > 220000) throw Error('Late native tick threshold timed out');
        await page.waitForTimeout(10000);
        console.log(JSON.stringify(await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick }))));
    }
    report.controls = await page.evaluate(async () => {
        const d = window.__ra2debug, loop = d.gameScreen.gameAnimationLoop, renderer = d.renderer;
        const models = d.renderableManager.getRenderableContainer().getChildren().map(r => r.unitVxlHd).filter(Boolean);
        if (!models.length) throw Error('Native VXL bindings missing');
        const prototype = Object.getPrototypeOf(models[0]), updateVxl = prototype.update;
        const tickGame = loop.tickGame, updateRenderer = loop.updateRenderer, update = renderer.update, render = renderer.render;
        const originalPan = { ...d.worldScene.cameraPan.getPan() }, now = performance.now;
        let selectedOnly = false, countPoses = false, poseCalls = 0;
        const copies = models.map(model => {
            const copy = model.pose.copy;
            model.pose.copy = function (...args) { if (countPoses) poseCalls++; return copy.apply(this, args); };
            return [model.pose, copy];
        });
        const heading = value => Number.isFinite(value)
            ? [0, 45, 90, 135, 180, 225, 270, 315][Math.floor((((value % 360) + 360) % 360 + 22.5) / 45) % 8] : undefined;
        prototype.update = function (...args) {
            if (!selectedOnly) return updateVxl.apply(this, args);
            const saved = this.layers.map(layer => [layer, layer.frames]);
            for (const [layer, frames] of saved) {
                if (this.family.identity === 'DISK' || layer.rotor) continue;
                const yaw = layer.turret ? Math.floor(this.r.gameObject.turretTrait.facing)
                    : (this.r.tiltObj.rotation.y + (this.r.dirWrapObj?.rotation.y ?? 0)) * 180 / Math.PI;
                const selected = heading(yaw);
                for (const frame of frames) if (frame.frame.heading !== selected)
                    frame.update(false, this.pose, this.light, null, 0, null, 0);
                layer.frames = frames.filter(frame => frame.frame.heading === selected);
            }
            try { return updateVxl.apply(this, args); }
            finally { for (const [layer, frames] of saved) layer.frames = frames; }
        };
        const stats = values => {
            const sorted = [...values].sort((a, b) => a - b);
            return { n: sorted.length, median: sorted[Math.ceil(sorted.length * .5) - 1],
                p95: sorted[Math.ceil(sorted.length * .95) - 1], maximum: sorted.at(-1) };
        };
        const gl = renderer.renderer.getContext(), results = [];
        const pixels = () => {
            renderer.render(); const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
            return bytes;
        };
        const matrices = () => {
            const values = []; d.worldScene.scene.traverse(object => values.push([object.id, ...object.matrixWorld.elements]));
            return JSON.stringify(values);
        };
        loop.tickGame = () => true; loop.updateRenderer = () => {};
        try {
            for (const pan of [{ x: -1764, y: 4862 }, { x: 84, y: 5058 }]) {
                d.worldScene.cameraPan.setPan(pan);
                const fixedNow = now.call(performance); performance.now = () => fixedNow;
                selectedOnly = false; renderer.update(0); renderer.update(0);
                countPoses = true; poseCalls = 0; renderer.update(0); const baselinePoses = poseCalls; countPoses = false;
                const baselinePixels = pixels(), baselineMatrices = matrices();
                selectedOnly = true; countPoses = true; poseCalls = 0; renderer.update(0);
                const selectedPoses = poseCalls; countPoses = false;
                const selectedPixels = pixels(), selectedMatrices = matrices(); performance.now = now;
                let differences = 0; for (let i = 0; i < baselinePixels.length; i++) differences += Number(baselinePixels[i] !== selectedPixels[i]);
                const control = { tick: d.game.currentTick, models: models.length, pan, baselinePoses, selectedPoses,
                    matrixParity: baselineMatrices === selectedMatrices, pixelDifferences: differences,
                    comparedPixelBytes: baselinePixels.length, timing: [] };
                results.push(control);
                if (differences || !control.matrixParity) throw Error('Selected-bearing control changed output');
                loop.updateRenderer = updateRenderer;
                for (const value of [false, true, true, false]) {
                    selectedOnly = value; await new Promise(resolve => setTimeout(resolve, 1000));
                    const samples = { update: [], submission: [] };
                    renderer.update = function (...args) {
                        const start = now.call(performance); try { return update.apply(this, args); }
                        finally { samples.update.push(now.call(performance) - start); }
                    };
                    renderer.render = function (...args) {
                        const start = now.call(performance); try { return render.apply(this, args); }
                        finally { samples.submission.push(now.call(performance) - start); }
                    };
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    renderer.update = update; renderer.render = render;
                    control.timing.push({ selectedOnly: value,
                        metrics: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stats(values)])) });
                }
                loop.updateRenderer = () => {};
            }
            return results;
        } finally {
            performance.now = now; prototype.update = updateVxl; loop.tickGame = tickGame;
            loop.updateRenderer = updateRenderer; renderer.update = update; renderer.render = render;
            for (const [matrix, copy] of copies) { delete matrix.copy; if (matrix.copy !== copy) throw Error('Pose hook restoration failed'); }
            d.worldScene.cameraPan.setPan(originalPan);
        }
    });
    assert(report.controls.every(row => row.baselinePoses > row.selectedPoses && row.pixelDifferences === 0 && row.matrixParity));
    assert.deepEqual(report.errors, []); report.status = 'PASS_COPIED_MAC_SELECTED_VXL_BEARING_CONTROL';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (app) await app.close();
}
console.log(JSON.stringify({ status: report.status, output }));
