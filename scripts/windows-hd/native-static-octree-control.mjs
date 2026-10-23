import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArg, executableArg, receiptArg, outputArg] = process.argv.slice(2);
const kit = path.resolve(kitArg), executable = path.resolve(executableArg), receipt = path.resolve(receiptArg);
const output = path.resolve(outputArg); await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: process.platform, windows: 'NOT_RUN', errors: [],
    boundary: 'Copied immutable C7 Mac runtime; change only the static octree root matrixAutoUpdate flag in memory. Frozen controls are not gameplay FPS.' };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app;
try {
    app = await electron.launch({ executablePath: executable, args: ['--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=3'],
        timeout: 60000, env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit,
            RA2_DIAGNOSTIC_HARNESS: '1', RA2_MANUAL_CAPTURE_RUNTIME_RECEIPT: receipt } });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForFunction(() => window.__ra2WinDiagnostic && window.__ra2debug?.game?.status === 1,
        undefined, { timeout: 120000 });
    const readyStarted = Date.now();
    while (true) {
        const names = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => name.endsWith('stress-4x-none')).sort();
        const latest = names.at(-1), runFile = latest && path.join(kit, 'Diagnostic-Runs', latest, 'run.json');
        const run = runFile && await fs.readFile(runFile, 'utf8').then(JSON.parse).catch(() => null);
        if (run?.status === 'CAPTURED' && run.stage === 'complete') break;
        if (Date.now() - readyStarted > 120000) throw Error('Automatic C7 phases did not complete');
        await page.waitForTimeout(1000);
    }
    const started = Date.now();
    while (await page.evaluate(() => window.__ra2debug.game.currentTick < 9000)) {
        if (Date.now() - started > 200000) throw Error('Native late-match tick threshold timed out');
        await page.waitForTimeout(10000);
        console.log(JSON.stringify(await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            players: window.__ra2debug.game.getCombatants().length }))));
    }
    report.state = await page.evaluate(() => {
        const d = window.__ra2debug, root = d.renderableManager.getRenderableContainer().get3DObject();
        let nodes = 0; root.traverse(() => nodes++);
        return { tick: d.game.currentTick, players: d.game.getCombatants().length, bots: d.game.botManager.bots.size,
            nodes, rootMatrixAutoUpdate: root.matrixAutoUpdate, rootLocalMatrix: root.matrix.elements,
            output: d.renderer.outputMetrics, hdBindings: d.renderableManager.getRenderableContainer().getChildren()
                .filter(renderable => renderable.unitVxlHd || renderable.rhinoHd || renderable.buildingHd).length };
    });
    assert.equal(report.state.rootMatrixAutoUpdate, true);
    assert.deepEqual(report.state.rootLocalMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    report.controls = await page.evaluate(async () => {
        const d = window.__ra2debug, loop = d.gameScreen.gameAnimationLoop;
        const root = d.renderableManager.getRenderableContainer().get3DObject();
        const tickGame = loop.tickGame, renderer = d.renderer, update = renderer.update, render = renderer.render;
        const autoReset = renderer.renderer.info.autoReset; renderer.renderer.info.autoReset = false;
        const matrixPrototype = Object.getPrototypeOf(root.matrix), multiply = matrixPrototype.multiplyMatrices;
        const stats = values => {
            const sorted = [...values].sort((a, b) => a - b);
            return { n: sorted.length, median: sorted[Math.floor(sorted.length / 2)],
                p95: sorted[Math.ceil(sorted.length * .95) - 1], maximum: sorted.at(-1) };
        };
        const counts = automatic => {
            root.matrixAutoUpdate = automatic; renderer.update(0); renderer.render();
            let operations = 0;
            matrixPrototype.multiplyMatrices = function (...args) { operations++; return multiply.apply(this, args); };
            try { renderer.update(0); return operations; }
            finally { matrixPrototype.multiplyMatrices = multiply; }
        };
        const snapshot = () => {
            const result = []; root.traverse(object => result.push({ id: object.id, parent: object.parent?.id,
                visible: object.visible, matrixWorld: [...object.matrixWorld.elements] })); return result;
        };
        const rows = []; loop.tickGame = () => true;
        try {
            for (const pan of [{ x: -1812, y: 4050 }, { x: -1860, y: 5250 }, { x: 1284, y: 2850 }]) {
                d.worldScene.cameraPan.setPan(pan);
                const operationCounts = { automatic: counts(true), static: counts(false) };
                root.matrixAutoUpdate = true; renderer.update(0); renderer.render(); const baseline = snapshot();
                root.matrixAutoUpdate = false; renderer.update(0); renderer.render(); const candidate = snapshot();
                if (JSON.stringify(baseline) !== JSON.stringify(candidate)) throw Error('Frozen matrices differ');
                for (const automatic of [true, false, false, true]) {
                    root.matrixAutoUpdate = automatic; await new Promise(resolve => setTimeout(resolve, 1000));
                    const samples = { update: [], render: [], draws: [], triangles: [] };
                    renderer.update = function (...args) {
                        const at = performance.now(); try { return update.apply(this, args); }
                        finally { samples.update.push(performance.now() - at); }
                    };
                    renderer.render = function (...args) {
                        renderer.renderer.info.reset();
                        const at = performance.now(); try { return render.apply(this, args); }
                        finally { samples.render.push(performance.now() - at); samples.draws.push(renderer.renderer.info.render.calls);
                            samples.triangles.push(renderer.renderer.info.render.triangles); }
                    };
                    await new Promise(resolve => setTimeout(resolve, 4000));
                    renderer.update = update; renderer.render = render;
                    rows.push({ pan, automatic, operationCounts, matrixParity: true,
                        metrics: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, stats(values)])) });
                }
            }
            return rows;
        } finally { loop.tickGame = tickGame; root.matrixAutoUpdate = true; renderer.update = update;
            renderer.render = render; renderer.renderer.info.autoReset = autoReset; matrixPrototype.multiplyMatrices = multiply; }
    });
    const continued = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await page.waitForTimeout(3000);
    report.restored = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        automatic: window.__ra2debug.renderableManager.getRenderableContainer().get3DObject().matrixAutoUpdate }));
    assert(report.restored.tick > continued && report.restored.automatic);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_COPIED_MAC_STATIC_OCTREE_MATRIX_CONTROL';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await save(); if (app) await app.close(); }
console.log(JSON.stringify({ status: report.status, output }));
