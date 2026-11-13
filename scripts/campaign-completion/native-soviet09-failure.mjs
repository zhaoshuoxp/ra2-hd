import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert.equal(source.identity.launch.mission, 'sov09u.map');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Intentional original President first-damage failure. The genuinely controlled original sniper fires an ordinary force-attack at the full-health original President. The real lethal hit must dispatch original first-damage event 41 and final defeat. No assigned result, source/rule/trigger/health/ownership or RNG edit. Nonlethal first-damage boundaries have separate focused tests.' };
let app, page, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'r12-original-central-guard-clearance');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    await page.evaluate(() => { const g = window.__ra2debug.game; window.__presidentDamage = [];
        g.events.subscribe(event => {
            if (event.target?.name === 'PRES' && [3, 12, 28].includes(event.type)) window.__presidentDamage.push({
                tick: g.currentTick, type: event.type, previous: event.prevHealth ?? event.previousHealth,
                health: event.target.healthTrait.health, attacker: (event.attacker ?? event.attackerInfo)?.obj?.name });
        });
    });
    const commands = new OrdinaryCampaignCommands(page, report);
    const before = await commands.inspect('before-real-president-shot'); report.samples.push(before);
    const president = before.houses.flatMap(house => house.objects).find(unit => unit.name === 'PRES');
    assert(president && president.health === 100 && president.owner === 'French');
    await commands.order(['SNIPE'], 3, president.id);
    try { await commands.step(360, { defend: false }); }
    catch (error) { assert.equal(await page.evaluate(() => window.__ra2debug.game.campaign.result), 'defeat', String(error)); }
    const final = await commands.inspect('original-president-first-damage-defeat'); report.samples.push(final);
    assert(!final.failure); assert.equal(final.result, 'defeat');
    report.branches = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { damage: window.__presidentDamage, states: ['0873BB5C', '086A4CCC', '07A7507C']
                .map(id => ({ id, fired: c.machine.states.get(id).fired })),
            actions: c.trace.filter(action => ['0873BB5C', '086A4CCC'].includes(action.key)) };
    });
    assert(report.branches.damage.some(event => event.type === 28 && event.previous === 100 && event.health < 100));
    assert(report.branches.states.find(state => state.id === '086A4CCC').fired > 0);
    assert.equal(report.branches.states.find(state => state.id === '07A7507C').fired, 0);
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    report.result = { tick: final.tick, hash: final.hash, result: final.result };
    await page.evaluate(() => { const manager = window.__ra2debug.gameScreen.gameTurnMgr;
        manager.setCampaignPaused(false); manager.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'native-original-soviet09-president-shot-defeat.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET09_PRESIDENT_FIRST_DAMAGE_FAILURE_AND_COMPLETE_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
