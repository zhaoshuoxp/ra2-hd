import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = '.artifacts/mcv';
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const report = { status: 'FAIL', checks: [], limitations: [
    'The supplied reference supports qualitative detail comparison, not exact retail pixel parity.',
    'Native Safari and Windows were not automated or validated by this run.',
    'Browser tests exercise the non-batched voxel path; broader HVA, remap and lighting coverage remains open.',
    'The ground regression is two minutes, not a new full-match completion test.',
    'Intermittent Safari/WebKit frame stalls remain a separate bounded task.',
] };
function check(name, run) { run(); report.checks.push(name); }
try {
    const browsers = [read('final-chrome/probe.json'), read('final-webkit/probe.json')];
    const timing = read('timing-webkit/probe.json');
    const aircraft = read('aircraft-regression/probe.json'), ground = read('ground-regression/browser.json');
    check('No runtime errors or external requests in final browser runs', () => {
        for (const run of [...browsers, aircraft, timing]) {
            assert.equal(run.harnessError, undefined);
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.external, []);
            assert.deepEqual(run.initial.attempts, []);
            assert.deepEqual(run.console.filter(e => e.type === 'error'), []);
        }
    });
    check('Original MCV geometry is preserved at eight orientations in both browsers', () => {
        for (const run of browsers) {
            assert.equal(run.initial.model.placeholder, false);
            assert.equal(run.initial.model.sections[0].voxels, 21119);
            assert.equal(run.mcv.original.vertices, 58263);
            assert.equal(run.mcv.angles.length, 8);
            assert.ok(run.mcv.angles.every(a => a.changedPixels === 0));
            assert.ok(run.mcv.visibleControlChangedPixels > 100);
            assert.equal(run.mcv.useVoxelLookup, true);
        }
    });
    check('VPL, owner remap, ambient light and transparency visibly affect output', () => {
        for (const run of browsers) for (const count of Object.values(run.mcv.materialChecks)) assert.ok(count > 20);
    });
    check('Synthetic darkest/brightest GPU lookup rows match expected palette bytes', () => {
        for (const run of browsers) {
            assert.deepEqual(run.mcv.gpuPaletteSamples.map(s => s.row), [0, 31]);
            for (const sample of run.mcv.gpuPaletteSamples) {
                assert.ok(sample.actual.every((channel, i) => Math.abs(channel - sample.expected[i]) <= 1));
            }
        }
    });
    check('MCV/tank terrain shadows survive the material correction', () => {
        for (const run of browsers) {
            assert.equal(run.initial.shadow.cast, true);
            assert.deepEqual(run.initial.shadow.actualSize, [8192, 8192]);
        }
        for (const pair of read('shadow-check.json')) assert.ok(pair.darkenedWorldPixels > 1000);
    });
    check('Two-minute original-graphics offline 1v3 remains active with no network activity', () => {
        assert.equal(ground.acceptance.stableRequestedDuration, true);
        for (const key of ['externalAttempts', 'websocketAttempts', 'errors', 'workers']) assert.equal(ground.acceptance[key], 0);
        assert.ok(ground.samples.at(-1).elapsedMs >= 120000);
        assert.equal(ground.samples.at(-1).players.filter(p => p.isAi && !p.defeated).length, 3);
        assert.ok(ground.samples.at(-1).tick > ground.samples[0].tick + 2000);
    });
    check('Normal American deployment, aircraft production, selection and flight still work', () => {
        const test = aircraft.aircraft;
        assert.deepEqual(test.production.actions.filter(a => a.action === 'QueueForProduction').map(a => a.name),
            ['GAPOWR', 'GAREFN', 'AMRADR', 'ORCA']);
        assert.ok(test.frames.every(f => f.selected && f.selectionVisible && !f.placeholder && !f.helper));
        assert.ok(test.frames.some(f => f.elevation > 1));
        assert.notDeepEqual(test.frames[0].position, test.frames.at(-1).position);
        assert.ok(test.frames.every(f => f.parts.some(p => p.castShadow && p.vertices === 6925)));
    });
    check('Source metadata, imported archive hashes and distribution separation remain intact', () => {
        const protection = JSON.parse(fs.readFileSync('.artifacts/source-protection.json', 'utf8'));
        const separation = JSON.parse(fs.readFileSync('.artifacts/separation-audit.json', 'utf8'));
        assert.equal(protection.metadata_unchanged, true);
        assert.ok(protection.hashes.every(h => h.source_unchanged && h.destination_matches));
        assert.ok(protection.parent_git_absent && protection.source_git_absent);
        for (const key of ['build_archive_extensions', 'build_hash_matches', 'new_unignored_asset_paths']) assert.deepEqual(separation[key], []);
        const imported = read('import-dry-run.json');
        assert.equal(imported.dryRun, true);
    });
    report.measurements = browsers.map(run => ({ browser: run.browser, material: run.mcv.materialChecks,
        timing: run.phases.map(phase => ({ name: phase.name, frame: phase.metrics.frame, ticks: phase.metrics.ticks })) }));
    report.webkitTiming = { browser: timing.browser, phases: timing.phases.map(phase => ({ name: phase.name,
        durationMs: phase.metrics.durationMs, frame: phase.metrics.frame, ticks: phase.metrics.ticks })) };
    report.ground = { durationMs: ground.samples.at(-1).elapsedMs, startTick: ground.samples[0].tick,
        endTick: ground.samples.at(-1).tick, players: ground.samples.at(-1).players.map(p => ({ isAi: p.isAi, built: p.built, kills: p.kills })) };
    report.status = 'PASS_WITH_LIMITATIONS';
} finally {
    fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
