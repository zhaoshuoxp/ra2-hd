import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all12-source-commands-v26.json'));
source.samples = [];
const report = {
    status: 'RUNNING', errors: [], failedResources: [], scope: 'Unchanged original Allied12 creation seed and ordinary recorded opening. Save during the actual first AI attack departure hold, restart the app and verify exact continued world/RNG/teams/deadline. No source, rules, troop, health, result or RNG edits.'
};
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    report.start = await replayFeedbackOpening(page, source, 0, { openingGraceVersion: 1 });
    for (let tick = 30; tick <= 7500; tick += 30) {
        await advanceFeedbackSource(page, tick);
        const state = await page.evaluate(() => { const g = window.__ra2debug.game; return {
            tick: g.currentTick, ai: g.campaign.teams.sourceAi.snapshot(), teams: [...g.campaign.teams.instances.values()].filter(t => t.openingAttackUntil > g.currentTick).map(t => ({ id: t.id, type: t.type, until: t.openingAttackUntil, line: t.line, phase: t.phase }))
        }; });
        if (state.teams.length) {
            report.hold = state;
            break;
        }
    }
    assert(report.hold, 'No actual ready attack hold occurred');
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'V54 Finale Attack Hold', stepWorld, async ({ page }, checkpoint) => { assert.equal(checkpoint.options.campaign.openingGraceVersion, 1); report.restoredHold = await page.evaluate(() => { const g = window.__ra2debug.game; return { tick: g.currentTick, ai: g.campaign.teams.sourceAi.snapshot() }; }); }));
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_FINALE_ATTACK_HOLD_FULL_PROCESS_SAVE_RESTART_AND_EXACT_CONTINUATION';
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
