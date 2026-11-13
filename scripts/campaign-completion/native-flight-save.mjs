import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const [outArg, sourceArg, prefix, delivered, teamType] = process.argv.slice(2);
const out = path.resolve(outArg), directory = path.resolve(sourceArg);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Actual original reinforcement whose infantry team is immediately dissolved by the source. A genuine named Save UI, full application restart and normal Load UI must restore the pending independent delivery, exact world/RNG/mission and180-tick continuation. Remaining recorded ordinary actions must deliver the source passengers and let the real aircraft leave. No fabricated source event, source edit, passenger spawn or result assignment.' };
let app, page, labels;
async function flight() {
    return page.evaluate(type => {
        const g = window.__ra2debug.game, state = g.campaign.checkpointState().teams;
        const team = state.instances.find(team => team.type === type);
        const plane = g.world.getAllObjects().find(unit => unit.id === team.flight.plane);
        return { tick: g.currentTick, hash: g.getHash(), detachedFlights: state.detachedFlights, team,
            plane: { id: team.flight.plane, inWorld: !!plane, spawned: plane?.isSpawned, destroyed: plane?.isDestroyed } };
    }, teamType);
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.prefix = await replaySourcePrefix(page, source, prefix);
    report.before = await flight();
    assert.equal(report.before.team.phase, 'finished'); assert(report.before.team.flight.remaining.length > 0);
    assert(report.before.detachedFlights.includes(report.before.team.id)); assert(report.before.plane.spawned);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original detached reinforcement in flight'));
    report.restored = await flight(); assert.equal(report.restored.team.phase, 'finished');
    report.delivery = await continueRecordedSource(page, source, delivered);
    report.after = await flight();
    assert.equal(report.after.team.phase, 'finished'); assert.equal(report.after.team.line, 0);
    assert.deepEqual(report.after.team.flight.remaining, []); assert(!report.after.detachedFlights.includes(report.after.team.id));
    assert.equal(report.after.plane.inWorld, false);
    await page.screenshot({ path: path.join(out, 'native-original-detached-flight-delivery-and-exit.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_DETACHED_FLIGHT_NAMED_RESTART_DELIVERY_AND_EXIT';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
