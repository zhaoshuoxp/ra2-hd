import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArg, executableArg, outputArg, tickArg = '9000', centerArg] = process.argv.slice(2);
assert(kitArg && executableArg && outputArg);
const threshold = Number(tickArg), center = centerArg?.split(',').map(Number);
assert(Number.isInteger(threshold) && threshold >= 9000);
assert(!center || center.length === 2 && center.every(Number.isFinite));
const kit = path.resolve(kitArg), executable = path.resolve(executableArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { schemaVersion: 1, status: 'RUNNING', platform: process.platform, windows: 'NOT_RUN', errors: [],
    boundary: 'Temporary renderBufferDirect control on copied C9 Mac. Same-state pixels/draws and frozen render-only timing; no Windows or Normal FPS claim.' };
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
let app;
try {
    const before = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')));
    app = await electron.launch({ executablePath: executable,
        args: ['--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=3'], timeout: 60000,
        env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' } });
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    const started = Date.now(); let directory, run;
    while (Date.now() - started < 150000) {
        if (!directory) {
            const name = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
                .find(name => !before.has(name) && name.endsWith('stress-4x-none'));
            if (name) directory = path.join(kit, 'Diagnostic-Runs', name);
        }
        run = directory && await read(path.join(directory, 'run.json')).catch(() => null);
        if (run?.status === 'CAPTURED' && run.stage === 'complete') break;
        await page.waitForTimeout(500);
    }
    assert.equal(run?.status, 'CAPTURED');
    const automatic = await read(path.join(directory, 'phases.json'));
    assert.equal(automatic.length, 4);
    assert(automatic.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE' && !phase.instrumented
        && phase.endState.players === 8 && phase.endState.bots === 7 && phase.tickEnd > phase.tickStart));
    report.runDirectory = path.basename(directory);
    report.sourceIdentity = { diagnosticId: run.diagnosticId, diagnosticCommit: run.diagnosticCommit,
        manifestSha256: run.manifestSha256 };
    report.machine = await read(path.join(directory, 'machine.json'));
    const lateStarted = Date.now();
    while (await page.evaluate(threshold => window.__ra2debug.game.currentTick < threshold, threshold)) {
        if (Date.now() - lateStarted > 240000) throw Error('Late scene threshold timed out');
        await page.waitForTimeout(10000);
        console.log(JSON.stringify(await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick }))));
    }
    report.control = await page.evaluate(center => {
        const d = window.__ra2debug, owner = d.renderer, renderer = owner.renderer;
        const loop = d.gameScreen.gameAnimationLoop, gl = renderer.getContext();
        const original = renderer.renderBufferDirect, tickGame = loop.tickGame, updateRenderer = loop.updateRenderer;
        const pan = { ...d.worldScene.cameraPan.getPan() }, tick = d.game.currentTick;
        const now = performance.now, fixedNow = now.call(performance), rows = [], calls = [];
        let skip = false, count = false, main = 0, shadow = 0, dropped = 0, droppedTriangles = 0;
        let names = new Map();
        renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
            const empty = scene !== null && material.colorWrite === false && material.depthWrite === false
                && material.stencilWrite === false;
            if (count) {
                if (scene === null) shadow++; else main++;
                if (empty) {
                    dropped++; names.set(object.name || object.type, (names.get(object.name || object.type) ?? 0) + 1);
                    droppedTriangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
                }
            }
            if (skip && empty) return;
            return original.call(this, camera, scene, geometry, material, object, group);
        };
        const pixels = () => {
            owner.render();
            const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
            return bytes;
        };
        const captureCalls = () => {
            main = shadow = dropped = droppedTriangles = 0; names = new Map();
            count = true; owner.render(); count = false;
            return { main, shadow, eligibleNoOutput: dropped, eligibleTriangles: droppedTriangles,
                actualDrawCallsLastScene: renderer.info.render.calls,
                names: [...names].sort((a, b) => b[1] - a[1]) };
        };
        const time = () => {
            const start = now.call(performance);
            for (let i = 0; i < 30; i++) owner.render();
            return { ms: now.call(performance) - start, renders: 30 };
        };
        const matrices = () => {
            const values = []; d.worldScene.scene.traverse(object => values.push([object.id, ...object.matrixWorld.elements]));
            return JSON.stringify(values);
        };
        loop.tickGame = () => true; loop.updateRenderer = () => {}; performance.now = () => fixedNow;
        try {
            const base = center ? { x: center[0], y: center[1] } : pan;
            for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                d.worldScene.cameraPan.setPan({ x: base.x + offset.x, y: base.y + offset.y }); owner.update(0);
                skip = false; const baseline = pixels(), before = matrices(), baselineCalls = captureCalls();
                skip = true; const candidate = pixels(), after = matrices(), candidateCalls = captureCalls();
                rows.push({ offset, tick, differingBytes: baseline.reduce((n, v, i) => n + Number(v !== candidate[i]), 0),
                    comparedBytes: baseline.length, nonzeroBytes: baseline.reduce((n, v) => n + Number(v !== 0), 0),
                    matrixParity: before === after, baselineCalls, candidateCalls });
            }
            for (const mode of ['baseline', 'skip', 'skip', 'baseline', 'skip', 'baseline', 'baseline', 'skip']) {
                skip = mode === 'skip'; calls.push({ mode, ...time() });
            }
            if (d.game.currentTick !== tick) throw Error('Native game advanced during controls');
            return { rows, renderOnlyTiming: calls, tick, base, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
        } finally {
            renderer.renderBufferDirect = original; performance.now = now;
            loop.tickGame = tickGame; loop.updateRenderer = updateRenderer; d.worldScene.cameraPan.setPan(pan);
        }
    }, center);
    assert(report.control.rows.every(row => row.differingBytes === 0 && row.matrixParity && row.nonzeroBytes > 1000));
    assert(report.control.rows.every(row => row.baselineCalls.eligibleNoOutput > 0
        && row.baselineCalls.main === row.candidateCalls.main && row.baselineCalls.shadow === row.candidateCalls.shadow));
    assert.deepEqual(await read(path.join(directory, 'errors.json')), []);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_C9_COPIED_MAC_NO_OUTPUT_DRAW_CONTROL';
    console.log(JSON.stringify({ status: report.status, rows: report.control.rows.map(row => ({ offset: row.offset,
        differingBytes: row.differingBytes, main: row.baselineCalls.main, shadow: row.baselineCalls.shadow,
        eligibleNoOutput: row.baselineCalls.eligibleNoOutput })), timing: report.control.renderOnlyTiming }));
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
}
