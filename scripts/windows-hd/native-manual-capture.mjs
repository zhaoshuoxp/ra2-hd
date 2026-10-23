import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const [kit, companion, output] = process.argv.slice(2).map(value => path.resolve(value));
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', errors: [],
    boundary: 'Copied packaged Mac entry, four automatic phases, late F8/F9 with native camera movement, restoration and original C7 export. No Windows performance claim.' };
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const { verifyKit, exportReports } = await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-export.mjs')).href);
report.verification = await verifyKit(kit); assert.equal(report.verification.status, 'PASS');
const bundle = path.join(output, 'Manual-Capture-QA.app');
await promisify(execFile)('cp', ['-cR', await fs.realpath('node_modules/electron/dist/Electron.app'), bundle]);
const executable = path.join(bundle, 'Contents/MacOS/Red Alert 2 HD');
await fs.rename(path.join(bundle, 'Contents/MacOS/Electron'), executable);
await promisify(execFile)('plutil', ['-replace', 'CFBundleExecutable', '-string', 'Red Alert 2 HD',
    path.join(bundle, 'Contents/Info.plist')]);
const resources = path.join(bundle, 'Contents/Resources/app');
await fs.mkdir(resources);
await fs.writeFile(path.join(resources, 'package.json'), JSON.stringify({ name: 'ra2-hd-manual-capture-qa',
    version: '1.0.0', type: 'module', main: path.relative(resources, path.join(companion, 'manual-capture-entry.mjs')) }) + '\n', { flag: 'wx' });
