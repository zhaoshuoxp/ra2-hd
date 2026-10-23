import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';

const { SourceMapConsumer } = createRequire(import.meta.url)('source-map-js');
const [returned, trustedKit, output] = process.argv.slice(2).map(value => path.resolve(value));
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = async file => {
    const value = createHash('sha256');
    for await (const bytes of createReadStream(file)) value.update(bytes);
    return value.digest('hex');
};
const manifestFile = path.join(returned, 'diagnostic-manifest.json');
const manifestHash = await hash(manifestFile);
assert.equal(manifestHash, await hash(path.join(trustedKit, 'diagnostic-manifest.json')));
const manifest = await json(manifestFile), receipt = await json(path.join(returned, 'return-manifest.json'));
assert.equal(receipt.diagnosticId, manifest.diagnosticId);
assert.equal(receipt.schemaVersion, manifest.schemaVersion);
for (const row of receipt.files) {
    assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
    const file = path.join(returned, row.file), info = await fs.lstat(file);
    assert(info.isFile() && !info.isSymbolicLink() && await fs.realpath(file) === file);
    assert.equal(info.size, row.bytes); assert.equal(await hash(file), row.sha256);
}
await fs.mkdir(output, { recursive: false });
const maps = new Map(), rows = new Map(manifest.files.map(row => [row.file, row]));
const mapped = async frame => {
    if (!frame.url.startsWith('ra2://game/assets/') || frame.lineNumber < 0 || frame.columnNumber < 0) return null;
    const name = path.posix.basename(frame.url);
    if (!maps.has(name)) {
        const relative = 'Reference/sourcemaps/' + name + '.map';
        const file = path.join(trustedKit, relative);
        assert.equal(await hash(file), rows.get(relative)?.sha256);
        maps.set(name, new SourceMapConsumer(await json(file)));
    }
    return maps.get(name).originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
};
const results = [];
for (const identity of receipt.runIdentities) {
    const directory = path.join(returned, 'runs', identity.directory);
    const run = await json(path.join(directory, 'run.json'));
    assert.equal(run.manifestSha256, manifestHash); assert.equal(run.diagnosticCommit, manifest.diagnosticCommit);
    const machine = await json(path.join(directory, 'machine.json'));
    const phases = await json(path.join(directory, 'phases.json'));
    const result = { directory: identity.directory, status: run.status, config: run.config,
        machine: { platform: machine.platform, arch: machine.arch, cpu: machine.cpu,
            memoryBytes: machine.memoryBytes, onBattery: machine.onBattery, displays: machine.displays,
            gpuRenderer: machine.gpu?.auxAttributes?.glRenderer, runtime: machine.runtime,
            gpuFeatureStatus: machine.gpuFeatureStatus },
        errors: await json(path.join(directory, 'errors.json')),
        phases: phases.map(phase => {
            const state = phase.endState;
            return { label: phase.label, validity: phase.validity, instrumented: phase.instrumented,
                elapsedMs: phase.elapsedMs, loadingMs: phase.loadingToFirstGameFrameMs,
                nativeTicks: phase.tickEnd - phase.tickStart, summary: phase.summary,
                graphics: state.graphics, output: state.output, logicalSize: state.logicalSize,
                players: state.players, bots: state.bots, nodes: state.nodes, visibleNodes: state.visibleNodes,
                programs: state.shaderProgramCount, threeMemory: state.threeMemory,
                actualBindingCounts: { vxl: state.bindings.filter(binding => binding.vxl).length,
                    shp: state.bindings.filter(binding => binding.shp).length },
                focusedAtEnd: state.focused, focusEvents: phase.focusEvents,
                visibilityEvents: phase.visibilityEvents, resizeEvents: phase.resizeEvents };
        }) };
    const profileFile = path.join(directory, 'cpu.cpuprofile');
    if (await fs.stat(profileFile).catch(() => false)) {
        const profile = await json(profileFile), self = new Map(), inclusive = new Map();
        const nodes = new Map(profile.nodes.map(node => [node.id, node]));
        const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
        profile.samples.forEach((id, index) => {
            const weight = profile.timeDeltas[index]; self.set(id, (self.get(id) ?? 0) + weight);
            const seen = new Set();
            while (!seen.has(id)) {
                seen.add(id); inclusive.set(id, (inclusive.get(id) ?? 0) + weight);
                if (!parents.has(id)) break; id = parents.get(id);
            }
        });
        result.profile = { durationMs: (profile.endTime - profile.startTime) / 1000,
            boundary: 'Sample weights include native waits and collection boundaries; not GPU execution time. Inclusive rows overlap.',
            topSelf: await Promise.all([...self].sort((a, b) => b[1] - a[1]).slice(0, 35).map(async ([id, time]) => ({
                selfMs: time / 1000, inclusiveMs: inclusive.get(id) / 1000,
                frame: nodes.get(id).callFrame, original: await mapped(nodes.get(id).callFrame) }))) };
    }
    const traceStatus = await json(path.join(directory, 'trace-status.json')).catch(() => null);
    result.trace = { status: traceStatus, rawTracePresent: !!await fs.stat(path.join(directory, 'trace.json')).catch(() => false) };
    results.push(result);
}
const analysis = { schemaVersion: 1, status: 'VALIDATED_WINDOWS_RETURN_ANALYZED',
    diagnosticId: manifest.diagnosticId, diagnosticCommit: manifest.diagnosticCommit, manifestHash,
    launcherPolicy: 'Data only; no returned launcher was executed.',
    gpuTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE', runs: results };
await fs.writeFile(path.join(output, 'analysis.json'), JSON.stringify(analysis, null, 2));
console.log(JSON.stringify({ status: analysis.status, runs: results.length, output }));
