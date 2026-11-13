import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) ?? 'original-live-chrono-lock-before-release';
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Fresh original mission re-executes its ordinary player prefix into a real source-created chrono arrival. A named save/full application restart must preserve the entire mid-lock world and exact 180-tick release/continuation. Read-only phase inspection; no injected reinforcement, event, source/rule/health/ownership/objective or post-creation RNG change. This early-phase check is not full-goal acceptance.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, label);
    report.before = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, hash: g.getHash(), launch: c.launch,
            source: c.trace.filter(action => action.opcode === 107),
            teams: [...c.teams.instances.values()].filter(team => team.phase === 'phasing').map(team => ({
                type: team.type, waitUntil: team.waitUntil, line: team.line,
                members: team.members.filter(unit => unit.isSpawned).map(unit => ({ id: unit.id, name: unit.name,
                    remaining: unit.warpedOutTrait.remainingTicks, locked: unit.warpedOutTrait.isActive(),
                    invulnerable: unit.warpedOutTrait.isInvulnerable() })) })) };
    });
    assert.equal(report.before.launch.semanticsVersion, 9); assert(report.before.source.length && report.before.teams.length);
    assert(report.before.teams.every(team => team.line === 0 && team.waitUntil > report.before.tick
        && team.members.length && team.members.every(unit => unit.locked && unit.remaining > 0 && !unit.invulnerable)));
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original chrono arrival before lock release'));
    report.after = await page.evaluate(types => { const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, failure: c.failure, teams: [...c.teams.instances.values()].filter(team => types.includes(team.type))
            .map(team => ({ type: team.type, phase: team.phase, line: team.line,
                locked: team.members.filter(unit => unit.isSpawned).some(unit => unit.warpedOutTrait.isActive()) })),
            scripts: c.teams.trace.filter(line => types.includes(line.team)) };
    }, report.before.teams.map(team => team.type));
    assert(!report.after.failure && report.after.teams.every(team => team.phase !== 'phasing' && !team.locked));
    for (const team of report.before.teams) {
        const first = report.after.scripts.find(line => line.team === team.type);
        assert(first && first.tick >= team.waitUntil && first.tick <= team.waitUntil + 1);
    }
    await page.screenshot({ path: path.join(out, 'native-original-chrono-release-after-full-restart.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_CHRONO_MID_LOCK_FULL_RESTART_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
