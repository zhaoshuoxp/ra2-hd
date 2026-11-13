import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening } from './feedback-source-replay-v53.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all01-source-commands-v15.json'));
source.samples = [];
const report = {
    status: 'RUNNING', errors: [], failedResources: [], scope: 'Unchanged original Allied01, original creation seed and ordinary Tanya attack commands. Save while the first real naval C4 fuse and retreat are active, quit the app, restore exactly and continue. No source, rules, health, actor, objective or RNG edits.'
};
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    report.opening = await replayFeedbackOpening(page, source, 1110, { demolitionSafetyVersion: 1, neutralStructureTargetingVersion: 1, civilianTargetingVersion: 2 });
    report.planted = await page.evaluate(() => { const g = window.__ra2debug.game, u = g.world.getAllObjects().find(u => u.name === 'TANY'), escape = t => t.demolitionRetreat || t.children?.some(escape); return {
        tick: g.currentTick, id: u.id, hp: u.healthTrait.getHitPoints(), escaping: u.unitOrderTrait.getTasks().some(escape), ships: g.world.getAllObjects().filter(u => u.name === 'DRED').map(u => u.id)
    }; });
    assert(report.planted.escaping);
    assert(report.planted.ships.includes(1000));
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'V54 Active Naval C4', stepWorld));
    report.final = await page.evaluate(() => { const g = window.__ra2debug.game, u = g.world.getAllObjects().find(u => u.name === 'TANY'); return { tick: g.currentTick, hp: u.healthTrait.getHitPoints(), firstShipPresent: g.world.getAllObjects().some(u => u.id === 1000) }; });
    assert(!report.final.firstShipPresent);
    assert.equal(report.final.hp, report.planted.hp);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_ACTIVE_NAVAL_FUSE_RETREAT_FULL_PROCESS_RESTART_EXACT_CONTINUATION';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close().catch(() => { });
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
