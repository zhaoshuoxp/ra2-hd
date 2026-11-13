import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { measurementContract, summarizeFrames } from './statistics.mjs';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const runs = [], diagnostics = [];
for (const name of fs.readdirSync(root).sort()) {
    const file = path.join(root, name, 'report.json');
    if (!fs.existsSync(file)) continue;
    const report = read(file);
    if (report.schema !== 'm4-native-benchmark-v1') continue;
    const row = { name, report: path.relative(path.dirname(output), file), reportSha256: sha(file),
        startedAt: report.startedAt, status: report.status, failure: report.failure, edition: report.edition,
        scene: report.scene, density: report.density, phase: report.phase, switch: report.shadowInstancing,
        runtime: report.runtimeIdentity, settings: report.settings,
        thermal: { initial: report.machine?.thermalState, preWindow: report.preWindowThermal,
            final: report.finalThermal?.thermalState, wait: report.thermalWait },
        errors: report.errors, failedResources: report.failedResources };
    if (!report.formalWindow) {
        diagnostics.push({ ...row, disposition: report.status === 'RUNNING' ? 'INCOMPLETE_DIAGNOSTIC' : report.status,
            staticPixels: report.pixelControls?.images.map(image => ({ label: image.label, sha256: image.sha256,
                differentBytes: image.differentBytes, shadowComparison: image.shadowComparison })),
            dynamicPixels: report.shadowStates && { status: report.shadowStates.status, failure: report.shadowStates.failure,
                cases: report.shadowStates.rows.length, exact: report.shadowStates.rows.every(r => !r.differentBytes && !r.repeatedDifferentBytes
                    && r.simulationUnchanged && !r.glError && !r.batch.preparationErrors) },
            saveLifecycle: report.shadowLifecycle?.status });
        continue;
    }
    assert.deepEqual(report.contract, measurementContract, `${name}: contract`);
    const samplesFile = path.join(root, name, 'samples.json');
    if (fs.existsSync(samplesFile)) {
        const raw = read(samplesFile), summary = summarizeFrames(raw), n = raw.intervals.length;
        for (const [key, value] of Object.entries(summary)) assert.deepEqual(value, report.summary[key], `${name}:${key}`);
        for (const key of ['timestamps', 'ticks', 'updateMs', 'renderMs', 'simulationMs', 'workMs',
            'requestedTicks', 'executedTicks', 'samplerMs']) assert.equal(raw[key].length, n, `${name}:${key}`);
        assert(raw.intervals.every(dt => Number.isFinite(dt) && dt > 0));
        for (let i = 0; i < n; i++) {
            assert(Math.abs(raw.timestamps[i] - (i ? raw.timestamps[i - 1] : 0) - raw.intervals[i]) < 1e-7);
            if (i) assert(raw.ticks[i] >= raw.ticks[i - 1]);
        }
        assert.equal(raw.visibility, 'visible'); assert.deepEqual(raw.visibilityEvents, []);
        assert(raw.durationMs >= 120000 && raw.durationMs < 125000);
        assert.equal(report.density, 4); assert.equal(report.settings.shadows, 3);
        assert.equal(report.settings.resolution, 'native'); assert.equal(report.before.zoom, 1);
        assert.deepEqual(report.before.output.effective, report.before.output.requested);
        assert.equal(report.before.bots, 7); assert.equal(report.lobby.gameOpts.gameSpeed, 2);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
        assert.equal(report.after.glError, 0);
        const mode = report.shadowInstancing?.requested;
        assert(['on', 'off'].includes(mode), `${name}: explicit same-build switch`);
        assert(raw.counts.every(c => !c.vehicleShadows?.timingEnabled && !c.vehicleShadows?.preparationErrors));
        assert(raw.counts.every(c => c.vehicleShadows?.enabled === (mode === 'on')));
        const placements = path.join(root, name, 'placements.json');
        assert.equal(sha(placements), report.setup.placementSha256);
        const ranges = {};
        for (const key of ['units', 'buildings', 'projectiles', 'moving', 'firing', 'objects'])
            ranges[key] = { min: Math.min(...raw.counts.map(c => c[key])), max: Math.max(...raw.counts.map(c => c[key])) };
        const shadowRanges = {};
        for (const key of ['registered', 'instances', 'batches', 'uploadedBytes', 'capacity'])
            shadowRanges[key] = { min: Math.min(...raw.counts.map(c => c.vehicleShadows[key])),
                max: Math.max(...raw.counts.map(c => c.vehicleShadows[key])) };
        Object.assign(row, { samplesSha256: sha(samplesFile), sampleCount: n, durationMs: raw.durationMs,
            map: report.mapIdentity, placementSha256: report.setup.placementSha256, output: report.before.output,
            summary: report.summary, objectRanges: ranges, shadowRanges, instrumentation: report.instrumentation });
    } else assert(!report.summary, `${name}: summary without samples`);
    runs.push(row);
}
runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const groups = [];
for (const scenario of [...new Set(runs.map(r => `${r.edition}/${r.scene}`))]) {
    const rows = runs.filter(r => `${r.edition}/${r.scene}` === scenario && r.status === 'COMPLETE');
    if (!rows.length) continue;
    assert.equal(new Set(rows.map(r => r.placementSha256)).size, 1, scenario + ': placements');
    assert.equal(new Set(rows.map(r => r.map.sha256)).size, 1, scenario + ': map');
    assert.equal(new Set(rows.map(r => r.runtime.frozenManifest.sha256)).size, 1, scenario + ': build');
    const modes = {};
    for (const mode of ['off', 'on']) {
        const samples = rows.filter(r => r.switch.requested === mode);
        if (!samples.length) continue;
        const mean = key => samples.reduce((sum, r) => sum + key(r.summary), 0) / samples.length;
        modes[mode] = { n: samples.length, names: samples.map(r => r.name), callbackFps: mean(s => s.callbackFps),
            callbackFpsRange: [Math.min(...samples.map(r => r.summary.callbackFps)), Math.max(...samples.map(r => r.summary.callbackFps))],
            onePercentLow: mean(s => s.onePercentLow), submissionMs: mean(s => s.cpuRenderSubmissionMs.mean),
            updateMs: mean(s => s.cpuUpdateMs.mean), simulationMs: mean(s => s.cpuSimulationMs.mean),
            simulationRatio: mean(s => s.simulationRatio) };
    }
    groups.push({ scenario, modes, callbackChangePercent: modes.on && modes.off
        ? (modes.on.callbackFps / modes.off.callbackFps - 1) * 100 : null,
        submissionChangePercent: modes.on && modes.off ? (modes.on.submissionMs / modes.off.submissionMs - 1) * 100 : null });
}
const result = { schema: 'm4-3a-mac-shadow-evidence-v1', artifactRoot: root, contract: measurementContract,
    verification: 'All available formal intervals and summary fields independently recomputed; no slow-frame removal.',
    comparisonScope: 'Same production build with explicit off/on vehicle-shadow admission; current-main baseline pixels checked separately.',
    formalWindows: runs.length, completedFormal: runs.filter(r => r.status === 'COMPLETE').length,
    anyStable60Pass: runs.some(r => r.summary?.callbackGate), groups, runs, diagnostics,
    limitations: 'Small native run series; visual RNG, OS/driver caches and coarse thermal labels limit attribution. Callback cadence is not screen presentation. GPU duration, actual VRAM and present count are unavailable.',
    windowsScope: 'Cancelled by user; no Windows package, test repair or native verification performed.' };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, formalWindows: result.formalWindows, completed: result.completedFormal,
    anyStable60Pass: result.anyStable60Pass, groups }, null, 2));
