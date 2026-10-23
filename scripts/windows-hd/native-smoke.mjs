import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [payload, kit, output] = process.argv.slice(2, 5).map(value => path.resolve(value));
const mode = process.argv[5] ?? '2x', scene = process.argv[6] ?? 'small';
const tracing = process.argv.includes('--trace');
const earlyTrace = process.argv.includes('--early-trace');
const seconds = Number(process.argv.find(arg => arg.startsWith('--seconds='))?.split('=')[1] ?? 3);
const earlyDelayMs = Number(process.argv.find(arg => arg.startsWith('--early-delay-ms='))?.split('=')[1] ?? 0);
assert(Number.isInteger(seconds) && seconds >= 3 && seconds <= 60);
assert(Number.isInteger(earlyDelayMs) && earlyDelayMs >= 0 && earlyDelayMs < seconds * 1000);
const control = process.argv.find(arg => arg.startsWith('--control='))?.split('=')[1] ?? 'none';
await fs.mkdir(output, { recursive: false });
const app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [payload, `--diag-mode=${mode}`, `--diag-scene=${scene}`, `--diag-control=${control}`,
        `--diag-seconds=${seconds}`, ...(tracing ? ['--diag-trace'] : [])], timeout: 60000,
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' } });
const report = { platform: 'darwin-arm64', windows: 'NOT_RUN', status: 'RUNNING', errors: [], seconds, earlyTrace, earlyDelayMs };
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    const dialogs = [];
    // Electron dialogs are closed by the main-process test, outside measured loops.
    await app.evaluate(({ dialog }) => {
        dialog.showMessageBox = async (...args) => {
            globalThis.__diagnosticDialogs ??= [];
            globalThis.__diagnosticDialogs.push(args.at(-1));
            return { response: 0, checkboxChecked: false };
        };
    });
    await page.waitForFunction(() => window.__ra2WinDiagnostic, undefined, { timeout: 120000 });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 120000 });
    if (earlyTrace) {
        await page.waitForFunction(() => window.__ra2debug?.gameScreen?.gameAnimationLoop?.isStarted, undefined, { timeout: 120000 });
        await page.waitForTimeout(earlyDelayMs);
        await app.evaluate(({ BrowserWindow }) => {
            const contents = BrowserWindow.getAllWindows()[0].webContents;
            contents.sendInputEvent({ type: 'keyDown', keyCode: 'F9' });
            contents.sendInputEvent({ type: 'keyUp', keyCode: 'F9' });
        });
    }
    const captureStarted = Date.now();
    let runPath, run;
    while (Date.now() - captureStarted < 150000) {
        const directories = await fs.readdir(path.join(kit, 'Diagnostic-Runs'));
        const latest = directories.filter(name => name.endsWith(`${scene}-${mode}-${control}`)).sort().at(-1);
        if (latest) {
            runPath = path.join(kit, 'Diagnostic-Runs', latest);
            run = JSON.parse(await fs.readFile(path.join(runPath, 'run.json'), 'utf8'));
            if (run.status !== 'RUNNING') break;
        }
        await page.waitForTimeout(1000);
    }
    dialogs.push(...await app.evaluate(() => globalThis.__diagnosticDialogs ?? []));
    const phases = JSON.parse(await fs.readFile(path.join(runPath, 'phases.json'), 'utf8'));
    report.run = run; report.phases = phases; report.dialogs = dialogs;
    assert.equal(run.status, 'CAPTURED'); assert.equal(phases.length, tracing ? 5 : 4);
    for (const phase of phases) {
        assert.equal(phase.endState.players, scene === 'stress' ? 8 : 2);
        assert.equal(phase.endState.bots, scene === 'stress' ? 7 : 1);
        assert.equal(phase.endState.graphics.models, 1); assert.equal(phase.endState.graphics.shadows, control === 'shadows-off' ? 0 : 3);
        assert.equal(phase.endState.graphics.enabled, mode !== 'original');
        if (control === 'frozen') assert.equal(phase.tickEnd, phase.tickStart); else assert(phase.tickEnd > phase.tickStart);
        assert.equal(phase.endState.graphics.renderResolution, control === '720p' ? '720p' : 'native');
        if (control === '720p') assert.equal(phase.endState.output.effective[1], 720);
        const expectedContent = run.actualContentSize;
        assert.deepEqual(phase.endState.viewport, expectedContent);
        assert(Math.abs(phase.endState.logicalSize[0] - 900 * expectedContent[0] / expectedContent[1]) < .0001);
        assert.equal(phase.endState.logicalSize[1], 900);
        assert.equal(phase.validity, 'VALID_BOUNDED_SAMPLE'); assert(phase.rows.length > 0);
        if (mode !== 'original') {
            assert.equal(phase.endState.graphics.density, mode === '2x' ? 2 : 4);
            assert(phase.endState.bindings.some(binding => binding.vxl || binding.shp || binding.rhino));
        } else assert(!phase.endState.bindings.some(binding => binding.vxl || binding.shp || binding.rhino));
    }
    if (tracing || earlyTrace) {
        const traceStatus = JSON.parse(await fs.readFile(path.join(runPath, 'trace-status.json'), 'utf8'));
        assert.equal(traceStatus.status, 'CAPTURED'); assert.equal(traceStatus.cpuProfile, 'CAPTURED');
        assert(traceStatus.webglCalls.methods.useProgram.calls > 0);
        assert(traceStatus.webglCalls.materialCalls > 0); assert(traceStatus.webglCalls.materialChanges > 0);
        const profile = JSON.parse(await fs.readFile(path.join(runPath, 'cpu.cpuprofile'), 'utf8'));
        assert(profile.nodes.length > 0); assert(profile.samples.length > 0);
        const trace = JSON.parse(await fs.readFile(path.join(runPath, 'trace.json'), 'utf8'));
        assert(trace.traceEvents.length > 0);
        assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.debugger.isAttached()), false);
        if (earlyTrace) assert(phases.some(phase => phase.instrumented));
    }
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_NATIVE_MAC_TOOLING_SMOKE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
