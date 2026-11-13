import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused, namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';

const out = path.resolve(process.argv[2]), source = path.resolve(process.argv[3]);
const checkpoint = JSON.parse(await fs.readFile(source));
assert.equal(checkpoint.identity.edition, 'yr'); assert(checkpoint.options.campaign.semanticsVersion >= 31);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], source,
    scope: 'Actual named save/process restart with newly queued legal production and cancellation commands. The source checkpoint is unchanged; this is continuation validation, not mission acceptance.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr' });
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    const commands = new OrdinaryCampaignCommands(session.page, report);
    const queued = await commands.inspect('before-new-pending-input');
    const refund = queued.queues.flatMap(queue => queue.items).find(item => item.name === 'HARV');
    assert(refund && queued.own.some(unit => unit.name === 'NAHAND'));
    await commands.cancel('HARV', refund.quantity); await commands.queue('E2', 2);
    report.before = await worldState(session.page);
    report.pending = await session.page.evaluate(() => window.__ra2debug.actionQueue.getAll()
        .map(action => ({ type: action.actionType, data: [...action.serialize()] })));
    assert.equal(report.pending.length, 2);
    session = await namedSaveRestart(session, out, report, 'YR queued production before the next simulation tick', async (page, ticks) => {
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
        return stepWorld(page, ticks);
    });
    const saved = JSON.parse(await fs.readFile(path.join(out, 'mid-mission-checkpoint.json')));
    assert.equal(saved.tick, checkpoint.tick); assert.equal(saved.pendingCommands.length, report.pending.length);
    assert.deepEqual(saved.pendingCommands.map(({ type, data }) => ({ type, data })), report.pending);
    report.after = await worldState(session.page);
    report.production = await new OrdinaryCampaignCommands(session.page, report).inspect('after-restored-pending-input');
    report.status = 'PASS_NATIVE_YR31_PENDING_INPUT_NAMED_SAVE_EXACT_TICK_PROCESS_RESTART_AND_180_TICK_CONTINUATION';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