const receipt = path.join(output, 'runtime-receipt.json');
await fs.writeFile(receipt, JSON.stringify({ status: 'COPIED_MAC_PACKAGED_HARNESS', verification: report.verification }) + '\n', { flag: 'wx' });
const before = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')));
let app;
try {
    app = await electron.launch({ executablePath: executable,
        args: ['--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=3'], timeout: 60000,
        env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit,
            RA2_DIAGNOSTIC_HARNESS: '1', RA2_MANUAL_CAPTURE_RUNTIME_RECEIPT: receipt } });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    report.packaged = await app.evaluate(({ app }) => app.isPackaged); assert.equal(report.packaged, true);
    await page.waitForFunction(() => window.__ra2WinDiagnostic && window.__ra2debug?.game?.status === 1,
        undefined, { timeout: 120000 });
    let directory;
    const waitRun = async predicate => {
        const started = Date.now();
        while (Date.now() - started < 150000) {
            if (!directory) {
                const name = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
                    .filter(name => !before.has(name) && name.endsWith('stress-4x-none')).at(-1);
                if (name) directory = path.join(kit, 'Diagnostic-Runs', name);
            }
            const run = directory && await json(path.join(directory, 'run.json')).catch(() => null);
            if (run && predicate(run)) return run;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw Error('Native manual-capture readiness timed out');
    };
    await waitRun(run => run.stage === 'complete' && run.status === 'CAPTURED');
    const automatic = await json(path.join(directory, 'phases.json'));
    assert.equal(automatic.length, 4);
    assert(automatic.every(phase => !phase.manualCamera && !phase.instrumented && phase.cameraRoute.xAmplitude === 350
        && phase.cameraRoute.yAmplitude === 150 && phase.validity === 'VALID_BOUNDED_SAMPLE'));
    report.automaticSha256 = sha(automatic);
    await page.evaluate(() => {
        const renderer = window.__ra2debug.renderer.renderer, gl = renderer.getContext();
        window.__manualCaptureOriginals = { gl, state: renderer.state, setMaterial: renderer.state.setMaterial,
            methods: Object.fromEntries(['useProgram', 'compileShader', 'linkProgram', 'getProgramInfoLog',
                'texImage2D', 'texSubImage2D', 'compressedTexImage2D', 'compressedTexSubImage2D'].map(name => [name, gl[name]])) };
    });
    const key = async value => app.evaluate(({ BrowserWindow }, value) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.sendInputEvent({ type: 'keyDown', keyCode: value });
        contents.sendInputEvent({ type: 'keyUp', keyCode: value });
    }, value);
    const cameraControl = async keyName => {
        await key(keyName);
        await page.waitForFunction(() => window.__ra2WinDiagnostic.manualCapturePhase?.status === 'CAPTURING',
            undefined, { timeout: 30000 });
        const movement = [];
        for (const delta of [[90, -30], [-70, 40]]) {
            movement.push(await page.evaluate(async delta => {
                const pan = window.__ra2debug.worldScene.cameraPan;
                const before = { ...pan.getPan() };
                pan.setPan({ x: before.x + delta[0], y: before.y + delta[1] });
                const requested = { ...pan.getPan() };
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                return { before, requested, afterTwoFrames: { ...pan.getPan() } };
            }, delta));
            assert.notDeepEqual(movement.at(-1).before, movement.at(-1).requested);
            assert.deepEqual(movement.at(-1).afterTwoFrames, movement.at(-1).requested);
        }
        await page.waitForFunction(() => window.__ra2WinDiagnostic.manualCapturePhase?.status === 'COMPLETE',
            undefined, { timeout: 30000 });
        const finalPan = await page.evaluate(() => ({ ...window.__ra2debug.worldScene.cameraPan.getPan() }));
        assert.deepEqual(finalPan, movement.at(-1).requested);
        await waitRun(run => run.stage === 'complete' && run.status === 'CAPTURED');
        return { key: keyName, movement, finalPan };
    };
    report.f8 = await cameraControl('F8');
    let phases = await json(path.join(directory, 'phases.json'));
    assert.equal(phases.length, 5); assert.equal(phases[4].manualCamera, true); assert.equal(phases[4].instrumented, false);
    assert.equal(phases[4].cameraRoute.mode, 'manual-input'); assert.equal(sha(phases.slice(0, 4)), report.automaticSha256);
    const normalSha = sha(phases[4]);
    report.f9 = await cameraControl('F9');
    phases = await json(path.join(directory, 'phases.json'));
    assert.equal(phases.length, 6); assert.equal(sha(phases.slice(0, 4)), report.automaticSha256);
    assert.equal(sha(phases[4]), normalSha); assert.equal(phases[5].manualCamera, true); assert.equal(phases[5].instrumented, true);
    assert.equal(phases[5].cameraRoute.mode, 'manual-input');
    report.phases = phases.map(phase => ({ label: phase.label, validity: phase.validity, instrumented: phase.instrumented,
        manualCamera: !!phase.manualCamera, cameraRoute: phase.cameraRoute, frames: phase.rows.length,
        ticks: phase.tickEnd - phase.tickStart, players: phase.endState.players, bots: phase.endState.bots,
        output: phase.endState.output, actualHdBindings: phase.endState.bindings.filter(b => b.shp || b.vxl || b.rhino).length }));
    assert(report.phases.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE' && phase.ticks > 0
        && phase.players === 8 && phase.bots === 7 && phase.actualHdBindings > 0));
    report.trace = await json(path.join(directory, 'trace-status.json'));
    assert.equal(report.trace.status, 'CAPTURED'); assert.equal(report.trace.cpuProfile, 'CAPTURED');
    assert.equal(report.trace.requestedDuringStage, 'complete');
    assert((await json(path.join(directory, 'cpu.cpuprofile'))).samples.length > 0);
    assert((await json(path.join(directory, 'trace.json'))).traceEvents.length > 0);
    report.restoration = await page.evaluate(() => {
        const p = window.__manualCaptureOriginals;
        return { detailedAbsent: !window.__ra2WinDiagnostic.detailed, traceInactive: !window.__ra2WinDiagnostic.traceActive,
            setMaterial: p.state.setMaterial === p.setMaterial,
            methods: Object.fromEntries(Object.entries(p.methods).map(([name, value]) => [name, p.gl[name] === value])) };
    });
    assert(report.restoration.detailedAbsent && report.restoration.traceInactive && report.restoration.setMaterial
        && Object.values(report.restoration.methods).every(Boolean));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.debugger.isAttached()), false);
    report.notes = await fs.readFile(path.join(directory, 'USER-NOTES.txt'), 'utf8');
    assert(report.notes.includes('C7-MANUAL-M1') && report.notes.includes('INSTALLED') && !report.notes.includes('COMPANION_FAILED'));
    assert.deepEqual(await json(path.join(directory, 'errors.json')), []); assert.deepEqual(report.errors, []);
    await app.close(); app = undefined;
    report.run = await json(path.join(directory, 'run.json')); assert.equal(report.run.status, 'CAPTURED');
    report.export = await exportReports(kit);
    report.status = 'PASS_NATIVE_MANUAL_CAMERA_F8_F9_EXPORT_AND_RESTORATION';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); if (app) await app.close(); }
