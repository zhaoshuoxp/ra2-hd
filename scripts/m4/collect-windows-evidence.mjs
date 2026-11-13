// Collect every Windows M4.2 benchmark record (formal, diagnostic, failed) into one evidence file.
// Usage: node collect-windows-evidence.mjs <evidence/windows> <output.json>
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Use: node collect-windows-evidence.mjs <evidence/windows> <output.json>');
const root = path.resolve(input), runs = [], diagnostics = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const optional = async name => fs.readFile(path.join(root, name), 'utf8').then(text => JSON.parse(text.replace(/^﻿/, ''))).catch(() => undefined);
for (const entry of (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'report.json');
    const bytes = await fs.readFile(file).catch(() => undefined);
    if (!bytes) continue;
    const report = JSON.parse(bytes);
    if (report.schema !== 'm4-native-benchmark-v1') continue;
    const identity = { name: entry.name, reportSha256: digest(bytes), status: report.status, edition: report.edition,
        scene: report.scene, density: report.density, phase: report.phase, startedAt: report.startedAt,
        packageSourceHead: report.runtimeIdentity?.packageSourceHead, harnessHead: report.runtimeIdentity?.harnessHead,
        loadedAppPath: report.machine?.loadedAppPath, failure: report.failure?.split('\n')[0],
        thermal: { initial: report.machine?.thermalState, preWindow: report.preWindowThermal, final: report.finalThermal?.thermalState },
        onBattery: report.machine?.onBattery, settings: report.settings };
    if (!report.formalWindow) {
        diagnostics.push({ ...identity, seconds: report.seconds, static: !!report.pixelControls,
            fps: report.summary?.callbackFps, drawDiagnostic: report.drawDiagnostic && {
                nodes: report.drawDiagnostic.nodes, visibleNodes: report.drawDiagnostic.visibleNodes,
                submissions: report.drawDiagnostic.rows.reduce((sum, row) => sum + row.count, 0),
                emptyColourPassVxl: report.drawDiagnostic.rows.filter(row => /PalettePhongMaterial\|noColor\|noDepth/.test(row.key))
                    .reduce((sum, row) => sum + row.count, 0) },
            pixelImages: report.pixelControls?.images?.map(image => ({ label: image.label, sha256: image.sha256, hdVehicles: image.hdVehicles })) });
        continue;
    }
    const samples = await fs.readFile(path.join(root, entry.name, 'samples.json')).catch(() => undefined);
    const raw = samples && JSON.parse(samples);
    const ranges = raw && Object.fromEntries(['units', 'buildings', 'projectiles', 'moving', 'firing', 'objects'].map(key =>
        [key, { min: Math.min(...raw.counts.map(count => count[key])), max: Math.max(...raw.counts.map(count => count[key])) }]));
    const { perSecond, longStalls, ...summary } = report.summary ?? {};
    runs.push({ ...identity, samplesSha256: samples && digest(samples), map: report.mapIdentity,
        placementSha256: report.setup?.placementSha256, loading: report.loading, beforeTick: report.before?.tick,
        afterTick: report.after?.tick, objectRanges: ranges, summary,
        perSecondCallbacks: perSecond?.map(row => row.callbacks), longStalls: longStalls?.map(row => [Math.round(row.atMs), +row.ms.toFixed(2)]),
        rendererSnapshot: report.rendererDiagnostic && { calls: report.rendererDiagnostic.fullFrame?.calls,
            triangles: report.rendererDiagnostic.fullFrame?.triangles, backend: report.rendererDiagnostic.backend },
        errors: report.errors, failedResources: report.failedResources });
}
const first = runs[0] && JSON.parse(await fs.readFile(path.join(root, runs[0].name, 'report.json'), 'utf8'));
const evidence = { schema: 'm4-2-windows-performance-evidence-v1', evidenceRoot: path.basename(root),
    performanceTarget: runs.some(run => run.summary?.callbackGate) ? 'SOME_RUN_PASSED_REVIEW_REQUIRED' : 'NOT_PASSED_60_FPS',
    system: await optional('system.json'), machine: first && { versions: first.machine.versions, displays: first.machine.displays,
        gpu: first.machine.gpu?.gpuDevice, backend: first.rendererDiagnostic?.backend, context: first.rendererDiagnostic?.context },
    contract: first?.contract, runs, diagnostics,
    correctness: Object.fromEntries(await Promise.all(['wav-decode-equivalence', 'native-weld-resources',
        'native-weld-resources-mac-m4.1-version', 'pixel-parity-candidate1', 'pixel-parity-final']
        .map(async name => [name, await optional(`correctness/${name}.json`)]))) };
await fs.writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ output, formalRuns: runs.length, diagnostics: diagnostics.length,
    allFormalComplete: runs.every(run => run.status === 'COMPLETE'), anyCallbackGatePassed: runs.some(run => run.summary?.callbackGate) }));
