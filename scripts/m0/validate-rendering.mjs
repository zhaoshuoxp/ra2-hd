import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = '.artifacts/rendering';
const read = name => JSON.parse(fs.readFileSync(`${root}/${name}`, 'utf8'));
const chrome = read('depth-fixed/probe.json');
const webkit = read('webkit-final/probe.json');
const aircraft = read('aircraft-americans/probe.json');
const ground = read('ground-regression/browser.json');
const protection = JSON.parse(fs.readFileSync('.artifacts/source-protection.json', 'utf8'));
const report = { status: 'FAIL', checks: [], limitations: [
    'Native Safari and Windows were not validated.',
    'WebKit still has occasional 97–214 ms frame intervals in these short samples.',
    'MCV decoding matches local source data; retail pixel parity remains unverified.',
    'Aircraft acceptance is Chrome Harrier takeoff/selection/move only.',
    'Ground regression is two minutes; the earlier ten-minute run is historical.',
    'The speed-6 empty-army pathfinding failure is retained and unresolved.',
] };
function check(name, verify) {
    verify();
    report.checks.push(name);
}
try {
    check('No runtime errors or attempted external requests in accepted runs', () => {
        for (const run of [chrome, webkit, aircraft]) {
            assert.equal(run.harnessError, undefined);
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.external, []);
            assert.deepEqual(run.initial.attempts, []);
            assert.deepEqual(run.console.filter(e => e.type === 'error'), []);
        }
        assert.deepEqual(ground.errors, []);
        assert.deepEqual(ground.console.filter(e => e.type === 'error'), []);
        assert.deepEqual(ground.externalAttempts, []);
        assert.deepEqual(ground.websocketAttempts, []);
        assert.deepEqual(ground.workers, []);
    });
    check('Shadow projection and actual quality target sizes', () => {
        for (const run of [chrome, webkit]) {
            const shadow = run.initial.shadow;
            assert.equal(shadow.cast, true);
            assert.deepEqual(shadow.actualSize, [8192, 8192]);
            const camera = shadow.camera.object;
            assert.ok(Math.abs(shadow.projection[0] - 2 / (camera.right - camera.left)) < 1e-10);
            assert.deepEqual(run.phases.find(p => p.name === 'shadow-low').snapshot.shadow.actualSize, [2048, 2048]);
        }
    });
    check('Vehicle visual position advances between simulation ticks in Chrome and WebKit', () => {
        for (const run of [chrome, webkit]) {
            const frames = run.motion.frames;
            const pairs = frames.slice(1).map((b, i) => [frames[i], b]).filter(([a, b]) => a.moving && b.moving);
            const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
            assert.ok(pairs.length > 100);
            assert.ok(pairs.filter(([a, b]) => same(a.logical, b.logical) && !same(a.visual, b.visual)).length > 50);
            assert.ok(Number.isFinite(run.motion.actionQueueMs) && run.motion.actionQueueMs >= 0);
            assert.equal(run.initial.model.placeholder, false);
            assert.equal(run.initial.model.sections[0].voxels, 21119);
        }
        assert.match(webkit.frameStats, /FPS.*ticks\/s.*p95/);
    });
    check('Normal American headquarters and Harrier production, selection and flight', () => {
        const test = aircraft.aircraft;
        assert.deepEqual(test.production.actions.filter(a => a.action === 'QueueForProduction').map(a => a.name),
            ['GAPOWR', 'GAREFN', 'AMRADR', 'ORCA']);
        assert.ok(test.frames.every(f => f.selected && f.selectionVisible && !f.placeholder && !f.helper));
        assert.ok(test.frames.some(f => f.elevation > 1));
        assert.notDeepEqual(test.frames[0].position, test.frames.at(-1).position);
        assert.ok(test.frames.every(f => f.parts.some(p => p.castShadow && p.vertices === 6925)));
    });
    check('Two-minute fixed-seed original-graphics ground 1v3 regression', () => {
        assert.ok(ground.acceptance.stableRequestedDuration && !ground.stall);
        assert.equal(ground.scenario.gameOpts.aiPlayers.filter(Boolean).length, 3);
        assert.ok(ground.scenario.gameOpts.aiPlayers.filter(Boolean).every(p => p.difficulty === 4 && p.teamId === 1));
        const samples = ground.samples;
        assert.deepEqual(samples[0].seed, ['0', 1700000000000]);
        assert.ok(samples.at(-1).elapsedMs >= 120000);
        assert.ok(samples.at(-1).tick - samples[0].tick > 2000);
        assert.ok(samples.every((s, i) => s.status === 1 && !s.failure && s.players.length === 4 &&
            (i === 0 || s.tick > samples[i - 1].tick)));
        assert.equal(samples[0].camera.zoom, 1);
        assert.deepEqual(ground.geometry.foundation, { width: 4, height: 4 });
        assert.ok(ground.geometry.selection.visible);
    });
    check('Seven original voxel files and retail source protection', () => {
        assert.equal(read('model-audit.json').length, 7);
        assert.ok(read('model-audit.json').every(model => model.sections.every(s => s.offsetDecoderMatches)));
        assert.ok(protection.metadata_unchanged && protection.parent_git_absent && protection.source_git_absent);
        assert.ok(protection.hashes.every(h => h.source_unchanged && h.destination_matches));
    });
    report.status = 'PASS_WITH_LIMITATIONS';
} catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    fs.writeFileSync(`${root}/acceptance.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
