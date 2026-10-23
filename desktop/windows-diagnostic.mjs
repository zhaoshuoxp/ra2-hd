import { app, BrowserWindow, contentTracing, screen, powerMonitor, dialog } from 'electron';
import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DIAGNOSTIC_ID, SCHEMA_VERSION, parseDiagnosticArgs, scenarioPreferences, summarize } from './diagnostic-schema.mjs';
import { installDiagnosticProbe } from './diagnostic-renderer.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kitRoot = path.resolve(process.env.RA2_DIAGNOSTIC_ROOT ?? path.join(appRoot, '../..'));
const manifestBytes = await fs.readFile(path.join(kitRoot, 'diagnostic-manifest.json'));
const manifest = JSON.parse(manifestBytes);
if (manifest.diagnosticId !== DIAGNOSTIC_ID || manifest.schemaVersion !== SCHEMA_VERSION) throw Error('Diagnostic manifest mismatch');
if (process.argv.some(arg => /^--remote-debugging/.test(arg))) {
    if (process.platform !== 'darwin' || process.env.RA2_DIAGNOSTIC_HARNESS !== '1')
        throw Error('Diagnostic kit does not open a debugging server');
    // Playwright's Mac-only verification connection is temporary and loopback.
    app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}
const config = parseDiagnosticArgs(process.argv.slice(1));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(kitRoot, 'Diagnostic-Runs', `${stamp}-${config.scene}-${config.mode}-${config.control}`);
await fs.mkdir(output, { recursive: true });
process.env.RA2_DESKTOP_USER_DATA = path.join(output, 'Profile');
process.env.RA2_DESKTOP_NO_DISCOVERY = '1';
process.env.RA2_UI_RESOURCE_ROOT = path.join(kitRoot, 'RA2-HD-UI-Resources');
await fs.mkdir(process.env.RA2_DESKTOP_USER_DATA);
await fs.writeFile(path.join(process.env.RA2_DESKTOP_USER_DATA, 'resource-registration.json'),
    JSON.stringify({ schemaVersion: 1, directory: path.join(kitRoot, 'RA2-HD-Editions-Resources') }));

const errors = [], phases = [], metrics = [];
const run = { schemaVersion: SCHEMA_VERSION, diagnosticId: DIAGNOSTIC_ID, baseCommit: manifest.baseCommit,
    diagnosticCommit: manifest.diagnosticCommit, gameplaySourceIdentity: manifest.gameplaySourceIdentity,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    config, preferences: scenarioPreferences(config), startedAt: new Date().toISOString(), status: 'RUNNING',
    stage: 'startup', instrumentation: 'Bounded in-memory CPU/frame rows; process memory sampled at phase boundaries.',
    gpuTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE', gpuProcessBudget: 'UNAVAILABLE',
    firstUseBoundary: 'Probe installed before native GameAnimationLoop.start; resource loading precedes first game frame.',
    coldCacheBoundary: 'Fresh isolated process/profile; OS disk and driver caches are not flushed.',
    trainerBoundary: 'Historical stress trainer configuration retained; no automatic extra actor spawning.',
};
const redact = text => String(text).replaceAll(kitRoot, '<kit>').replaceAll(appRoot, '<app>').replaceAll(os.homedir(), '<home>');
let writeSequence = 0;
const save = async (name, value) => {
    const temporary = path.join(output, `${name}.tmp-${++writeSequence}`);
    await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
    await fs.rename(temporary, path.join(output, name));
};
const errorRecord = (stage, error) => errors.push({ stage, at: new Date().toISOString(), message: redact(error?.message ?? error) });
const processSample = label => metrics.push({ label, at: new Date().toISOString(), units: 'Electron memory fields are KiB; CPU is Electron CPUUsage.',
    rendererPid: contents?.getOSProcessId(), processes: app.getAppMetrics() });
