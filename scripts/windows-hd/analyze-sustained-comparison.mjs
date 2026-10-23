import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const [baselineRoot, baselineKit, baselineRun, candidateRoot, candidateKit, candidateRun, output] = process.argv.slice(2);
assert(baselineRoot && baselineKit && baselineRun && candidateRoot && candidateKit && candidateRun && output);
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = async file => {
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    return digest.digest('hex');
};
async function load(rootArg, kitArg, runName) {
    const root = path.resolve(rootArg), kit = path.resolve(kitArg);
    const manifestFile = path.join(root, 'diagnostic-manifest.json'), manifestHash = await hash(manifestFile);
    assert.equal(manifestHash, await hash(path.join(kit, 'diagnostic-manifest.json')));
    const manifest = await json(manifestFile), returned = await json(path.join(root, 'return-manifest.json'));
    assert.equal(returned.diagnosticId, manifest.diagnosticId);
    assert(returned.runIdentities.some(run => run.directory === runName));
    for (const row of returned.files) {
        assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
        const file = path.resolve(root, row.file), info = await fs.lstat(file);
        assert(info.isFile() && !info.isSymbolicLink() && await fs.realpath(file) === file);
        assert.equal(info.size, row.bytes); assert.equal(await hash(file), row.sha256);
    }
    const verification = await json(path.join(root, 'verification.json'));
    assert.equal(verification.status, 'PASS'); assert.deepEqual(verification.failures, []);
    assert.equal(verification.diagnosticId, manifest.diagnosticId);
    assert.equal(verification.manifestSha256, manifestHash); assert.equal(verification.checked, manifest.files.length);
    const directory = path.join(root, 'runs', runName), read = name => json(path.join(directory, name));
    const run = await read('run.json'), machine = await read('machine.json'), phases = await read('phases.json');
    const errors = await read('errors.json');
    assert.equal(run.manifestSha256, manifestHash); assert.equal(run.diagnosticCommit, manifest.diagnosticCommit);
    assert.equal(machine.platform, 'win32'); assert.equal(machine.arch, 'x64');
    assert(['CAPTURED', 'CAPTURED_WITH_ERRORS'].includes(run.status));
    assert(errors.every(error => error.stage === 'manual-capture'
        && error.message === 'This process already captured its one trace; start a fresh process for another'));
    const fingerprint = { platform: machine.platform, arch: machine.arch, cpu: machine.cpu,
        memoryBytes: machine.memoryBytes, onBattery: machine.onBattery, displays: machine.displays,
        gpuRenderer: machine.gpu?.auxAttributes?.glRenderer, runtime: machine.runtime,
        gpuFeatureStatus: machine.gpuFeatureStatus };
    const tracePresent = returned.files.some(row => row.file === `runs/${runName}/trace.json`);
    return { root, manifest, manifestHash, verification, runName, run, fingerprint, phases, errors, tracePresent };
}
function metrics(phase) {
    const intervals = phase.rows.map(row => row[1]).filter(Number.isFinite), state = phase.endState;
    const sums = phase.rows.map(row => row[4] + row[5]).sort((a, b) => a - b);
    const bindings = state.bindings, families = new Map();
    for (const binding of bindings) {
        const key = JSON.stringify([binding.identity, binding.vxlDensity, !!binding.vxl, !!binding.shp, !!binding.rhino]);
        families.set(key, (families.get(key) ?? 0) + 1);
    }
    return { label: phase.label, instrumented: phase.instrumented, validity: phase.validity,
        meanLoopFps: intervals.length * 1000 / intervals.reduce((sum, value) => sum + value, 0),
        tickStart: phase.tickStart, tickEnd: phase.tickEnd, elapsedMs: phase.elapsedMs,
        cameraRoute: phase.cameraRoute, manualCamera: !!phase.manualCamera,
        loadingToFirstGameFrameMs: phase.loadingToFirstGameFrameMs,
        intervals: phase.summary.frameIntervals, simulation: phase.summary.simulationCpuMs,
        update: phase.summary.renderUpdateCpuMs, submission: phase.summary.renderSubmissionCpuMs,
        combinedGraphicsMedianMs: sums[Math.ceil(sums.length * .5) - 1],
        drawCalls: phase.summary.drawCalls, triangles: phase.summary.triangles,
        nodes: state.nodes, visibleNodes: state.visibleNodes, hdNodes: state.hdNodes,
        renderables: state.renderables, programs: state.shaderProgramCount,
        bindingCount: bindings.length, actualHdBindings: bindings.filter(b => b.vxl || b.shp || b.rhino).length,
        players: state.players, bots: state.bots, graphics: state.graphics, output: state.output,
        bindingFamilies: [...families].sort(([a], [b]) => a.localeCompare(b)) };
}
const baseline = await load(baselineRoot, baselineKit, baselineRun);
const candidate = await load(candidateRoot, candidateKit, candidateRun);
assert.deepEqual(baseline.manifest.completeSiblingResources, candidate.manifest.completeSiblingResources);
assert.deepEqual(baseline.manifest.limitsMiB, candidate.manifest.limitsMiB);
assert.deepEqual(baseline.fingerprint, candidate.fingerprint);
const { experimentId: aId, ...aConfig } = baseline.run.config;
const { experimentId: cId, ...cConfig } = candidate.run.config;
assert.deepEqual(aConfig, cConfig);
assert.equal(cConfig.scene, 'stress'); assert.equal(cConfig.mode, '4x'); assert.equal(cConfig.trace, false);
for (const input of [baseline, candidate]) {
    for (const phase of input.phases) {
        assert.equal(phase.validity, 'VALID_BOUNDED_SAMPLE'); assert(phase.tickEnd > phase.tickStart);
        for (const key of ['focusEvents', 'visibilityEvents', 'resizeEvents']) assert.deepEqual(phase[key], []);
        assert(phase.endState.focused && phase.endState.players > 0 && phase.endState.players <= 8);
        assert(phase.endState.graphics.enabled && phase.endState.graphics.density === 4);
    }
    assert(input.phases.slice(0, 4).every(p => !p.instrumented && !p.manualCamera
        && p.endState.players === 8 && p.endState.bots === 7));
}
const automatic = baseline.phases.slice(0, 4).map((a, i) => {
    const c = candidate.phases[i]; assert.equal(a.label, c.label); assert.deepEqual(a.cameraRoute, c.cameraRoute);
    for (const key of ['startTimestamp', 'gameOptions', 'desiredSpeed', 'graphics', 'performanceOptions', 'viewport',
        'output', 'logicalSize', 'context', 'gpuRenderer']) assert.deepEqual(a.endState[key], c.endState[key]);
    const am = metrics(a), cm = metrics(c);
    const allFamilies = new Set([...am.bindingFamilies, ...cm.bindingFamilies].map(([key]) => key));
    const af = new Map(am.bindingFamilies), cf = new Map(cm.bindingFamilies);
    return { label: a.label, baseline: am, candidate: cm,
        meanLoopFpsChangePercent: (cm.meanLoopFps / am.meanLoopFps - 1) * 100,
        updateMedianReductionPercent: (1 - cm.update.median / am.update.median) * 100,
        familyCountDifferences: [...allFamilies].filter(key => af.get(key) !== cf.get(key))
            .map(key => ({ family: JSON.parse(key), baseline: af.get(key) ?? 0, candidate: cf.get(key) ?? 0 })),
        boundary: 'Matched settings and route; independent native AI progress and endpoint content can differ.' };
});
function normalManual(input) {
    const firstInstrumented = input.phases.findIndex(p => p.instrumented);
    return input.phases.filter((phase, index) => phase.label.startsWith('manual-') && !phase.instrumented
        && (firstInstrumented < 0 || index < firstInstrumented)).map(phase => {
        assert(phase.manualCamera && phase.cameraRoute.mode === 'manual-input');
        return metrics(phase);
    });
}
const manual = { baseline: normalManual(baseline), candidate: normalManual(candidate),
    boundary: 'Different camera, native tick and actor sets. Do not report the manual FPS difference as a causal candidate gain.' };
