import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const [outArg, sourceArg, prefix, unitName, attackers, failureTrigger] = process.argv.slice(2);
assert(unitName && attackers && failureTrigger);
const out = path.resolve(outArg), directory = path.resolve(sourceArg);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Original mission-specific required-object loss. A fresh source world re-executes recorded ordinary orders, then normal force-attack deliberately destroys the required source object. Its real destruction, original trigger/delays and complete defeat score must execute. No source, rule, health, objective, ownership, result or post-creation RNG edit. This is an intentional failure probe, not a strategy or goal proof.' };
let app, page, journal;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, prefix);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    const commands = new OrdinaryCampaignCommands(page, report);
    const unit = await page.evaluate(name => window.__ra2debug.game.world.getAllObjects()
        .filter(object => object.name === name && !object.isDestroyed && object.isSpawned)
        .map(object => ({ id: object.id, name: object.name, health: object.healthTrait.health, tag: object.tag,
            owner: object.owner.name, kind: object.isBuilding() ? 'building' : 'unit' }))[0], unitName);
    assert(unit?.health > 0); report.target = unit;
    await commands.order(attackers.split(','), 3, unit.id);
    let state;
    for (let i = 0; i < 40; i++) { state = await stepWorld(page, 120); if (state.result) break; }
    assert.equal(state.result, 'defeat', JSON.stringify(state));
    report.samples.push(await commands.inspect(`original-required-${unit.kind}-loss-source-failure`));
    report.failure = await page.evaluate(({ id, trigger }) => { const g = window.__ra2debug.game, c = g.campaign;
        const remaining = g.world.getAllObjects().find(object => object.id === id && !object.isDestroyed);
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, requiredUnitSurvives: !!remaining,
            requiredTrigger: { id: trigger, state: c.machine.states.get(trigger) },
            sourceLoss: c.trace.filter(action => action.opcode === 2) };
    }, { id: unit.id, trigger: failureTrigger });
    assert.equal(report.failure.requiredUnitSurvives, false);
    assert(report.failure.requiredTrigger.state.fired > 0); assert(report.failure.sourceLoss.length > 0);
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'native-original-required-unit-loss-score.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = `PASS_NATIVE_ORIGINAL_REQUIRED_${unit.kind.toUpperCase()}_DESTRUCTION_FAILURE_AND_COMPLETE_SCORE`;
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, failure: report.failure, error: report.error, out }));
