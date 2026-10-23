import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = '.artifacts/compat';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const natural = read(`${root}/browser.json`);
const stability = read(process.env.M01_STABILITY_EVIDENCE ?? `${root}/defended-8/browser.json`);
const smoke = read(`${root}/smoke.json`);
const report = { status: 'FAIL', checks: [] };
function check(name, action) {
    action();
    report.checks.push(name);
}
try {
    check('Four slots, three Normal local bots and fixed seed', () => {
        for (const run of [natural, stability]) {
            assert.equal(run.scenario.gameOpts.humanPlayers.length, 1);
            const bots = run.scenario.gameOpts.aiPlayers.filter(Boolean);
            assert.equal(bots.length, 3);
            assert.ok(bots.every(bot => bot.difficulty === 4 && bot.teamId === 1));
            assert.ok(run.samples.every(sample => sample.players.length === 4));
            assert.deepEqual(run.samples[0].seed, ['0', 1700000000000]);
        }
    });
    check('Ten continuous wall-clock minutes with advancing simulation', () => {
        const samples = stability.samples;
        assert.ok(samples.at(-1).elapsedMs - samples[0].elapsedMs >= 599900);
        assert.ok(samples.length >= 40);
        assert.ok(samples.every((sample, index) => !sample.failure &&
            (sample.status === 1 && !sample.end ||
                index === samples.length - 1 && sample.status === 2 && sample.end && sample.elapsedMs >= 600000)));
        for (let i = 1; i < samples.length; i++) {
            assert.ok(samples[i].tick > samples[i - 1].tick);
            assert.ok(samples[i].gameTime > samples[i - 1].gameTime);
            assert.ok(samples[i].elapsedMs - samples[i - 1].elapsedMs < 30000);
        }
        assert.ok(!stability.stall);
        assert.ok(samples.at(-1).tick - samples[0].tick >= 5900);
        assert.equal(samples.at(-1).humanSequence.structures.index, 3);
        assert.equal(samples.at(-1).humanSequence.armory.index, 8);
    });
    check('Each bot builds, receives income and attacks in the natural-result run', () => {
        for (const player of natural.samples.at(-1).players.filter(player => player.isAi)) {
            const states = natural.samples.map(sample => sample.players.find(p => p.name === player.name));
            assert.ok(player.built > 0 && player.kills > 0);
            assert.ok(states.some((state, i) => i > 0 && state.credits > states[i - 1].credits));
            assert.ok(states.some(state => state.objects.some(object => object.name === 'NAREFN')));
            assert.ok(states.some(state => state.objects.some(object => object.name === 'HARV')));
        }
    });
    check('Natural game-end event and human defeat with surviving opponents', () => {
        const last = natural.samples.at(-1);
        assert.equal(last.status, 2);
        assert.ok(last.end?.tick > 0);
        assert.ok(last.players.find(player => !player.isAi).defeated);
        assert.ok(last.players.filter(player => player.isAi).every(player => !player.defeated));
    });
    check('Original orthographic camera, 4x4 foundation and actual selection vertices', () => {
        const camera = stability.samples[0].camera;
        assert.equal(camera.type, 'OrthographicCamera');
        assert.equal(camera.zoom, 1);
        assert.deepEqual(camera.rotation, [-Math.PI / 6, Math.PI / 4, 0, 'YXZ']);
        assert.deepEqual(stability.geometry.foundation, { width: 4, height: 4 });
        assert.equal(stability.geometry.selection.visible, true);
        assert.ok(stability.geometry.selection.parts.some(part => part.vertices.length > 0));
    });
    check('No page errors, console errors or attempted external connections on exercised paths', () => {
        for (const run of [natural, stability]) {
            assert.deepEqual(run.errors, []);
            assert.deepEqual(run.externalAttempts, []);
            assert.deepEqual(run.console.filter(entry => entry.type === 'error'), []);
            assert.ok(run.samples.every(sample => !sample.failure && sample.attempts.length === 0));
        }
        assert.deepEqual(stability.websocketAttempts, []);
        assert.deepEqual(stability.workers, []);
        assert.equal(smoke.status, 'PASS');
        assert.deepEqual(smoke.errors, []);
        assert.deepEqual(smoke.workers, []);
    });
    report.status = 'PASS';
} catch (error) {
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    fs.writeFileSync(`${root}/runtime-acceptance.json`, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
}
