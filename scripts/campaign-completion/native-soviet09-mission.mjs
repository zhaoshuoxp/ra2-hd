import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert.equal(source.identity.launch.mission, 'sov09u.map');
assert.equal(source.identity.launch.semanticsVersion, 11); assert.equal(source.result.result, 'victory');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Fresh original Soviet 09 re-executes recorded ordinary player production, movement, combat, capture, infiltration and mind control. A real psychic-control/power-blackout save survives full app restart with exact state and continuation, then reaches full-health President control and complete original victory score. No hidden initial save, altered source/rule/trigger/health/ownership/objective or post-creation RNG edit. HD, failure and public routes have separate evidence.' };
let app, page, labels, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await new OrdinaryCampaignCommands(page, report).inspect(label);
    report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'r12-original-blackout-before-central-guard-orders');
    const tick = report.replay.tick, batch = source.appliedCommands.filter(command => command.tick === tick);
    assert(batch.length && !source.appliedCommands.some(command => command.tick > tick && command.tick <= tick + 181));
    await page.evaluate(batch => { const d = window.__ra2debug, g = d.game;
        for (const command of batch) {
            const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
            action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
        }
        g.update();
    }, batch);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    await inspect('real-psychic-control-before-save');
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 09 psychic control and power blackout'));
    await inspect('real-psychic-control-after-full-restart');
    report.continuation = await continueRecordedSource(page, source, 'r12-real-president-mind-control-goal');
    const state = await inspect('final'); assert.equal(state.result, 'victory');
    assert.equal(state.tick, source.result.tick); assert.equal(state.hash, source.result.hash);
    report.goal = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        const president = g.world.getAllObjects().find(unit => unit.name === 'PRES' && !unit.isDestroyed);
        return { president: president && { owner: president.owner.name, health: president.healthTrait.health,
                controller: president.mindControllableTrait.getController()?.id },
            states: ['0873BB5C', '086A4CCC', '07A7507C', '092CBF3C'].map(id => ({ id, fired: c.machine.states.get(id).fired })),
            originalActions: c.trace.filter(action => ['0873BB5C', '086A4CCC'].includes(action.key)),
            sourceQuirks: c.sourceQuirks };
    });
    assert.equal(report.goal.president?.owner, 'Africans'); assert.equal(report.goal.president?.health, 100);
    assert.equal(report.goal.president?.controller, 847);
    assert(report.goal.states[0].fired > 0 && report.goal.states[3].fired > 0);
    assert(report.goal.states.slice(1, 3).every(state => state.fired === 0));
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText(); report.result = { tick: state.tick, hash: state.hash, result: state.result };
    await page.screenshot({ path: path.join(out, 'native-original-soviet09-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET09_PRESIDENT_CONTROL_GOAL_AND_FULL_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
