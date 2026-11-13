import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const [outArg, mission, difficulty = 'normal'] = process.argv.slice(2), out = path.resolve(outArg);
const moveTo = process.argv.find(value => value.startsWith('--move-to='))?.slice(10).split(',').map(Number);
const moveActors = process.argv.find(value => value.startsWith('--actors='))?.slice(9).split(',');
const survivingHouse = process.argv.find(value => value.startsWith('--surviving-house='))?.slice(18);
assert(!moveTo || moveTo.length === 2 && moveTo.every(Number.isInteger) && moveActors?.length);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], mission, difficulty,
    scope: 'Fresh original mission, natural source enemy combat and NO human commands. The original failure trigger must execute and reach complete defeat score. No force-result, altered map/rule/health/objective or post-creation RNG edit. This is a failure-branch check, not a successful strategy.' };
let app, page, labels, journal;
if (moveTo) report.scope = 'Fresh original mission and deliberate ordinary movement into original enemy defenses after the source input unlock. Actual enemy combat must destroy the original player house and execute its original failure trigger. No force-result, altered map/rule/health/objective or post-creation RNG edit. Assisted negative-branch evidence, not a zero-command opening or successful strategy.';
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(({ mission, difficulty }) => { const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = difficulty; return screen.launchPrepared(mission); }, { mission, difficulty });
    await waitWorld(page, mission);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    const commands = new OrdinaryCampaignCommands(page, report);
    report.samples.push(await commands.inspect('fresh-original-world'));
    if (moveTo) {
        for (let ticks = 0; await page.evaluate(() => window.__ra2debug.game.campaign.inputLocked); ticks += 30) {
            assert(ticks < 3000, 'The original source did not release input'); await stepWorld(page, 30);
        }
        await commands.order(moveActors, 0, undefined, moveTo);
        report.samples.push(await commands.inspect('ordinary-move-into-source-defenses'));
    }
    let state;
    for (let ticks = 0; ticks < 30000; ticks += 600) {
        state = await stepWorld(page, 600); if (state.result) break;
    }
    assert.equal(state.result, 'defeat', JSON.stringify(state));
    report.samples.push(await commands.inspect(moveTo ? 'original-assisted-source-failure' : 'original-natural-source-failure'));
    report.failure = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, journalCommands: c.journal.commands.length,
            goalActions: [...c.definition.triggers.values()].filter(trigger => trigger.actions.some(action => action.opcode === 2))
                .map(trigger => ({ id: trigger.id, fired: c.machine.states.get(trigger.id).fired, actions: trigger.actions })),
            sourceChrono: c.trace.filter(action => action.opcode === 107) };
    });
    assert(report.failure.goalActions.some(trigger => trigger.fired > 0));
    if (moveTo) assert(report.failure.journalCommands > 0); else assert.equal(report.failure.journalCommands, 0);
    if (survivingHouse) {
        report.survivingControlledHouse = await page.evaluate(name => {
            const g = window.__ra2debug.game, owner = g.campaign.houses.get(name);
            return { name, controlled: g.localPlayer.campaignControlledPlayers.includes(owner),
                objects: owner.getOwnedObjects().filter(object => object.isSpawned && !object.isDestroyed)
                    .map(object => ({ id: object.id, name: object.name })) };
        }, survivingHouse);
        assert(report.survivingControlledHouse.controlled && report.survivingControlledHouse.objects.length > 0);
    }
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    assert.equal(await page.locator('[data-campaign-media=s13_f01e]').count(), 0);
    await page.screenshot({ path: path.join(out, 'native-original-natural-defeat.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = moveTo ? 'PASS_NATIVE_ORIGINAL_ASSISTED_COMBAT_FAILURE_AND_COMPLETE_DEFEAT_SCORE'
        : 'PASS_NATIVE_ORIGINAL_NATURAL_COMBAT_FAILURE_AND_COMPLETE_DEFEAT_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
