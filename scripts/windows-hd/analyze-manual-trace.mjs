import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';

const { SourceMapConsumer } = createRequire(import.meta.url)('source-map-js');
const builtin = process.argv[2] === '--builtin';
const [returned, kit, ...args] = process.argv.slice(builtin ? 3 : 2);
const [companion, nativeQa, runName, output] = builtin ? [null, null, ...args] : args;
assert(returned && kit && runName && output && (builtin || companion && nativeQa));
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = async file => {
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    return digest.digest('hex');
};
const manifestFile = path.join(returned, 'diagnostic-manifest.json');
const manifestHash = await hash(manifestFile), manifest = await json(manifestFile);
assert.equal(manifestHash, await hash(path.join(kit, 'diagnostic-manifest.json')));
const receipt = await json(path.join(returned, 'return-manifest.json'));
assert(receipt.runIdentities.some(run => run.directory === runName));
for (const row of receipt.files) {
    assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
    const file = path.resolve(returned, row.file), info = await fs.lstat(file);
    assert(info.isFile() && !info.isSymbolicLink() && await fs.realpath(file) === file);
    assert.equal(info.size, row.bytes); assert.equal(await hash(file), row.sha256);
}
const directory = path.join(returned, 'runs', runName), load = name => json(path.join(directory, name));
const phases = await load('phases.json'), run = await load('run.json'), machine = await load('machine.json');
const traceStatus = await load('trace-status.json'), errors = await load('errors.json');
const verification = await json(path.join(returned, 'verification.json'));
assert.equal(machine.platform, 'win32'); assert.equal(machine.arch, 'x64');
assert.equal(run.diagnosticCommit, manifest.diagnosticCommit); assert.equal(run.manifestSha256, manifestHash);
assert.equal(verification.status, 'PASS'); assert.deepEqual(verification.failures, []);
assert.equal(verification.manifestSha256, manifestHash); assert.equal(verification.checked, manifest.files.length);
assert.equal(traceStatus.status, 'CAPTURED'); assert.equal(traceStatus.cpuProfile, 'CAPTURED');
assert.equal(traceStatus.requestedDuringStage, 'complete');
const repeatedTrace = error => error.stage === 'manual-capture'
    && error.message === 'This process already captured its one trace; start a fresh process for another';
const repeats = errors.filter(repeatedTrace);
const postCaptureUi = error => builtin && repeats.length > 0 && error.stage === 'renderer-console'
    && error.message.startsWith('Executing inline event handler violates the following Content Security Policy directive')
    && error.message.endsWith('The action has been blocked.')
    && Date.parse(error.at) > Math.max(...repeats.map(row => Date.parse(row.at)));
