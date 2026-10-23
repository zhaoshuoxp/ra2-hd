import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const [baselineRoot, candidateRoot, baselineAnalysis, candidateAnalysis, outputFile] = process.argv.slice(2, 7).map(p => path.resolve(p));
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function fileHash(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
async function validated(root, analysisFile) {
    const manifest = await json(path.join(root, 'diagnostic-manifest.json'));
    const receipt = await json(path.join(root, 'return-manifest.json')), analysis = await json(analysisFile);
    assert.equal(analysis.manifestHash, await fileHash(path.join(root, 'diagnostic-manifest.json')));
    assert.equal(analysis.diagnosticId, manifest.diagnosticId);
    for (const row of receipt.files) {
        assert(!path.isAbsolute(row.file) && !row.file.includes('\\') && !row.file.split('/').includes('..'));
        const file = path.join(root, row.file), stat = await fs.lstat(file);
        assert(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.size, row.bytes);
        assert.equal(await fileHash(file), row.sha256);
    }
    return { manifest, analysis };
}
const metadata = process.argv[7] ? await json(path.resolve(process.argv[7])) : {};
const a = await validated(baselineRoot, baselineAnalysis), c = await validated(candidateRoot, candidateAnalysis);
assert.deepEqual(a.manifest.completeSiblingResources, c.manifest.completeSiblingResources);
assert.deepEqual(a.manifest.limitsMiB, c.manifest.limitsMiB);
function familySummary(state) {
    const families = new Map(), counts = new Map();
    for (const binding of state.bindings) {
        const key = JSON.stringify([binding.identity, binding.shp, binding.vxl, binding.vxlDensity]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (binding.shp || binding.vxl) families.set(key, true);
    }
    const sorted = [...counts].sort(([x], [y]) => x.localeCompare(y));
    return { uniqueActualHdFamilies: [...families.keys()].sort(), bindingMultisetSha256: digest(sorted),
        hdNodes: state.hdNodes, bindings: state.bindings.length, vxl: state.bindings.filter(b => b.vxl).length,
        shp: state.bindings.filter(b => b.shp).length, counts: sorted };
}
function metric(phase) {
    return { frameIntervals: phase.summary.frameIntervals, simulationCpuMs: phase.summary.simulationCpuMs,
        renderUpdateCpuMs: phase.summary.renderUpdateCpuMs, renderSubmissionCpuMs: phase.summary.renderSubmissionCpuMs,
        drawCalls: phase.summary.drawCalls, loadingMs: phase.loadingMs, nativeTicks: phase.nativeTicks,
        nodes: phase.nodes, visibleNodes: phase.visibleNodes, programs: phase.programs };
}
const pairs = [];
const modes = metadata.modes ?? ['2x', '4x'];
assert(modes.length > 0 && modes.every(mode => ['2x', '4x'].includes(mode)));
for (const mode of modes) {
    const select = (analysis, directory) => {
        const rows = analysis.runs.filter(r => r.config.mode === mode && (!directory || r.directory === directory));
        assert.equal(rows.length, 1, 'Specify the exact run when a return includes repeated captures');
        return rows[0];
    };
    const ar = select(a.analysis, metadata.baselineRun), cr = select(c.analysis, metadata.candidateRun);
    assert(ar && cr); assert.equal(ar.status, 'CAPTURED'); assert.equal(cr.status, 'CAPTURED');
    assert.deepEqual(ar.errors, []); assert.deepEqual(cr.errors, []);
    const { experimentId: ae, ...ac } = ar.config, { experimentId: ce, ...cc } = cr.config;
    assert.deepEqual(ac, cc); assert.deepEqual(ar.machine, cr.machine);
    const ad = path.join(baselineRoot, 'runs', ar.directory), cd = path.join(candidateRoot, 'runs', cr.directory);
    const ap = await json(path.join(ad, 'phases.json')), cp = await json(path.join(cd, 'phases.json'));
    const phases = [];
    for (const [index, aph] of ar.phases.entries()) {
        const cph = cr.phases[index]; assert.equal(aph.label, cph.label);
        assert.equal(aph.instrumented, cph.instrumented);
        if (metadata.normalOnly) assert.equal(aph.instrumented, false);
        for (const ph of [aph, cph]) { assert.equal(ph.validity, 'VALID_BOUNDED_SAMPLE'); assert(ph.nativeTicks > 0); }
        for (const key of ['graphics', 'output', 'logicalSize', 'players', 'bots', 'focusedAtEnd', 'focusEvents', 'visibilityEvents', 'resizeEvents'])
            assert.deepEqual(aph[key], cph[key]);
        for (const key of ['startTimestamp', 'gameOptions', 'desiredSpeed', 'performanceOptions', 'viewport', 'context', 'gpuRenderer'])
            assert.deepEqual(ap[index].endState[key], cp[index].endState[key]);
        const af = familySummary(ap[index].endState), cf = familySummary(cp[index].endState);
        const am = new Map(af.counts), cm = new Map(cf.counts);
        const differences = [...new Set([...am.keys(), ...cm.keys()])].filter(key => am.get(key) !== cm.get(key))
            .map(key => ({ family: JSON.parse(key), baseline: am.get(key) ?? 0, candidate: cm.get(key) ?? 0 }));
        delete af.counts; delete cf.counts;
        phases.push({ label: aph.label, instrumented: aph.instrumented, baseline: metric(aph), candidate: metric(cph),
            content: { baseline: af, candidate: cf, actualHdFamilySetEqual: digest(af.uniqueActualHdFamilies) === digest(cf.uniqueActualHdFamilies),
                countDifferences: differences }, boundary: 'Independent advancing AI sessions; native ticks, endpoint actor counts and animation frames can differ.' });
    }
    pairs.push({ mode, config: ac, machine: ar.machine, baselineRun: ar.directory, candidateRun: cr.directory, phases,
        trace: { baseline: ar.trace, candidate: cr.trace }, profiles: { baseline: ar.profile ?? null, candidate: cr.profile ?? null } });
}
async function verification(root, manifest) {
    const file = path.join(root, 'verification.json');
    if (!await fs.stat(file).catch(() => false)) return { status: 'MISSING' };
    const row = await json(file);
    assert.equal(row.diagnosticId, manifest.diagnosticId);
    assert.equal(row.manifestSha256, await fileHash(path.join(root, 'diagnostic-manifest.json')));
    assert.equal(row.checked, manifest.files.length);
    assert.equal(row.status, 'PASS'); assert.deepEqual(row.failures, []);
    return row;
}
const targetVerification = { baseline: await verification(baselineRoot, a.manifest),
    candidate: await verification(candidateRoot, c.manifest) };
const report = { status: metadata.status ?? 'MATCHED_WINDOWS_AB_ANALYZED',
    baseline: { id: a.manifest.diagnosticId, commit: a.manifest.diagnosticCommit, manifestHash: a.analysis.manifestHash },
    candidate: { id: c.manifest.diagnosticId, commit: c.manifest.diagnosticCommit, manifestHash: c.analysis.manifestHash },
    resourceIdentity: c.manifest.completeSiblingResources, limitsMiB: c.manifest.limitsMiB, pairs,
    userFeedback: metadata.userFeedback ?? null, smoothnessAcceptance: metadata.smoothnessAcceptance ?? 'PENDING',
    visualAcceptance: metadata.visualAcceptance ?? 'PENDING',
    gpuTime: 'UNAVAILABLE', actualProcessVram: 'UNAVAILABLE', gpuBudget: 'UNAVAILABLE',
    targetVerification,
    verificationBoundary: 'Target verification presence/status is recorded separately. Full incoming CRC/hash and local sealed-kit verification do not replace a missing target receipt.',
    conclusion: metadata.conclusion ?? 'Interpret the paired valid normal phases separately from instrumented traces.' };
await fs.writeFile(outputFile, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, pairs: pairs.length, phases: pairs.map(p => p.phases.length), outputFile }));
