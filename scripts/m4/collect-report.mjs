import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Use: node collect-report.mjs /artifact/root /report.json');
const root = path.resolve(input), runs = [], diagnostics = [];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const entry of (await fs.readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'report.json');
    const bytes = await fs.readFile(file).catch(() => undefined);
    if (!bytes) continue;
    const report = JSON.parse(bytes);
    if (report.schema !== 'm4-native-benchmark-v1') continue;
    const identity = { name: entry.name, file: path.relative(path.dirname(path.resolve(output)), file),
        reportSha256: digest(bytes), status: report.status, edition: report.edition, scene: report.scene,
        density: report.density, phase: report.phase, runtime: report.runtime, failure: report.failure,
        thermal: { initial: report.machine?.thermalState, preWindow: report.preWindowThermal,
            final: report.finalThermal?.thermalState }, settings: report.settings };
    if (!report.formalWindow) {
        diagnostics.push({ ...identity, disposition: report.status === 'RUNNING' ? 'INCOMPLETE_EXPLORATORY_RECORD' : report.status });
        continue;
    }
    const samples = await fs.readFile(path.join(root, entry.name, 'samples.json')).catch(() => undefined);
    const raw = samples && JSON.parse(samples);
    const ranges = raw && Object.fromEntries(['units', 'buildings', 'projectiles', 'moving', 'firing', 'objects'].map(key =>
        [key, { min: Math.min(...raw.counts.map(count => count[key])), max: Math.max(...raw.counts.map(count => count[key])) }]));
    runs.push({ ...identity, startedAt: report.startedAt, runtimeIdentity: report.runtimeIdentity,
        samplesSha256: samples && digest(samples), map: report.mapIdentity, placementSha256: report.setup?.placementSha256,
        loading: report.loading, artificialSetupMs: report.artificialSetupMs, beforeTick: report.before?.tick,
        afterTick: report.after?.tick, objectRanges: ranges, summary: report.summary, instrumentation: report.instrumentation,
        nativeMesh: report.nativeMesh, errors: report.errors, failedResources: report.failedResources });
}
const read = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const optional = async name => fs.readFile(path.join(root, name), 'utf8').then(JSON.parse).catch(() => undefined);
const report = { schema: 'm4-mac-performance-evidence-v1', artifactRoot: root,
    performanceTarget: 'NOT_PASSED_60_FPS', userAcceptance: 'PENDING', windows: 'NOT_RUN_ON_THIS_MAC',
    hardware: await read('hardware.json'), contract: runs[0] && (await read(runs[0].name + '/report.json')).contract,
    sourceBaseline: 'be4e59ff1764ba8ef92c50e1080ce1a6c5e45cf3', runs, diagnostics,
    nativeWeldDiagnostic: await read('native-weld-warm.json'), storage: await read('storage/report.json'),
    pixelParity: await read('pixel-parity.json'), hostTests: await read('host-final/summary.json'),
    delivery: await optional('delivery/receipt.json'), nativeApp: await optional('app-regressions/report.json'),
    protection: await optional('protection-final.json') };
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, formalRuns: runs.length, diagnostics: diagnostics.length,
    allFormalComplete: runs.every(run => run.status === 'COMPLETE'), anyCallbackGatePassed: runs.some(run => run.summary?.callbackGate) }));
