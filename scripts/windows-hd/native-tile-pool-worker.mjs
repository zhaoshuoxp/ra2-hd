import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [kitArg, outputArg] = process.argv.slice(2);
const kit = path.resolve(kitArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const source = await fs.readFile('src/engine/renderable/builder/poolHdPixels.ts', 'utf8');
const controlCode = execFileSync('bun', ['build', 'src/engine/renderable/builder/poolHdPixels.ts',
    '--target=browser', '--format=esm'], { encoding: 'utf8' }).replace(/export\s*\{[^}]*\};?/g, '');
const report = { status: 'RUNNING', platform: 'darwin-arm64', windows: 'NOT_RUN',
    boundary: 'Instrumented copied native stress 4X. Each actual worker result is compared with the unchanged CPU algorithm; this deliberately adds CPU work outside Windows acceptance. postMessage CPU duration measures cloning/submission only; round-trip duration is not worker CPU time.',
    algorithmSha256: createHash('sha256').update(source).digest('hex'), errors: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.join(kit, 'resources/app'), '--diag-mode=4x', '--diag-scene=stress', '--diag-seconds=3'],
    env: { ...process.env, RA2_HD_DIAGNOSTIC: '1', RA2_DIAGNOSTIC_ROOT: kit, RA2_DIAGNOSTIC_HARNESS: '1' }, timeout: 60000,
});
try {
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false }); });
    await page.waitForFunction(() => window.__ra2WinDiagnostic, undefined, { timeout: 120000 });
    report.probe = await page.evaluate(async controlCode => {
        const cpuPool = new Function(`${controlCode}; return poolHdPixels;`)();
        const NativeWorker = window.Worker, workers = [], jobs = [], errors = [];
        const stamp = () => ({ atMs: performance.now(), tick: window.__ra2debug?.game?.currentTick ?? null,
            playing: !!window.__ra2debug?.gameScreen?.gameAnimationLoop?.isStarted });
        const before = stamp(); let pendingBytes = 0, peakPendingBytes = 0;
        window.Worker = class extends NativeWorker {
            constructor(url, options) {
                super(url, options);
                const owned = { url: String(url), jobs: 0, terminated: 0, pending: new Map(), instance: this };
                workers.push(owned); this.owned = owned;
                this.addEventListener('message', ({ data: response }) => {
                    if (response.kind !== 'hd-tile-pool') return;
                    const job = owned.pending.get(response.id);
                    if (!job) { errors.push('Unknown pooling response'); return; }
                    owned.pending.delete(response.id); pendingBytes -= job.inputBytes;
                    job.roundTripMs = performance.now() - job.startMs;
                    try {
                        if (response.error) throw Error(response.error);
                        const start = performance.now(), expected = cpuPool(job.request.base, job.request.data, job.request.limit);
                        job.cpuControlMs = performance.now() - start;
                        const actual = response.pixels; job.pooled = !!actual;
                        if (!!actual !== !!expected) throw Error('Pooling decision differs');
                        if (actual) {
                            job.gpuBytes = actual.gpuBytes;
                            for (const key of ['width', 'height', 'columns', 'rows', 'virtualSize', 'gpuBytes'])
                                if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) throw Error(`Metadata differs: ${key}`);
                            job.comparedBytes = 0; job.differentBytes = 0;
                            for (const key of ['color', 'remap', 'lookup']) {
                                if (actual[key].length !== expected[key].length) throw Error(`Length differs: ${key}`);
                                job.comparedBytes += actual[key].length;
                                for (let i = 0; i < actual[key].length; i++) job.differentBytes += Number(actual[key][i] !== expected[key][i]);
                            }
                            if (job.differentBytes) throw Error('Pooled bytes differ');
                        }
                        if (job.request.base.rgba.byteLength + job.request.data.rgba.byteLength !== job.inputBytes)
                            throw Error('Source buffers were detached');
                        job.status = 'PASS_SAME_DATA_CPU_PARITY';
                    } catch (error) { job.status = 'FAIL'; errors.push(error.message); }
                    delete job.request;
                });
            }
            postMessage(request, ...args) {
                if (request?.kind !== 'hd-tile-pool') return super.postMessage(request, ...args);
                const job = { ...stamp(), id: request.id, worker: workers.indexOf(this.owned), request,
                    width: request.base.width, height: request.base.height,
                    inputBytes: request.base.rgba.byteLength + request.data.rgba.byteLength,
                    transferredInputBuffers: args.length > 0, startMs: performance.now() };
                this.owned.jobs++; this.owned.pending.set(request.id, job); jobs.push(job);
                pendingBytes += job.inputBytes; peakPendingBytes = Math.max(peakPendingBytes, pendingBytes);
                const start = performance.now();
                try { return super.postMessage(request, ...args); }
                finally { job.postMessageCpuMs = performance.now() - start; }
            }
            terminate() {
                this.owned.terminated++;
                return super.terminate();
            }
        };
        window.__ra2WinDiagnostic.setTraceActive(true);
        try {
            const deadline = performance.now() + 90000;
            while (!window.__ra2debug?.gameScreen?.gameAnimationLoop?.isStarted) {
                if (performance.now() > deadline) throw Error('Native match did not start');
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            await new Promise(resolve => setTimeout(resolve, 40000));
            const end = stamp(), d = window.__ra2debug;
            const loop = d.gameScreen.gameAnimationLoop, tick = loop.tickGame, update = loop.updateRenderer;
            loop.tickGame = () => true; loop.updateRenderer = () => {};
            try {
                // Let already queued family work settle without creating new gameplay demand.
                const stop = performance.now() + 15000;
                while (workers.some(worker => worker.jobs && (!worker.terminated || worker.pending.size))) {
                    if (performance.now() > stop) throw Error('Owned pooling work failed to settle');
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } finally { loop.tickGame = tick; loop.updateRenderer = update; }
            const bindings = [];
            d.worldScene.scene.traverseVisible(object => {
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of materials.filter(Boolean)) if (material.isHdSpriteMaterial || material.defines?.HD_TILE_POOL !== undefined)
                    bindings.push({ tiled: material.defines?.HD_TILE_POOL !== undefined,
                        mapWidth: material.map?.image?.width, mapHeight: material.map?.image?.height });
            });
            const familyReports = d.sovietUnitsHd;
            return { before, end, jobs, errors, peakPendingBytes, pendingBytes, bindings, familyReports,
                workers: workers.filter(worker => worker.jobs).map(worker => ({ url: worker.url, jobs: worker.jobs,
                    terminated: worker.terminated, pending: worker.pending.size })),
                output: d.renderer.outputMetrics, density: d.generalOptions.graphics.hdDensity.value };
        } finally { window.Worker = NativeWorker; window.__ra2WinDiagnostic.setTraceActive(false); }
    }, controlCode);
    const p = report.probe;
    assert.equal(p.before.playing, false); assert(p.end.tick > 500); assert(p.jobs.length > 0);
    assert(p.jobs.some(job => job.playing), 'No in-match demand pooling was exercised');
    assert(p.bindings.some(binding => binding.tiled), 'No actual tiled HD bindings');
    assert.deepEqual(p.errors, []); assert.equal(p.pendingBytes, 0);
    for (const job of p.jobs) {
        assert.equal(job.status, 'PASS_SAME_DATA_CPU_PARITY'); assert.equal(job.transferredInputBuffers, false);
        assert(job.inputBytes <= 32 * 1024 * 1024);
    }
    for (const worker of p.workers) { assert.equal(worker.terminated, 1); assert.equal(worker.pending, 0); }
    assert.deepEqual(report.errors, []); report.status = 'PASS_NATIVE_BACKGROUND_POOLING_BYTE_PARITY_AND_OWNERSHIP';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await app.close(); }