assert(errors.every(error => repeatedTrace(error) || postCaptureUi(error)));
let identity;
if (builtin) {
    assert.equal(manifest.manualCaptureCamera,
        'F8 and late F9 preserve live camera input; automatic phases retain the frozen route.');
    const files = [];
    for (const file of ['resources/app/desktop/windows-diagnostic.mjs',
        'resources/app/desktop/diagnostic-renderer.mjs', 'resources/app/desktop/diagnostic-schema.mjs']) {
        const row = manifest.files.find(entry => entry.file === file); assert(row);
        assert.equal(await hash(path.join(kit, file)), row.sha256); files.push(row);
    }
    identity = { kind: 'BUILT_IN_MANUAL_CAMERA_TRACE', diagnosticId: manifest.diagnosticId,
        sourceHead: manifest.diagnosticCommit, manifestHash, files };
} else {
    const notes = (await fs.readFile(path.join(directory, 'USER-NOTES.txt'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(notes.length, 1); assert.equal(notes[0].status, 'INSTALLED');
    identity = notes[0].identity;
    const companionFile = path.join(companion, 'companion-manifest.json');
    const trusted = await json(companionFile), qa = await json(nativeQa);
    assert.equal(qa.status, 'PASS_NATIVE_MANUAL_CAMERA_F8_F9_EXPORT_AND_RESTORATION');
    const qaIdentity = JSON.parse(qa.notes.trim()).identity;
    assert.equal(identity.companionId, trusted.companionId); assert.equal(identity.sourceHead, trusted.sourceHead);
    assert.equal(identity.manifestSha256, await hash(companionFile));
    assert.equal(identity.baseManifestSha256, manifestHash); assert.deepEqual(identity.files, trusted.files);
    assert.equal(identity.originalProbeSourceSha256, qaIdentity.originalProbeSourceSha256);
    assert.equal(identity.manualProbeSourceSha256, qaIdentity.manualProbeSourceSha256);
    for (const row of trusted.files) assert.equal(await hash(path.join(companion, row.file)), row.sha256);
    const runtime = identity.runtimeReceipt;
    assert.equal(runtime.status, 'PASS_BYTE_IDENTICAL_RUNTIME_STAGING'); assert.equal(runtime.runtimeBytes, 385513417);
    assert.equal(runtime.executionPlatform, 'win32'); assert.equal(runtime.executionArch, 'x64');
    assert.equal(runtime.verification.status, 'PASS'); assert.deepEqual(runtime.verification.failures, []);
    assert.equal(runtime.verification.manifestSha256, manifestHash);
    assert.equal(runtime.verification.checked, manifest.files.length);
}
for (const phase of phases) {
    assert.equal(phase.validity, 'VALID_BOUNDED_SAMPLE');
    assert.deepEqual(phase.focusEvents, []); assert.deepEqual(phase.visibilityEvents, []); assert.deepEqual(phase.resizeEvents, []);
    assert(phase.endState.players > 0 && phase.endState.players <= 8);
    assert(phase.endState.bots >= 0 && phase.endState.bots <= 7); assert(phase.tickEnd > phase.tickStart);
}
assert(phases.slice(0, 4).every(phase => phase.endState.players === 8 && phase.endState.bots === 7 && !phase.instrumented));
const manual = phases.find(phase => phase.label.startsWith('manual-') && !phase.instrumented);
const traced = phases.find(phase => phase.label === 'instrumented-cpu-multiprocess-trace');
assert((builtin || manual?.manualCamera) && traced?.manualCamera && traced.instrumented);
if (manual) assert.equal(manual.cameraRoute.mode, 'manual-input');
assert.equal(traced.cameraRoute.mode, 'manual-input');
const stats = values => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const at = q => sorted[Math.ceil(sorted.length * q) - 1];
    return { n: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p50: at(.5), p95: at(.95), p99: at(.99), maximum: sorted.at(-1) };
};
const metrics = phases.map(phase => {
    const intervals = phase.rows.map(row => row[1]).filter(Number.isFinite), state = phase.endState;
    return { label: phase.label, instrumented: phase.instrumented, validity: phase.validity,
        meanLoopFps: intervals.length * 1000 / intervals.reduce((sum, value) => sum + value, 0),
        tickStart: phase.tickStart, tickEnd: phase.tickEnd, cameraRoute: phase.cameraRoute,
        intervals: phase.summary.frameIntervals, simulation: phase.summary.simulationCpuMs,
        update: phase.summary.renderUpdateCpuMs, submission: phase.summary.renderSubmissionCpuMs,
        graphics: stats(phase.rows.map(row => row[4] + row[5])), drawCalls: phase.summary.drawCalls,
        triangles: phase.summary.triangles, nodes: state.nodes, visibleNodes: state.visibleNodes,
        hdNodes: state.hdNodes, renderables: state.renderables, players: state.players, bots: state.bots, graphicsSettings: state.graphics,
        output: state.output, bindingCount: state.bindings.length, programs: state.shaderProgramCount };
});
const events = (await load('trace.json')).traceEvents, profile = await load('cpu.cpuprofile');
const callbacks = events.filter(event => event.name === 'FunctionCall' && event.ph === 'X'
    && event.args?.data?.functionName === 'doFrame');
assert(callbacks.length);
const { pid, tid } = callbacks[0]; assert(callbacks.every(event => event.pid === pid && event.tid === tid));
assert(events.some(event => event.name === 'thread_name' && event.pid === pid && event.tid === tid
    && event.args?.name === 'CrRendererMain'));
const main = events.filter(event => event.pid === pid && event.tid === tid);
const startup = main.filter(event => event.name === 'CpuProfiler::StartProfiling' && event.ph === 'X');
assert.equal(startup.length, 1);
const frameEvents = callbacks.filter(event => event.ts >= startup[0].ts + startup[0].dur
    && event.ts >= profile.startTime && event.ts + event.dur <= profile.endTime).sort((a, b) => a.ts - b.ts);
assert(frameEvents.length > 50);
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
const maps = new Map(), catalog = new Map(manifest.files.map(row => [row.file, row])), frames = new Map();
for (const [id, node] of nodes) {
    const frame = node.callFrame; let original = null;
    if (frame.url.startsWith('ra2://game/assets/') && frame.lineNumber >= 0 && frame.columnNumber >= 0) {
        const name = path.posix.basename(frame.url), relative = `Reference/sourcemaps/${name}.map`;
        if (!maps.has(name)) {
            const file = path.join(kit, relative); assert.equal(await hash(file), catalog.get(relative)?.sha256);
            maps.set(name, new SourceMapConsumer(await json(file)));
        }
        original = maps.get(name).originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
    }
    const source = original?.source?.replace(/^.*?\/(src|node_modules)\//, '$1/');
    frames.set(id, { functionName: frame.functionName, original: original && { ...original, source },
        key: source ? `${source}:${original.line}:${original.column}` : `${frame.url}:${frame.functionName}:${frame.lineNumber}:${frame.columnNumber}` });
}
const totals = new Map(), matrixCallers = new Map();
let clock = profile.startTime, index = 0, sampleWeightUs = 0;
profile.samples.forEach((id, i) => {
    const weight = profile.timeDeltas[i]; clock += weight;
    while (index < frameEvents.length && clock > frameEvents[index].ts + frameEvents[index].dur) index++;
    if (index >= frameEvents.length || clock < frameEvents[index].ts) return;
    sampleWeightUs += weight;
    const leaf = frames.get(id), chain = []; let cursor = id;
    while (frames.has(cursor)) { chain.push(frames.get(cursor)); cursor = parents.get(cursor); }
    const unique = new Set();
    for (const entry of chain) {
        if (unique.has(entry.key)) continue; unique.add(entry.key);
        const total = totals.get(entry.key) ?? { ...entry, selfMs: 0, inclusiveMs: 0 };
        total.inclusiveMs += weight / 1000;
        if (entry.key === leaf.key) total.selfMs += weight / 1000;
        totals.set(entry.key, total);
    }
    if (leaf.functionName === 'multiplyMatrices' || leaf.functionName === 'updateMatrixWorld'
        || leaf.functionName === 'updateWorldMatrix' || leaf.functionName === 'compose') {
        const caller = chain.find(entry => entry.original?.source?.startsWith('src/'));
        if (caller) matrixCallers.set(caller.key, { ...caller,
            selfSampleWeightMs: (matrixCallers.get(caller.key)?.selfSampleWeightMs ?? 0) + weight / 1000 });
    }
});
const start = frameEvents[0].ts, end = frameEvents.at(-1).ts + frameEvents.at(-1).dur;
const nativeWaits = main.filter(event => event.ph === 'X' && event.ts >= start && event.ts + event.dur <= end
    && /WaitForToken|WaitForGetOffset|WaitForCmd|GetProgramiv/.test(event.name));
const result = { schemaVersion: 1, status: 'PASS_VALIDATED_WINDOWS_MANUAL_TRACE_ATTRIBUTION',
    runDirectory: runName, diagnosticCommit: manifest.diagnosticCommit, manifestHash, identity, verification,
    preservedErrors: errors,
    errorInterpretation: 'Repeated F9 requests were rejected after capture. Any admitted UI CSP message follows those post-capture rejections; its triggering UI action is unconfirmed. Phase validity is scoped to the captured window, not whole-app acceptance.',
    metrics, trace: { requestedDuringStage: traceStatus.requestedDuringStage, webglCalls: traceStatus.webglCalls,
        profilerStartup: { wallMs: startup[0].dur / 1000, threadCpuMs: startup[0].tdur / 1000 },
        excludedProfilerStartup: true, gameCallbackCount: frameEvents.length,
        callbacksWallMs: stats(frameEvents.map(event => event.dur / 1000)),
        callbacksThreadCpuMs: stats(frameEvents.map(event => event.tdur / 1000)),
        sampledFrameWeightMs: sampleWeightUs / 1000,
        topSelf: [...totals.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 60),
        topInclusive: [...totals.values()].sort((a, b) => b.inclusiveMs - a.inclusiveMs).slice(0, 60),
        matrixCallers: [...matrixCallers.values()].sort((a, b) => b.selfSampleWeightMs - a.selfSampleWeightMs),
        nativeWaits: nativeWaits.map(event => ({ name: event.name, wallMs: event.dur / 1000,
            threadCpuMs: event.tdur / 1000, timestampUs: event.ts })) },
    boundaries: [manual ? 'Normal manual timing precedes F9 and is the sustained-rate evidence.'
        : 'This run has no Normal manual sample; retain the separately validated earlier Normal manual run.',
        'Automatic and manual phases differ in camera, tick and evolving actors; they are not a matched A/B.',
        'All samples report HD 4X; the subjective Original control was not captured here.',
        'Instrumented rate is not Normal FPS. CPU sample weights are approximate and may include native waits.',
        'Inclusive function weights overlap; recursive frames are counted once per normalized location.',
        'Trace callbacks are joined to CPU samples by timestamps, not guessed matches to phase row durations.'],
    gpuExecutionTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE' };
await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, phases: metrics.length,
    manualFps: manual ? metrics.find(row => row.label === manual.label).meanLoopFps : null,
    frameCallbacks: frameEvents.length, topSelf: result.trace.topSelf.slice(0, 12), matrixCallers: result.trace.matrixCallers.slice(0, 12) }));
