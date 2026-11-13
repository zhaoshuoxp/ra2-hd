import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { installObjectiveDefense } from './objective-defense.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]); await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Intentional original Soviet 07 lab-spied failure. A fresh source world re-executes ordinary opening commands. Normal player sales remove alternative infiltration targets; the protected unsellable lab remains. Dogs move away, while ordinary visible-threat defense protects against armed waves and respects friendly disguises. A real source-paradropped spy must disguise, physically walk in and trigger the original loss. No spy spawn/order injection, altered source/rule/trigger/health/ownership/objective or RNG edit.' };
let app, page, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'original-live-chrono-lock-before-release');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    report.sales = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        window.__actualSpyEntries = [];
        g.events.subscribe(event => { if (event.type === 21) window.__actualSpyEntries.push({ tick: g.currentTick,
            target: event.target.name, targetId: event.target.id, source: event.source.name, owner: event.source.owner.name,
            disguise: event.source.disguiseTrait?.getDisguise()?.rules.name }); });
        const buildings = g.localPlayer.getOwnedObjects().filter(unit => unit.isBuilding() && unit.name !== 'NATECH');
        for (const building of buildings) d.actionsApi.sellBuilding(building.id);
        return buildings.map(building => ({ id: building.id, name: building.name }));
    });
    const commands = new OrdinaryCampaignCommands(page, report);
    installObjectiveDefense(commands, { anchor: 'NATECH', ground: ['APOC', 'E2'], air: [], radius: 22 });
    await commands.order(['DOG'], 0, undefined, [20, 90]);
    let state;
    for (let i = 0; i < 150; i++) {
        try { await commands.step(120); }
        catch (error) { assert.equal(await page.evaluate(() => window.__ra2debug.game.campaign.result), 'defeat', String(error)); }
        state = await commands.inspect('original-spy-approach-' + i); report.samples.push(state); await save();
        if (state.result) break;
    }
    report.final = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        const lab = g.world.getAllObjects().find(unit => unit.name === 'NATECH' && unit.isSpawned);
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure, entries: window.__actualSpyEntries,
            lab: lab && { owner: lab.owner.name, health: lab.healthTrait.health },
            branches: ['096C4DF0', '096C55C0', '0A7F6220'].map(id => ({ id, fired: c.machine.states.get(id).fired })),
            defeat: c.trace.filter(action => action.opcode === 2) };
    });
    const final = report.final; assert(!final.failure); assert.equal(final.result, 'defeat');
    assert(final.entries.some(entry => entry.target === 'NATECH' && entry.source === 'SPY' && entry.owner === 'BadGuy2 House'));
    assert(final.lab?.health > 0); assert.equal(final.lab.owner, 'Player House');
    assert(final.branches.find(branch => branch.id === '096C4DF0').fired > 0);
    assert(final.branches.filter(branch => branch.id !== '096C4DF0').every(branch => branch.fired === 0));
    assert(final.defeat.some(action => action.key === '096C4DF0'));
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'native-original-soviet07-lab-spied-failure.png') });
    report.score = await page.locator('body').innerText();
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_ACTUAL_LAB_INFILTRATION_FAILURE_AND_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
