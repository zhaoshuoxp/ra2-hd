import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [kitArgument, outputArgument, mode = '4x', action = 'close'] = process.argv.slice(2);
const manual = process.argv.includes('--manual');
assert(['close', 'quit'].includes(action));
const kit = path.resolve(kitArgument), output = path.resolve(outputArgument);
await fs.mkdir(output, { recursive: false });
const existing = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')).catch(() => []));
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN', mode, action, manual };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), `--diag-mode=${mode}`, '--diag-scene=small', '--diag-seconds=3',
        ...(manual ? [] : ['--diag-trace'])],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' },
    timeout: 60000,
});
let closed = false;
app.on('close', () => { closed = true; });
try {
    await app.firstWindow();
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    let directory, requestedAt, run, manualRequested = false;
    const started = Date.now();
    while (Date.now() - started < 150000) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !existing.has(name) && name.endsWith(`small-${mode}-none`)).sort().at(-1);
        if (latest) {
            directory = path.join(kit, 'Diagnostic-Runs', latest);
            run = JSON.parse(await fs.readFile(path.join(directory, 'run.json')));
            if (manual && !manualRequested && run.stage === 'complete') {
                manualRequested = true;
                await app.evaluate(({ BrowserWindow }) => {
                    const contents = BrowserWindow.getAllWindows()[0].webContents;
                    contents.sendInputEvent({ type: 'keyDown', keyCode: 'F9' });
                    contents.sendInputEvent({ type: 'keyUp', keyCode: 'F9' });
                });
            }
            if (!requestedAt && run.stage === 'instrumented-cpu-multiprocess-trace') {
                requestedAt = Date.now();
                report.retainedWindow = await app.evaluate(({ app, BrowserWindow }, action) => {
                    const window = BrowserWindow.getAllWindows()[0];
                    if (action === 'quit') app.quit(); else window.close();
                    return !window.isDestroyed();
                }, action);
                assert.equal(report.retainedWindow, true);
            }
            if (requestedAt && run.status !== 'RUNNING') break;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(requestedAt); assert.equal(run?.status, 'CAPTURED');
    assert.equal(run.stage, 'complete');
    const traceStatus = JSON.parse(await fs.readFile(path.join(directory, 'trace-status.json')));
    assert.equal(traceStatus.status, 'CAPTURED'); assert.equal(traceStatus.cpuProfile, 'CAPTURED');
    const trace = JSON.parse(await fs.readFile(path.join(directory, 'trace.json')));
    const profile = JSON.parse(await fs.readFile(path.join(directory, 'cpu.cpuprofile')));
    const errors = JSON.parse(await fs.readFile(path.join(directory, 'errors.json')));
    assert(trace.traceEvents.length > 0); assert(profile.samples.length > 0); assert.deepEqual(errors, []);
    report.elapsedAfterCloseRequestMs = Date.now() - requestedAt;
    assert(report.elapsedAfterCloseRequestMs >= 7000);
    report.run = run; report.traceStatus = traceStatus;
    report.traceEvents = trace.traceEvents.length; report.cpuSamples = profile.samples.length;
    report.status = 'PASS_NATIVE_CLOSE_WAITS_FOR_COMPLETE_TRACE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    if (!closed) await app.close();
}