assert(manual.baseline.length && manual.candidate.length); assert.deepEqual(candidate.errors, []);
const identity = row => ({ diagnosticId: row.manifest.diagnosticId, commit: row.manifest.diagnosticCommit,
    manifestHash: row.manifestHash, runDirectory: row.runName, verification: row.verification,
    errors: row.errors, tracePresent: row.tracePresent });
const result = { schemaVersion: 1, status: 'PASS_VALIDATED_WINDOWS_AUTOMATIC_COMPARISON_AND_NORMAL_MANUAL_SAMPLES',
    baseline: identity(baseline), candidate: identity(candidate), config: cConfig, machine: candidate.fingerprint,
    resources: candidate.manifest.completeSiblingResources, limitsMiB: candidate.manifest.limitsMiB,
    automatic, manual, gpuExecutionTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE',
    boundaries: ['Mean FPS is measured game-loop throughput, not presented-frame counting.',
        'Normal manual samples precede any profile collection; subsequent instrumented phases are excluded.',
        'Submission includes CPU/native work and possible waits; it is not GPU execution.',
        'This candidate return has no detailed trace; exact remaining call attribution requires a bounded late F9 trace.'] };
await fs.writeFile(path.resolve(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status,
    automatic: automatic.map(p => ({ label: p.label, before: p.baseline.meanLoopFps, after: p.candidate.meanLoopFps,
        fpsPercent: p.meanLoopFpsChangePercent, updateReductionPercent: p.updateMedianReductionPercent })),
    manualFps: manual.candidate.map(p => p.meanLoopFps), candidateTracePresent: candidate.tracePresent }));