let contents, started = false, busy = false, traceActive = false, debuggerActive = false, traceCaptured = false;
let traceWork, activeWork, shutdownPending = false, shutdownAllowed = false;
const evaluate = (fn, value) => contents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(value) ?? ''})`, true);
const waitFor = async (fn, timeout = 120000, value) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (contents.isDestroyed()) throw Error('Diagnostic window closed');
        if (await evaluate(fn, value)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error(`Diagnostic readiness timed out in ${run.stage}`);
};
let flushTail = Promise.resolve();
const flush = () => {
    const snapshot = JSON.parse(JSON.stringify({ run, phases, errors, metrics }));
    const pending = flushTail.then(async () => {
        await save('phases.json', snapshot.phases); await save('errors.json', snapshot.errors);
        await save('process-metrics.json', snapshot.metrics);
        const summary = snapshot.phases.map(phase => ({ label: phase.label, validity: phase.validity,
            frames: phase.summary.frameIntervals, ticks: phase.tickEnd - phase.tickStart,
            loadingToFirstGameFrameMs: phase.loadingToFirstGameFrameMs,
            renderUpdateCpuMs: phase.summary.renderUpdateCpuMs, renderSubmissionCpuMs: phase.summary.renderSubmissionCpuMs }));
        await save('summary.json', { diagnosticId: DIAGNOSTIC_ID, windowsAcceptance: 'PENDING', status: snapshot.run.status, phases: summary });
        // Publish the completion marker only after all its evidence is committed.
        await save('run.json', snapshot.run);
    });
    flushTail = pending.catch(() => {});
    return pending;
};
await flush();

async function finishPhase() {
    const phase = await evaluate(() => window.__ra2WinDiagnostic.end());
    const column = index => phase.rows.map(row => row[index]);
    phase.summary = { frameIntervals: summarize(column(1)), simulationCpuMs: summarize(column(2)),
        renderUpdateCpuMs: summarize(column(4)), renderSubmissionCpuMs: summarize(column(5)),
        drawCalls: summarize(column(6), false), triangles: summarize(column(7), false) };
    phase.instrumented = phase.label.startsWith('instrumented');
    phase.validity = phase.rows.length && phase.endState.visibility === 'visible' && !phase.visibilityEvents.length
        && !phase.focusEvents.includes('blur') && !phase.resizeEvents.length && phase.endState.focused
        && (phase.frozen ? phase.tickEnd === phase.tickStart : phase.tickEnd > phase.tickStart)
        ? 'VALID_BOUNDED_SAMPLE' : 'INVALID_OR_INTERRUPTED_SAMPLE';
    phases.push(phase); processSample(phase.label + '-end');
    await flush();
    return phase;
}

async function measure(label, seconds = config.seconds) {
    run.stage = label;
    await save('run.json', run);
    processSample(label + '-start');
    await evaluate(({ label, frozen }) => window.__ra2WinDiagnostic.begin(label, frozen), { label, frozen: config.control === 'frozen' });
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    return finishPhase();
}

function captureTrace(measureOwnPhase = true) {
    if (traceWork) return traceWork;
    traceWork = recordTrace(measureOwnPhase).finally(() => { traceWork = undefined; });
    return traceWork;
}

async function recordTrace(measureOwnPhase) {
    if (traceCaptured) throw Error('This process already captured its one trace; start a fresh process for another');
    traceCaptured = true;
    const categories = await contentTracing.getCategories();
    const wanted = ['toplevel', 'v8', 'gpu', 'cc', 'viz', 'blink', 'renderer.scheduler', 'devtools.timeline',
        'disabled-by-default-v8.gc', 'disabled-by-default-devtools.timeline', 'disabled-by-default-gpu.service'];
    const selected = wanted.filter(category => categories.includes(category));
    let status = { status: 'RUNNING', categories: selected, missingCategories: wanted.filter(c => !selected.includes(c)),
        debuggerTransport: 'In-process Electron WebContents debugger; no TCP port',
        durationSeconds: 8, cpuProfile: 'UNAVAILABLE', requestedDuringStage: run.stage,
        overlap: measureOwnPhase ? 'Separate instrumented phase' : 'Existing/overlapping phases explicitly relabeled instrumented',
        materialProgramUploadEvents: 'Trace dependent; unavailable if not emitted' };
    let traceStop;
    const stopTrace = () => traceStop ??= contentTracing.stopRecording(path.join(output, 'trace.json'));
    try {
        await contentTracing.startRecording({ included_categories: selected, excluded_categories: ['*'], recording_mode: 'record-until-full' });
        traceActive = true;
        run.profilingBoundary = 'Use a separate untouched Normal run for baseline timings. Overlapping and subsequent phases in this process are instrumented.';
        await evaluate(() => window.__ra2WinDiagnostic.setTraceActive(true));
        await evaluate(() => window.__ra2WinDiagnostic.startDetailed());
        try {
            contents.debugger.attach('1.3'); debuggerActive = true;
            await contents.debugger.sendCommand('Profiler.enable');
            await contents.debugger.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
            await contents.debugger.sendCommand('Profiler.start');
        } catch (error) { errorRecord('cpu-profile-start', error); }
        if (measureOwnPhase) await measure('instrumented-cpu-multiprocess-trace', 8);
        else await new Promise(resolve => setTimeout(resolve, 8000));
        status.webglCalls = await evaluate(() => window.__ra2WinDiagnostic.endDetailed());
        if (debuggerActive) {
            const result = await contents.debugger.sendCommand('Profiler.stop');
            await save('cpu.cpuprofile', result.profile); status.cpuProfile = 'CAPTURED';
        }
        const window = BrowserWindow.fromWebContents(contents);
        if (window && !window.isDestroyed()) window.setTitle(`${DIAGNOSTIC_ID} - saving trace - please wait`);
        await stopTrace(); traceActive = false;
        status.status = 'CAPTURED';
    } catch (error) { status.status = 'FAILED'; errorRecord('trace', error); }
    finally {
        if (!contents.isDestroyed()) await evaluate(() => {
            window.__ra2WinDiagnostic.endDetailed(); window.__ra2WinDiagnostic.setTraceActive(false);
        }).catch(error => errorRecord('gl-capture-restore', error));
        if (traceActive) {
            try { await stopTrace(); } catch (error) { errorRecord('trace-stop', error); }
            traceActive = false;
        }
        if (debuggerActive) { contents.debugger.detach(); debuggerActive = false; }
        await save('trace-status.json', status); await flush();
    }
}

async function diagnostics(window) {
    contents = window.webContents;
    window.setContentSize(...config.contentSize); window.center(); window.show(); window.focus();
    if (config.displayMode === 'native-fullscreen') {
        if (process.platform === 'darwin') window.setSimpleFullScreen(true);
        else await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Native fullscreen transition timed out')), 10000);
            window.once('enter-full-screen', () => { clearTimeout(timer); resolve(); });
            window.setFullScreen(true);
        });
    }
    await new Promise(resolve => setTimeout(resolve, 300));
    run.actualContentSize = window.getContentSize();
    run.actualDisplayMode = window.isFullScreen() || window.isSimpleFullScreen?.() ? 'native-fullscreen' : 'window';
    const cpus = os.cpus();
    const machine = { schemaVersion: SCHEMA_VERSION, runtime: process.versions, platform: process.platform, arch: process.arch,
        cpu: { model: cpus[0]?.model, logicalProcessors: cpus.length }, memoryBytes: os.totalmem(),
        osRelease: os.release(), onBattery: powerMonitor.isOnBatteryPower(),
        displays: screen.getAllDisplays().map(d => ({ bounds: d.bounds, workArea: d.workArea, size: d.size,
            scaleFactor: d.scaleFactor, rotation: d.rotation, displayFrequency: d.displayFrequency,
            internal: d.internal, colorDepth: d.colorDepth })),
        gpuFeatureStatus: app.getGPUFeatureStatus(), actualProcessGpuBudget: 'UNAVAILABLE' };
    try { machine.gpu = await app.getGPUInfo('complete'); } catch (error) { errorRecord('gpu-info', error); machine.gpu = 'UNAVAILABLE'; }
    await save('machine.json', machine);
    if (process.platform === 'win32') {
        try {
            const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
            const result = await promisify(execFile)(powershell,
                ['-NoProfile', '-NonInteractive', '-Command', await fs.readFile(path.join(appRoot, 'desktop/diagnostic-machine.ps1'), 'utf8')],
                { timeout: 20000, windowsHide: true, maxBuffer: 1024 * 1024 });
            await save('os.json', JSON.parse(result.stdout.replace(/^\uFEFF/, '')));
        } catch (error) { errorRecord('windows-machine-probe', error); await save('os.json', { status: 'UNAVAILABLE', reason: 'Read-only PowerShell probe failed; see errors.json' }); }
    } else await save('os.json', { status: 'NOT_WINDOWS', nativeWindows: 'NOT_RUN' });
    run.stage = 'edition-selection'; await flush();
    await waitFor(() => !!document.querySelector('[data-edition="yr"]'));
    await evaluate(() => document.querySelector('[data-edition="yr"]').click());
    await waitFor(() => !!window.__ra2debug?.generalOptions);
    await evaluate(preferences => {
        Object.entries(preferences).forEach(([key, value]) => localStorage.setItem(key, value));
    }, run.preferences);
    await evaluate(installDiagnosticProbe);
    const locale = JSON.parse(await fs.readFile(path.join(appRoot, 'dist/res/locale/zh-CN.json'), 'utf8'));
    await waitFor(label => [...document.querySelectorAll('button')].some(button => /Skirmish/i.test(button.textContent)
        || button.textContent.includes(label)), 120000, locale['hd:menuskirmish']);
    await evaluate(label => {
        const button = [...document.querySelectorAll('button')].find(button => button.textContent.includes(label) || /Skirmish/i.test(button.textContent));
        if (!button) throw Error('Skirmish menu is unavailable'); button.click();
    }, locale['hd:menuskirmish']);
    await waitFor(() => !!window.__ra2debug?.skirmishLobby?.gameOpts);
    await evaluate(config => {
        const d = window.__ra2debug, graphics = d.generalOptions.graphics;
        graphics.renderResolution.value = config.renderResolution;
        graphics.hdEnabled.value = config.mode !== 'original'; graphics.hdDensity.value = config.mode === '2x' ? 2 : 4;
        graphics.models.value = 1; graphics.shadows.value = config.shadows;
        d.performance.setEnabled('telemetry', false);
    }, config);
    run.lobby = await evaluate(() => ({ gameOptions: window.__ra2debug.skirmishLobby.gameOpts,
        slots: window.__ra2debug.skirmishLobby.formModel }));
    run.stage = 'first-use'; processSample('first-use-before-loading'); await flush();
    await evaluate(frozen => window.__ra2WinDiagnostic.begin('fresh-process-first-use', frozen), config.control === 'frozen');
    await evaluate(timestamp => window.__ra2debug.skirmishLobby.startGame(timestamp), config.timestamp);
    await waitFor(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen?.gameAnimationLoop?.isStarted);
    await new Promise(resolve => setTimeout(resolve, config.seconds * 1000));
    const first = await finishPhase();
    if (first.endState.players !== (config.scene === 'stress' ? 8 : 2) || first.endState.bots !== (config.scene === 'stress' ? 7 : 1))
        throw Error('Realized scene does not match the frozen player/AI configuration');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await measure('warmed-steady');
    run.stage = 'same-process-reentry'; await flush();
    await evaluate(frozen => window.__ra2WinDiagnostic.begin('same-process-reentry-first-use', frozen), config.control === 'frozen');
    await evaluate(async () => {
        if (!Object.getOwnPropertyDescriptor(window.r ?? {}, 'reset')?.get) throw Error('Native same-process reset command unavailable');
        await window.r.reset;
    });
    await waitFor(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen?.gameAnimationLoop?.isStarted);
    await new Promise(resolve => setTimeout(resolve, config.seconds * 1000));
    await finishPhase();
    await new Promise(resolve => setTimeout(resolve, 3000));
    await measure('same-process-reentry-warmed');
    if (config.trace && !traceCaptured) await captureTrace();
    if (traceWork) await traceWork;
    run.status = phases.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE')
        ? errors.length ? 'CAPTURED_WITH_ERRORS' : 'CAPTURED' : 'CAPTURED_WITH_INVALID_SAMPLES';
    run.stage = 'complete'; run.finishedAt = new Date().toISOString(); await flush();
    window.setTitle(`${DIAGNOSTIC_ID} - capture complete - F8 manual sample / F9 trace`);
    if (shutdownPending) return;
    await dialog.showMessageBox(window, { type: 'info', title: 'Diagnostic capture complete',
        message: 'Reports are saved. Compare the other two density modes in fresh processes.',
        detail: 'If this scene reproduces the slowdown, close the game and use Export-Reports.cmd. If it does not, use the stress scene. F8 captures a manual 15-second sample; F9 captures one 8-second CPU/multiprocess trace. Export also preserves errors and invalid samples.' });
}

app.on('browser-window-created', (_, window) => {
    window.on('close', event => {
        if (shutdownAllowed || !(traceWork || busy && traceCaptured)) return;
        event.preventDefault();
        if (shutdownPending) return;
        shutdownPending = true;
        void settleCaptureForShutdown().then(() => { shutdownAllowed = true; window.close(); });
    });
    window.webContents.on('console-message', details => {
        if (details.level === 'error' && errors.length < 1000) errorRecord('renderer-console', details.message);
    });
    window.webContents.on('render-process-gone', (_, details) => { errorRecord('renderer-gone', JSON.stringify(details)); run.status = 'RENDERER_GONE'; void flush(); });
    window.webContents.on('did-finish-load', () => {
        if (started) return; started = true; busy = true;
        activeWork = diagnostics(window).catch(async error => {
            run.status = 'FAILED'; errorRecord(run.stage, error); await flush();
            if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'error', message: 'Diagnostic capture failed', detail: redact(error.message) + '\nClose the game and export reports, including this failure.' });
        }).finally(() => { busy = false; });
    });
    window.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !['F8', 'F9'].includes(input.key)) return;
        event.preventDefault();
        if (input.key === 'F9' && busy && contents && ['first-use', 'warmed-steady', 'same-process-reentry',
            'same-process-reentry-warmed'].includes(run.stage)) {
            if (!traceCaptured) void captureTrace(false).catch(error => errorRecord('overlapping-trace', error));
            return;
        }
        if (busy || !contents || run.stage !== 'complete') return;
        busy = true; run.status = 'RUNNING';
        window.setTitle(`${DIAGNOSTIC_ID} - capturing ${input.key === 'F9' ? 'trace' : 'manual sample'} - please wait`);
        const action = input.key === 'F9' ? () => captureTrace() : () => measure(`manual-${phases.length + 1}`);
        activeWork = action().catch(error => errorRecord('manual-capture', error)).finally(async () => {
            busy = false; run.stage = 'complete';
            run.status = phases.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE')
                ? errors.length ? 'CAPTURED_WITH_ERRORS' : 'CAPTURED' : 'CAPTURED_WITH_INVALID_SAMPLES';
            await flush();
            if (!window.isDestroyed()) window.setTitle(`${DIAGNOSTIC_ID} - capture complete - F8 manual sample / F9 trace`);
        });
    });
});
async function settleCaptureForShutdown() {
    // The capture owns the sole stopRecording call and all report writes.
    // Keep WebContents alive until that same lifecycle has finished.
    await Promise.allSettled([activeWork, traceWork]);
    await flush().catch(error => errorRecord('shutdown-flush', error));
}
app.on('before-quit', event => {
    if (shutdownAllowed || !(traceWork || busy && traceCaptured)) return;
    event.preventDefault();
    if (shutdownPending) return;
    shutdownPending = true;
    void settleCaptureForShutdown().then(() => { shutdownAllowed = true; app.quit(); });
});
app.on('will-quit', () => {
    if (run.status === 'RUNNING') run.status = 'INTERRUPTED';
    // Shutdown does not await promises; write only owned diagnostic metadata.
    writeFileSync(path.join(output, 'run.json'), JSON.stringify(run, null, 2));
    writeFileSync(path.join(output, 'errors.json'), JSON.stringify(errors, null, 2));
});
await import('./main.mjs');
