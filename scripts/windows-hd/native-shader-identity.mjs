import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const [kitArg, companionArg, outputArg] = process.argv.slice(2);
const kit = path.resolve(kitArg), companion = path.resolve(companionArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN',
    boundary: 'Copied packaged Mac execution of the actual companion entry, automatic warmed F9 capture, restoration, deferred close and original C6 export. No Windows gain claim.', errors: [] };
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const { verifyKit, exportReports } = await import(pathToFileURL(path.join(kit, 'resources/app/desktop/diagnostic-export.mjs')).href);
report.verification = await verifyKit(kit); assert.equal(report.verification.status, 'PASS');
const originalBundle = await fs.realpath('node_modules/electron/dist/Electron.app');
const copiedBundle = path.join(output, 'Shader-Identity-QA.app');
await promisify(execFile)('cp', ['-cR', originalBundle, copiedBundle]);
const executable = path.join(copiedBundle, 'Contents/MacOS/Red Alert 2 HD');
await fs.rename(path.join(copiedBundle, 'Contents/MacOS/Electron'), executable);
await promisify(execFile)('plutil', ['-replace', 'CFBundleExecutable', '-string', 'Red Alert 2 HD',
    path.join(copiedBundle, 'Contents/Info.plist')]);
const resources = path.join(copiedBundle, 'Contents/Resources/app');
await fs.mkdir(resources);
await fs.writeFile(path.join(resources, 'package.json'), JSON.stringify({ name: 'ra2-hd-shader-identity-qa',
    version: '1.0.0', type: 'module', main: path.relative(resources, path.join(companion, 'shader-identity-entry.mjs')) }) + '\n', { flag: 'wx' });
const receipt = path.join(output, 'runtime-receipt.json');
await fs.writeFile(receipt, JSON.stringify({ status: 'COPIED_MAC_PACKAGED_HARNESS', verification: report.verification }) + '\n', { flag: 'wx' });
const before = new Set(await fs.readdir(path.join(kit, 'Diagnostic-Runs')));
let app, closed = false;
try {
    app = await electron.launch({ executablePath: executable,
        args: ['--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=15'],
        env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit,
            RA2_DIAGNOSTIC_HARNESS: '1', RA2_SHADER_IDENTITY_RUNTIME_RECEIPT: receipt }, timeout: 60000 });
    app.on('close', () => { closed = true; });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    report.packaged = await app.evaluate(({ app }) => app.isPackaged); assert.equal(report.packaged, true);
    await page.waitForFunction(() => window.__ra2debug?.renderer?.renderer && window.__ra2WinDiagnostic?.shaderIdentityInstalled,
        undefined, { timeout: 120000 });
    await page.evaluate(() => {
        const renderer = window.__ra2debug.renderer.renderer, gl = renderer.getContext();
        window.__shaderIdentityOriginals = { renderer, gl, direct: renderer.renderBufferDirect,
            methods: Object.fromEntries(['shaderSource', 'attachShader', 'linkProgram', 'getProgramInfoLog', 'useProgram', 'deleteProgram']
                .map(name => [name, gl[name]])) };
    });
    let directory, restored = false;
    const started = Date.now();
    while (Date.now() - started < 200000) {
        const latest = (await fs.readdir(path.join(kit, 'Diagnostic-Runs')))
            .filter(name => !before.has(name) && name.endsWith('stress-4x-none')).sort().at(-1);
        if (latest) {
            directory = path.join(kit, 'Diagnostic-Runs', latest);
            const trace = await json(path.join(directory, 'trace-status.json')).catch(() => null);
            if (!restored && trace?.status === 'CAPTURED') {
                report.traceStatus = trace; assert.equal(trace.cpuProfile, 'CAPTURED');
                assert.equal(trace.requestedDuringStage, 'warmed-steady');
                const capture = trace.webglCalls.shaderIdentity;
                assert.equal(capture.status, 'CAPTURED'); assert.equal(capture.shaderChecksEnabled, true);
                assert(capture.links.length > 0); assert.deepEqual(capture.dropped, {});
                assert(capture.links.every(row => row.material && row.object && row.sources.length === 2
                    && row.sources.every(source => typeof source === 'string' && source.length > 100)));
                assert(capture.waits.every(row => capture.links.some(link => link.program === row.program)));
                report.restoration = await page.evaluate(() => {
                    const p = window.__shaderIdentityOriginals;
                    return { direct: p.renderer.renderBufferDirect === p.direct,
                        methods: Object.fromEntries(Object.entries(p.methods).map(([name, method]) => [name, p.gl[name] === method])),
                        detailedAbsent: !window.__ra2WinDiagnostic.detailed };
                });
                assert(report.restoration.direct && report.restoration.detailedAbsent);
                assert(Object.values(report.restoration.methods).every(Boolean));
                report.closeDeferred = await app.evaluate(({ BrowserWindow }) => {
                    const window = BrowserWindow.getAllWindows()[0]; window.close(); return !window.isDestroyed();
                });
                assert.equal(report.closeDeferred, true); restored = true;
            }
            report.run = await json(path.join(directory, 'run.json'));
            if (report.run.status !== 'RUNNING') break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    assert(restored); assert.equal(report.run.status, 'CAPTURED');
    report.phases = (await json(path.join(directory, 'phases.json'))).map(phase => ({ label: phase.label,
        validity: phase.validity, instrumented: phase.instrumented, ticks: phase.tickEnd - phase.tickStart }));
    assert.equal(report.phases.length, 4);
    assert(report.phases.every(phase => phase.validity === 'VALID_BOUNDED_SAMPLE' && phase.ticks > 0));
    assert.equal(report.phases[0].instrumented, false); assert(report.phases.slice(1).every(phase => phase.instrumented));
    report.notes = await fs.readFile(path.join(directory, 'USER-NOTES.txt'), 'utf8');
    assert(report.notes.includes('REQUESTED_F9') && !report.notes.includes('COMPANION_FAILED'));
    assert.deepEqual(await json(path.join(directory, 'errors.json')), []); assert.deepEqual(report.errors, []);
    report.export = await exportReports(kit); report.status = 'PASS_NATIVE_AUTOMATIC_SHADER_IDENTITY_EXPORT_AND_RESTORATION';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); if (app && !closed) await app.close(); }
