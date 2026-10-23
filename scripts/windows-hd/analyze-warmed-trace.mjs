import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const { SourceMapConsumer } = createRequire(import.meta.url)('source-map-js');
const [returned, kit, analysisFile, output] = process.argv.slice(2, 6).map(value => path.resolve(value));
const [runDirectory, companionArg] = process.argv.slice(6);
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const manifestFile = path.join(returned, 'diagnostic-manifest.json');
assert.equal(await hash(manifestFile), await hash(path.join(kit, 'diagnostic-manifest.json')));
const manifest = await json(manifestFile), receipt = await json(path.join(returned, 'return-manifest.json'));
for (const row of receipt.files) {
    assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
    const file = path.join(returned, row.file), info = await fs.lstat(file);
    assert(info.isFile() && !info.isSymbolicLink());
    assert.equal(info.size, row.bytes); assert.equal(await hash(file), row.sha256);
}
const verification = await json(path.join(returned, 'verification.json'));
assert.equal(verification.status, 'PASS'); assert.deepEqual(verification.failures, []);
assert.equal(verification.manifestSha256, await hash(manifestFile));
assert.equal(verification.diagnosticId, manifest.diagnosticId);
assert.equal(verification.checked, manifest.files.length);
const analysis = await json(analysisFile);
assert.equal(analysis.diagnosticCommit, manifest.diagnosticCommit);
const traced = [];
for (const run of analysis.runs.filter(run => run.config.scene === 'stress')) {
    const file = path.join(returned, 'runs', run.directory, 'trace-status.json');
    try { if ((await json(file)).status === 'CAPTURED') traced.push(run); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!runDirectory) assert.equal(traced.length, 1, 'Select a run when the return contains multiple traces');
const selected = runDirectory ? traced.find(run => run.directory === runDirectory) : traced[0];
assert(selected, 'The selected captured stress trace is absent');
const directory = path.join(returned, 'runs', selected.directory);
const load = name => json(path.join(directory, name));
const run = await load('run.json'), status = await load('trace-status.json'), phases = await load('phases.json');
assert.equal(run.status, 'CAPTURED'); assert.equal(status.cpuProfile, 'CAPTURED');
assert.equal(run.diagnosticCommit, manifest.diagnosticCommit);
assert.equal(run.manifestSha256, await hash(manifestFile));
assert.equal(status.requestedDuringStage, 'warmed-steady'); assert.deepEqual(await load('errors.json'), []);
assert.equal(phases[0].instrumented, false);
let shaderIdentity;
if (companionArg) {
    const companion = path.resolve(companionArg), file = path.join(companion, 'companion-manifest.json');
    const trusted = await json(file), captured = status.webglCalls.shaderIdentity;
    assert.equal(captured.status, 'CAPTURED'); assert.deepEqual(captured.dropped, {});
    assert.equal(captured.shaderChecksEnabled, true);
    assert.equal(captured.identity.companionId, trusted.companionId);
    assert.equal(captured.identity.sourceHead, trusted.sourceHead);
    assert.equal(captured.identity.manifestSha256, await hash(file));
    assert.equal(captured.identity.baseManifestSha256, await hash(manifestFile));
    assert.equal(trusted.baseDiagnosticCommit, manifest.diagnosticCommit);
    assert.deepEqual(captured.identity.files, trusted.files);
    for (const row of trusted.files) assert.equal(await hash(path.join(companion, row.file)), row.sha256);
    const runtime = captured.identity.runtimeReceipt;
    assert.equal(runtime.status, 'PASS_BYTE_IDENTICAL_RUNTIME_STAGING');
    assert.equal(runtime.executionPlatform, 'win32'); assert.equal(runtime.executionArch, 'x64');
    assert.equal(runtime.verification.status, 'PASS'); assert.deepEqual(runtime.verification.failures, []);
    assert.equal(runtime.verification.manifestSha256, await hash(manifestFile));
    assert.equal(runtime.verification.checked, manifest.files.length);
    assert.equal(runtime.runtimeBytes, 385513417);
    const notes = (await fs.readFile(path.join(directory, 'USER-NOTES.txt'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(notes[0].status, 'INSTALLED'); assert.deepEqual(notes[0].identity, captured.identity);
    assert.equal(notes[1].status, 'REQUESTED_F9'); assert.equal(notes[1].secondsAfterObservedFirstLiveLoop, 20);
    assert(!notes.some(note => note.status === 'COMPANION_FAILED'));
    assert.equal(status.webglCalls.methods.linkProgram.calls, captured.links.length);
    assert.equal(status.webglCalls.methods.getProgramInfoLog.calls, captured.waits.length);
    shaderIdentity = { ...captured, links: captured.links.map(row => {
        assert.equal(row.sources.length, 2); assert(row.sources.every(source => typeof source === 'string'));
        const waits = captured.waits.filter(wait => wait.program === row.program);
        assert.equal(waits.length, 1); assert.deepEqual(waits[0].material, row.material);
        assert(waits[0].atMs >= row.atMs);
        assert(captured.firstUses.some(use => use.program === row.program && use.atMs >= waits[0].atMs));
        return { ...row, sources: row.sources.map(source => ({ characters: source.length,
            sha256: createHash('sha256').update(source).digest('hex') })) };
    }) };
    status.webglCalls.shaderIdentity = shaderIdentity;
}
const activePhase = phases.find(phase => phase.label === `instrumented-${status.requestedDuringStage}`);
assert(activePhase);
assert(phases.slice(1).every(phase => phase.instrumented && phase.validity === 'VALID_BOUNDED_SAMPLE'));
const events = (await load('trace.json')).traceEvents, profile = await load('cpu.cpuprofile');
const threads = events.filter(event => event.name === 'thread_name' && event.args?.name === 'CrRendererMain');
const callbacks = events.filter(event => event.name === 'FunctionCall' && event.args?.data?.functionName === 'doFrame');
const thread = threads.find(row => callbacks.some(event => event.pid === row.pid && event.tid === row.tid));
assert(thread);
const main = events.filter(event => event.pid === thread.pid && event.tid === thread.tid);
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
const maps = new Map(), catalog = new Map(manifest.files.map(row => [row.file, row]));
const mapped = async frame => {
    if (!frame.url.startsWith('ra2://game/assets/') || frame.lineNumber < 0 || frame.columnNumber < 0) return null;
    const name = path.posix.basename(frame.url), relative = `Reference/sourcemaps/${name}.map`;
    if (!maps.has(name)) {
        const file = path.join(kit, relative);
        assert.equal(await hash(file), catalog.get(relative)?.sha256);
        maps.set(name, new SourceMapConsumer(await json(file)));
    }
    return maps.get(name).originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
};
const stack = async id => {
    const result = [];
    while (nodes.has(id)) {
        const frame = nodes.get(id).callFrame;
        result.push({ ...frame, original: await mapped(frame) }); id = parents.get(id);
    }
    return result;
};
let clock = profile.startTime;
const samples = profile.samples.map((id, index) => {
    const weight = profile.timeDeltas[index]; clock += weight;
    return { at: clock, weight, id };
});
const tasks = [];
for (const task of main.filter(event => event.name === 'RunTask' && event.dur > 50000).sort((a, b) => b.dur - a.dur)) {
    const within = event => task.ts <= event.ts && event.ts + (event.dur ?? 0) <= task.ts + task.dur;
    const weights = new Map();
    for (const sample of samples.filter(sample => task.ts <= sample.at && sample.at <= task.ts + task.dur))
        weights.set(sample.id, (weights.get(sample.id) ?? 0) + sample.weight);
    const topSelf = [];
    for (const [id, weight] of [...weights].sort((a, b) => b[1] - a[1]).slice(0, 8))
        topSelf.push({ sampleWeightMs: weight / 1000, stack: await stack(id) });
    const callback = main.find(event => event.name === 'FunctionCall' && event.args?.data?.functionName === 'doFrame' && within(event));
    let frame;
    if (callback) {
        const phase = activePhase;
        const index = phase.rows.reduce((best, row, i) =>
            Math.abs(row[2] + row[4] + row[5] - callback.dur / 1000)
                < Math.abs(phase.rows[best][2] + phase.rows[best][4] + phase.rows[best][5] - callback.dur / 1000) ? i : best, 0);
        const row = phase.rows[index], matchErrorMs = Math.abs(row[2] + row[4] + row[5] - callback.dur / 1000);
        assert(matchErrorMs < 2 && row[5] > 50);
        frame = { index, columns: phase.columns, row, callback, matchErrorMs,
            relativeToPhaseFirstFrameMs: row[0] - phase.firstGameFrameAt, followingIntervalMs: phase.rows[index + 1]?.[1] };
    }
    const profiler = main.find(event => event.name === 'CpuProfiler::StartProfiling' && within(event));
    const relevant = events.filter(event => within(event) && [
        'GLES2Implementation::GetProgramiv', 'GLES2DecoderPassthroughImpl::DoLinkProgram',
        'ANGLEPlatformImpl::RunWorkerTask', 'GetImageData', 'Decode Image'
    ].includes(event.name)).map(event => ({ name: event.name, pid: event.pid, tid: event.tid,
        timestampUs: event.ts, durationMs: (event.dur ?? 0) / 1000, threadCpuMs: event.tdur / 1000 }));
    tasks.push({ timestampUs: task.ts, durationMs: task.dur / 1000, threadCpuMs: task.tdur / 1000,
        attribution: profiler ? 'PROFILER_START_OVERHEAD' : callback ? 'GAME_FRAME' : 'BETWEEN_FRAME_MAIN_THREAD_WORK',
        profilerStartMs: profiler?.dur / 1000 || undefined, frame, topSelf, relatedNativeEvents: relevant,
        gcSpans: main.filter(event => ['V8.GCScavenger', 'V8.GCCompactor'].includes(event.name) && within(event)) });
}
assert(tasks.some(task => task.attribution === 'PROFILER_START_OVERHEAD'));
assert(tasks.some(task => task.attribution === 'GAME_FRAME'));
const workerThreads = events.filter(event => event.name === 'thread_name'
    && /worker/i.test(event.args?.name ?? '')).map(event => ({ pid: event.pid, tid: event.tid, name: event.args.name }));
const result = { status: 'PASS_VALIDATED_WINDOWS_STRESS_TRACE_ATTRIBUTION', diagnosticId: manifest.diagnosticId,
    diagnosticCommit: manifest.diagnosticCommit, runDirectory: selected.directory, verification, traceStatus: status,
    boundary: 'Profile sample weights are approximate CPU attribution, not API durations. Instrumented windows are not Normal A/B. Enemy-arrival markers are unavailable. '
        + (shaderIdentity ? 'Windows shader/material identities are validated against the trusted S1 companion; sources remain in the raw return.' : 'Exact Windows shader material/family identities are unavailable.'),
    tasks, workerThreads, normalFirstPhase: selected.phases[0], mainThread: { pid: thread.pid, tid: thread.tid }, gpuTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE' };
await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, tasks: tasks.map(task => ({ durationMs: task.durationMs,
    attribution: task.attribution, topSelfFunction: task.topSelf[0]?.stack[0].original ?? task.topSelf[0]?.stack[0].functionName })) }));
