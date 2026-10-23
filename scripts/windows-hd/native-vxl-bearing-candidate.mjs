import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const [kitArg, outputArg] = process.argv.slice(2), kit = path.resolve(kitArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: process.platform, windows: 'NOT_RUN', errors: [], cases: [],
    boundary: 'Copied packaged Mac candidate, native progressing matches and same-state legacy cached-bearing preparation pixel/matrix controls outside timing. No Windows FPS claim.' };
const bundle = path.join(output, 'Vxl-Bearing-QA.app'), execute = promisify(execFile);
await execute('cp', ['-cR', await fs.realpath('node_modules/electron/dist/Electron.app'), bundle]);
const executable = path.join(bundle, 'Contents/MacOS/Red Alert 2 HD');
await fs.rename(path.join(bundle, 'Contents/MacOS/Electron'), executable);
await execute('plutil', ['-replace', 'CFBundleExecutable', '-string', 'Red Alert 2 HD', path.join(bundle, 'Contents/Info.plist')]);
const payload = path.join(bundle, 'Contents/Resources/app'); await fs.mkdir(payload);
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify({ name: 'ra2-hd-vxl-bearing-qa', version: '1.0.0', type: 'module',
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
        if (mode === '4x') {
            const waitStarted = Date.now();
            while (await page.evaluate(() => window.__ra2debug.game.currentTick < 9000)) {
                if (Date.now() - waitStarted > 240000) throw Error('Late combat threshold timed out');
                await page.waitForTimeout(10000);
                console.log(JSON.stringify(await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick }))));
            }
        }
        result.bearings = await page.evaluate(() => {
            const d = window.__ra2debug, loop = d.gameScreen.gameAnimationLoop, renderer = d.renderer;
            const root = d.renderableManager.getRenderableContainer().get3DObject(), gl = renderer.renderer.getContext();
            if (root.matrixAutoUpdate !== false) throw Error('C8 matrix policy was lost');
            const models = d.renderableManager.getRenderableContainer().getChildren().map(r => r.unitVxlHd).filter(Boolean);
            const tickGame = loop.tickGame, updateRenderer = loop.updateRenderer, pan = { ...d.worldScene.cameraPan.getPan() };
            const tick = d.game.currentTick, now = performance.now, fixedNow = now.call(performance), restores = [], rows = [];
            let legacy = false, count = false, poseCalls = 0;
            const heading = yaw => Math.floor((((yaw % 360) + 360) % 360 + 22.5) / 45) % 8 * 45;
            for (const model of models) {
                const copy = model.pose.copy;
                model.pose.copy = function (...args) { if (count) poseCalls++; return copy.apply(this, args); };
                restores.push(() => { delete model.pose.copy; if (model.pose.copy !== copy) throw Error('Pose hook not restored'); });
                for (const layer of model.layers) for (const frame of layer.frames) {
                    const update = frame.update;
                    frame.update = function (...args) {
                        const u = model.r.gameObject, yaw = layer.rotor ? 0 : layer.turret ? Math.floor(u.turretTrait.facing)
                            : (model.r.tiltObj.rotation.y + (model.r.dirWrapObj?.rotation.y ?? 0)) * 180 / Math.PI;
                        if (legacy && model.family.identity !== 'DISK' && heading(yaw) !== frame.frame.heading) {
                            // Reproduce C8's unused pose/uniform preparation; FrameLayer still detaches the view.
                            const current = model.r.posObj.matrixWorld.clone().invert().multiply(layer.mesh.matrixWorld);
                            const actualYaw = u.rules.missileSpawn ? frame.frame.heading : yaw;
                            const flat = model.pose.clone().makeRotationY((actualYaw - frame.frame.heading) * Math.PI / 180)
                                .multiply(model.pose.clone().fromArray(frame.frame.referenceLinear));
                            flat.setPosition(0, 0, 0); model.pose.copy(current).multiply(flat.invert());
                            if (frame.part.actor === 'YTNK' && frame.part.member === 'ytnktur.vxl'
                                && ['CYLINDER14', 'CYLINDER22'].includes(frame.part.section)) {
                                const active = !!u.rules.isGattling && u.armedTrait.gattlingHeat > 0 && !u.attackTrait.isIdle();
                                for (const material of [frame.batch.material, frame.depth.material, frame.translucent.material,
                                    ...frame.batch.children.map(child => child.material)]) {
                                    material.uniforms.gattlingPhase.value = model.gattlingPhase;
                                    material.uniforms.gattlingActive.value = Number(active);
                                }
                                frame.batch.userData.gattlingStage = u.armedTrait.getGattlingStage();
                                frame.batch.userData.gattlingSpinRate = active ? [1, 2, 4][u.armedTrait.getGattlingStage()] : 0;
                            }
                        }
                        return update.apply(this, args);
                    };
                    restores.push(() => { delete frame.update; if (frame.update !== update) throw Error('Frame hook not restored'); });
                }
            }
            const pixels = () => {
                renderer.render(); const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
                return bytes;
            };
            const matrices = () => { const values = []; d.worldScene.scene.traverse(o => values.push([o.id, ...o.matrixWorld.elements])); return JSON.stringify(values); };
            loop.tickGame = () => true; loop.updateRenderer = () => {}; performance.now = () => fixedNow;
            try {
                for (const offset of [{ x: 0, y: 0 }, { x: -350, y: 150 }, { x: 350, y: -150 }]) {
                    d.worldScene.cameraPan.setPan({ x: pan.x + offset.x, y: pan.y + offset.y });
                    legacy = true; renderer.update(0); renderer.update(0);
                    count = true; poseCalls = 0; renderer.update(0); const baselinePoses = poseCalls; count = false;
                    const baseline = pixels(), before = matrices();
                    legacy = false; count = true; poseCalls = 0; renderer.update(0); const candidatePoses = poseCalls; count = false;
                    const candidate = pixels(), after = matrices();
                    rows.push({ tick, models: models.length, offset, baselinePoses, candidatePoses,
                        differingBytes: baseline.reduce((n, value, i) => n + Number(value !== candidate[i]), 0),
                        comparedBytes: baseline.length, nonzeroBytes: baseline.reduce((n, value) => n + Number(value !== 0), 0),
                        matrixParity: before === after });
                }
                if (d.game.currentTick !== tick) throw Error('Native game was not frozen during controls');
                return rows;
            } finally {
                for (const restore of restores.reverse()) restore(); performance.now = now;
                loop.tickGame = tickGame; loop.updateRenderer = updateRenderer; d.worldScene.cameraPan.setPan(pan);
            }
        });
        assert(result.bearings.every(row => row.differingBytes === 0 && row.matrixParity && row.nonzeroBytes > 1000));
        assert(result.bearings.every(row => mode === 'original' ? row.models === 0 && row.candidatePoses === 0
            : row.models > 0 && row.baselinePoses > row.candidatePoses));
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
        console.log(JSON.stringify({ mode, scene, status: 'PASS_COPIED_MAC_VXL_BEARING_NATIVE_AND_PIXELS' }));
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_COPIED_MAC_VXL_BEARING_CANDIDATE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); if (app) await app.close(); }
