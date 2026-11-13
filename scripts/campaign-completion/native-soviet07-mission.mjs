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
assert.equal(source.identity.launch.mission, 'sov07s.map');
assert.equal(source.identity.launch.semanticsVersion, 9); assert.equal(source.result.result, 'victory');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Fresh original Soviet 07 re-executes ordinary recorded production, movement, combat and paid repairs. A real late-battle named save survives full application restart, then reaches the same original final-wave/enemy-unit goal and complete score. No hidden initial save, altered source/rule/trigger/health/ownership/objective or post-creation RNG edit. HD and public routes have separate evidence.' };
let app, page, labels, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await new OrdinaryCampaignCommands(page, report).inspect(label);
    report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'original-prism-wave-held-with-static-sectors');
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
    await inspect('real-defense-before-save');
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 07 late defense and final chrono wave'));
    await inspect('real-defense-after-full-restart');
    report.continuation = await continueRecordedSource(page, source, 'final');
    const state = await inspect('final'); assert.equal(state.result, 'victory');
    assert.equal(state.tick, source.result.tick); assert.equal(state.hash, source.result.hash);
    report.goal = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        const lab = c.houses.get('Player House').getOwnedObjects().find(unit => unit.name === 'NATECH');
        return { lab: lab && { owner: lab.owner.name, health: lab.healthTrait.health },
            states: ['08E14EC0', '096512B0', '0A7F7830', '0C11377C', '096C4DF0', '096C55C0', '0A7F6220']
                .map(id => ({ id, fired: c.machine.states.get(id).fired })),
            remainingUnits: c.houses.get('BadGuy1 House').getOwnedObjects(true)
                .filter(unit => unit.isUnit() && !unit.isDestroyed && !unit.rules.insignificant).map(unit => unit.id) };
    });
    assert(report.goal.lab?.health > 0); assert.equal(report.goal.lab.owner, 'Player House');
    assert(report.goal.states.slice(0, 4).every(state => state.fired > 0));
    assert(report.goal.states.slice(4).every(state => state.fired === 0)); assert.deepEqual(report.goal.remainingUnits, []);
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=victory][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText(); report.result = { tick: state.tick, hash: state.hash, result: state.result };
    await page.screenshot({ path: path.join(out, 'native-original-soviet07-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_FINAL_WAVE_GOAL_AND_FULL_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
