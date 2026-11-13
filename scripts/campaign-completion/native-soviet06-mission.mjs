import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';

const out = path.resolve(process.argv[2]);
const directory = process.argv.find(value => value.startsWith('--replay='))?.slice(9);
assert(directory, 'Provide the retained ordinary-command source report with --replay=');
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert.equal(source.identity.launch.mission, 'sov06t.map');
assert.equal(source.identity.launch.semanticsVersion, 8);
assert.equal(source.result.result, 'victory');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Fresh original Soviet 06 re-executes ordinary recorded player commands, saves during the real harbor assault, fully restarts the application, then continues to the exact original two-fleet goal and complete score. No hidden initial save, altered source/rule/trigger/health/ownership/objective or post-creation RNG edit. Public entry, movie playback and HD acceptance have separate evidence.' };
let app, page, labels, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await new OrdinaryCampaignCommands(page, report).inspect(label);
    report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'fresh-reconstructed-pre-assault-world');
    // Apply the first ordinary command batch before saving. The next batch is
    // 500 ticks later, so the independent 180-tick restart probe omits no input.
    const tick = report.replay.tick;
    const batch = source.appliedCommands.filter(command => command.tick === tick);
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
    await inspect('real-harbor-assault-before-save');
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 06 harbor assault and two-fleet objective'));
    await inspect('real-harbor-assault-after-full-restart');
    report.continuation = await continueRecordedSource(page, source, 'final');
    const state = await inspect('final'); assert.equal(state.result, 'victory');
    assert.equal(state.tick, source.result.tick); assert.equal(state.hash, source.result.hash);
    report.goal = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { events: c.definition.triggers.get('07A8FCA0').events,
            states: ['07A8FCA0', '0B0B04AC'].map(id => ({ id, fired: c.machine.states.get(id).fired })),
            remaining: ['BadGuy1 House', 'KoreanFleet House'].map(name => ({ name,
                naval: c.houses.get(name).getOwnedObjects(true).filter(unit => unit.isUnit() && unit.rules.naval && !unit.isDestroyed).length,
                buildings: c.houses.get(name).getOwnedObjects().filter(unit => unit.isBuilding()).length })) };
    });
    assert(report.goal.states.every(state => state.fired > 0)); assert(report.goal.remaining.every(house => house.naval === 0));
    assert(report.goal.remaining.find(house => house.name === 'BadGuy1 House').buildings > 0);
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText(); report.result = { tick: state.tick, hash: state.hash, result: state.result };
    await page.screenshot({ path: path.join(out, 'native-original-soviet06-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET06_TWO_FLEET_GOAL_AND_FULL_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
