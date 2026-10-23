import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [kitArg, outputArg] = process.argv.slice(2), kit = path.resolve(kitArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: process.platform, windows: 'NOT_RUN', errors: [], cases: [],
    boundary: 'Copied packaged Mac candidate, native progressing matches and same-state pixel/matrix controls outside timing. No Windows FPS claim.' };
const bundle = path.join(output, 'Static-Octree-QA.app'), execute = promisify(execFile);
await execute('cp', ['-cR', await fs.realpath('node_modules/electron/dist/Electron.app'), bundle]);
const executable = path.join(bundle, 'Contents/MacOS/Red Alert 2 HD');
await fs.rename(path.join(bundle, 'Contents/MacOS/Electron'), executable);
await execute('plutil', ['-replace', 'CFBundleExecutable', '-string', 'Red Alert 2 HD', path.join(bundle, 'Contents/Info.plist')]);
const payload = path.join(bundle, 'Contents/Resources/app'); await fs.mkdir(payload);
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify({ name: 'ra2-hd-static-octree-qa', version: '1.0.0', type: 'module',
    main: path.relative(payload, path.join(kit, 'resources/app/desktop/diagnostic-entry.mjs')) }) + '\n', { flag: 'wx' });
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
let app;
try {
    for (const [mode, scene] of [['4x', 'stress'], ['2x', 'small'], ['original', 'small']]) {
        const before = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
        app = await electron.launch({ executablePath: executable, args: [`--diag-mode=${mode}`, `--diag-scene=${scene}`, '--diag-seconds=3'],
            timeout: 60000, env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' } });
        assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
        await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
        const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
        const started = Date.now(); let directory, run;
        while (Date.now() - started < 150000) {
            if (!directory) {
                const name = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
                    .find(name => !before.has(name) && name.endsWith(`${scene}-${mode}-none`));
                if (name) directory = path.join(kit, 'Diagnostic-Runs', name);
            }
            run = directory && await read(path.join(directory, 'run.json')).catch(() => null);
            if (run?.status === 'CAPTURED' && run.stage === 'complete') break;
            await page.waitForTimeout(500);
        }
        assert.equal(run?.status, 'CAPTURED'); const automatic = await read(path.join(directory, 'phases.json'));
        assert.equal(automatic.length, 4);
        assert(automatic.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE' && !phase.instrumented && !phase.manualCamera
            && phase.tickEnd > phase.tickStart && phase.endState.players === (scene === 'stress' ? 8 : 2)
            && phase.endState.bots === (scene === 'stress' ? 7 : 1)));
        const result = { mode, scene, runDirectory: path.basename(directory),
            phases: automatic.map(phase => ({ label: phase.label, validity: phase.validity,
                tickStart: phase.tickStart, tickEnd: phase.tickEnd, output: phase.endState.output,
                hdBindings: phase.endState.bindings.filter(binding => binding.vxl || binding.shp || binding.rhino).length })) };
        assert(result.phases.every(phase => mode === 'original' ? phase.hdBindings === 0 : phase.hdBindings > 0));
        result.pixels = await page.evaluate(() => {
            const d = window.__ra2debug, loop = d.gameScreen.gameAnimationLoop, renderer = d.renderer;
            const root = d.renderableManager.getRenderableContainer().get3DObject(), gl = renderer.renderer.getContext();
            if (root.matrixAutoUpdate !== false || root.matrixWorldAutoUpdate !== true) throw Error('Copied candidate matrix policy is missing');
            const tickGame = loop.tickGame, updateRenderer = loop.updateRenderer, pan = { ...d.worldScene.cameraPan.getPan() };
            const tick = d.game.currentTick, rows = [], readPixels = () => {
                renderer.render(); const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                return pixels;
            };
            const matrices = () => { const values = []; root.traverse(object => values.push([object.id, ...object.matrixWorld.elements])); return values; };
            loop.tickGame = () => true; loop.updateRenderer = () => {};
            try {
                for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                    d.worldScene.cameraPan.setPan({ x: pan.x + offset.x, y: pan.y + offset.y }); renderer.update(0);
                    root.matrixAutoUpdate = true; root.updateMatrixWorld(false); const baseline = readPixels(), before = matrices();
                    root.matrixAutoUpdate = false; root.updateMatrixWorld(false); const candidate = readPixels(), after = matrices();
                    const differingBytes = baseline.reduce((count, value, index) => count + Number(value !== candidate[index]), 0);
                    rows.push({ offset, differingBytes, comparedBytes: baseline.length, width: gl.drawingBufferWidth,
                        height: gl.drawingBufferHeight, nonzeroBytes: baseline.reduce((count, value) => count + Number(value !== 0), 0),
                        matrixParity: JSON.stringify(before) === JSON.stringify(after) });
                }
                if (d.game.currentTick !== tick) throw Error('Native game was not frozen during pixel control');
                return rows;
            } finally { root.matrixAutoUpdate = false; loop.tickGame = tickGame; loop.updateRenderer = updateRenderer;
                d.worldScene.cameraPan.setPan(pan); }
        });
        assert(result.pixels.every(row => row.differingBytes === 0 && row.matrixParity && row.nonzeroBytes > 1000));
        report.cases.push(result);
        await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        if (mode === '4x') {
            result.manual = [];
            for (const key of ['F8', 'F9']) {
                await app.evaluate(({ BrowserWindow }, key) => {
                    const contents = BrowserWindow.getAllWindows()[0].webContents;
                    contents.sendInputEvent({ type: 'keyDown', keyCode: key }); contents.sendInputEvent({ type: 'keyUp', keyCode: key });
                }, key);
                await page.waitForFunction(() => window.__ra2WinDiagnostic.manualCapturePhase?.status === 'CAPTURING', undefined, { timeout: 30000 });
                const movement = await page.evaluate(async () => {
                    const camera = window.__ra2debug.worldScene.cameraPan, before = { ...camera.getPan() };
                    const requested = { x: before.x + 48, y: before.y - 24 }; camera.setPan(requested);
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    return { before, requested, actual: camera.getPan() };
                });
                assert.deepEqual(movement.actual, movement.requested);
                await page.waitForFunction(() => window.__ra2WinDiagnostic.manualCapturePhase?.status === 'COMPLETE', undefined, { timeout: 30000 });
                const finishedAt = Date.now();
                while (true) {
                    const current = await read(path.join(directory, 'run.json'));
                    if (current.status === 'CAPTURED' && current.stage === 'complete') break;
                    if (Date.now() - finishedAt > 150000) throw Error('Manual capture did not finish exporting');
                    await page.waitForTimeout(200);
                }
                result.manual.push({ key, movement });
            }
            const phases = await read(path.join(directory, 'phases.json'));
            assert.equal(phases.length, 6); assert.deepEqual(phases.slice(0, 4), automatic);
            assert.equal(phases[4].instrumented, false); assert.equal(phases[5].instrumented, true);
            assert(phases.slice(4).every(phase => phase.manualCamera && phase.cameraRoute.mode === 'manual-input'
                && phase.tickEnd > phase.tickStart && phase.validity === 'VALID_BOUNDED_SAMPLE'));
            const trace = await read(path.join(directory, 'trace-status.json'));
            assert.equal(trace.status, 'CAPTURED'); assert.equal(trace.cpuProfile, 'CAPTURED');
            assert.equal(trace.requestedDuringStage, 'complete'); result.trace = trace;
            result.debuggerRestored = await app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].webContents.debugger.isAttached());
            assert(result.debuggerRestored);
        }
        assert.deepEqual(await read(path.join(directory, 'errors.json')), []);
        await app.close(); app = undefined;
        console.log(JSON.stringify({ mode, scene, status: 'PASS_COPIED_MAC_STATIC_OCTREE_NATIVE_AND_PIXELS' }));
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_COPIED_MAC_STATIC_OCTREE_CANDIDATE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); if (app) await app.close(); }
