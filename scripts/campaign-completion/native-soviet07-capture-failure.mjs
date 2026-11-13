import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]), directory = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Intentional original lab-capture failure. Replay ordinary completed sales and movement, clear sale crews, then allow the real source-controlled engineers to enter the unsellable lab. Ordinary paid repairs and visible-spy force-attacks prevent already-tested alternative losses. Spy identification uses read-only test state, including friendly disguises; this is not a player-style disguise-detection or victory proof. No enemy spawn/order injection, source/rule/health/ownership/objective or RNG edit.' };
let app, page, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, 'ordinary-sales-and-clear-lab-entry');
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    await page.evaluate(() => { const g = window.__ra2debug.game; window.__actualCaptureEntries = [];
        g.events.subscribe(event => { if (event.target?.name === 'NATECH' && event.source?.rules.engineer) {
            window.__actualCaptureEntries.push({ tick: g.currentTick, type: event.type, source: event.source.name,
                owner: event.source.owner.name, target: event.target.id });
        } });
    });
    const commands = new OrdinaryCampaignCommands(page, report);
    await commands.order(['E2', 'SHK', 'DOG', 'ENGINEER'], 0, undefined, [96, 92]);
    await commands.order([1941], 0, undefined, [78, 64]); await commands.order([2039], 0, undefined, [73, 65]);
    let retreated = false;
    for (let i = 0; i < 240; i++) {
        const state = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
            const lab = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'NATECH');
            if (lab?.healthTrait.health < 90) {
                const repair = lab.traits.getAll().find(trait => 'healLeftover' in trait && typeof trait.isDisabled === 'function');
                if (repair?.isDisabled()) d.actionsApi.toggleRepairWrench(lab.id);
            }
            const spies = g.world.getAllObjects().filter(unit => unit.name === 'SPY' && unit.isSpawned && !unit.isDestroyed);
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            return { tick: g.currentTick, result: g.campaign.result, spies: spies.length,
                visible: spies.filter(unit => !shroud.isShrouded(unit.tile, unit.tileElevation))
                    .sort((a, b) => Math.hypot(a.tile.rx - 76, a.tile.ry - 65) - Math.hypot(b.tile.rx - 76, b.tile.ry - 65))
                    .map(unit => unit.id) };
        });
        if (state.result) break;
        if (!retreated && state.tick > 33300 && state.spies === 0) {
            await commands.order([1941, 2039], 0, undefined, [95, 80]); retreated = true;
            report.guardRetreatTick = state.tick;
        } else if (!retreated && state.visible.length) await commands.order([1941, 2039], 3, state.visible[0]);
        try { await commands.step(30, { defend: false }); }
        catch (error) { assert.equal(await page.evaluate(() => window.__ra2debug.game.campaign.result), 'defeat', String(error)); }
        if (i % 20 === 0) { report.samples.push(await commands.inspect('original-capturer-approach-' + i)); await save(); }
    }
    report.final = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        const lab = g.world.getAllObjects().find(unit => unit.name === 'NATECH' && unit.isSpawned);
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure, entries: window.__actualCaptureEntries,
            lab: lab && { owner: lab.owner.name, health: lab.healthTrait.health },
            branches: ['096C4DF0', '096C55C0', '0A7F6220'].map(id => ({ id, fired: c.machine.states.get(id).fired })) };
    });
    const final = report.final; assert(!final.failure); assert.equal(final.result, 'defeat');
    assert(final.lab?.health > 0); assert.equal(final.lab.owner, 'BadGuy1 House');
    assert(final.entries.some(entry => entry.source === 'ENGINEER' && entry.owner === 'BadGuy1 House'));
    assert(final.branches.find(branch => branch.id === '096C55C0').fired > 0);
    assert(final.branches.filter(branch => branch.id !== '096C55C0').every(branch => branch.fired === 0));
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    report.score = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'native-original-soviet07-lab-captured-failure.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_ACTUAL_LAB_CAPTURE_FAILURE_AND_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
