import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Intentional original Soviet 06 failure branch: ordinary boarding and movement, friendly force-attacks sink the loaded transports and Hydrofoils, then original American ASW destroys the remaining submarines. No resign, assigned result, source/rule/trigger/health/ownership or RNG edit. This is a failure test, not a story victory.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const g = await page.evaluate(() => { const g = window.__ra2debug.game, c = g.campaign;
        return { tick: g.currentTick, hash: g.getHash(), result: c.result, failure: c.failure,
            failureFired: c.machine.states.get('0907B050').fired,
            owned: g.localPlayer.getOwnedObjects(true).filter(unit => !unit.isDestroyed).map(unit => ({ id: unit.id, name: unit.name,
                spawned: unit.isSpawned, tile: unit.tile && [unit.tile.rx, unit.tile.ry], health: unit.healthTrait?.health,
                passengers: unit.transportTrait?.units.map(unit => unit.id) })),
            defeat: c.trace.filter(action => action.opcode === 2) };
    });
    const state = { label, ...g }; report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov06t.map'));
    await waitWorld(page, 'sov06t.map'); await stepWorld(page, 960);
    const commands = new OrdinaryCampaignCommands(page, report);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    const initial = await inspect('original-landed-force');
    const boats = initial.owned.filter(unit => unit.name === 'SAPC'); assert.equal(boats.length, 2);
    await commands.order(['E2', 'SHK'], 17, boats[0].id);
    await commands.order(['SMCV', 'DOG'], 17, boats[1].id);
    let state;
    for (let i = 0; i < 12; i++) {
        await stepWorld(page, 120); state = await inspect('ordinary-reboarding-' + i);
        if (!state.owned.some(unit => ['E2', 'SHK', 'SMCV', 'DOG'].includes(unit.name) && unit.spawned)) break;
    }
    assert(!state.owned.some(unit => ['E2', 'SHK', 'SMCV', 'DOG'].includes(unit.name) && unit.spawned));
    await commands.order(['SAPC', 'HYD'], 0, undefined, [184, 93]); await stepWorld(page, 600);
    for (const target of [...boats, ...initial.owned.filter(unit => unit.name === 'HYD')]) {
        await commands.order(['SUB'], 3, target.id);
        for (let i = 0; i < 16; i++) {
            await stepWorld(page, 120); state = await inspect('ordinary-friendly-sinking-' + target.id + '-' + i);
            if (!state.owned.some(unit => unit.id === target.id)) break;
        }
        assert(!state.owned.some(unit => unit.id === target.id), 'Ordinary force-attack must really sink the target');
    }
    await commands.order(['SUB'], 0, undefined, [80, 116]);
    for (let i = 0; i < 120 && !state.result; i++) {
        await stepWorld(page, 120); state = await inspect('original-american-asw-' + i);
    }
    assert.equal(state.result, 'defeat'); assert(state.failureFired > 0 && state.defeat.length);
    report.final = state;
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands)));
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'native-original-soviet06-source-failure.png') });
    report.score = await page.locator('body').innerText();
    await page.getByRole('button', { name: labels['hd:campaignretrymission'], exact: true }).click();
    if (process.argv.includes('--unavailable')) {
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        assert.equal(await page.locator('[data-campaign-mission="sov06t.map"]').getAttribute('data-playable'), 'false');
        report.retry = { unavailableReturn: true };
    } else {
        await page.waitForSelector('[data-campaign-media=s06_f00e] video');
        await page.locator('[data-campaign-media=s06_f00e] button').click(); await waitWorld(page, 'sov06t.map');
        report.retry = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            launch: window.__ra2debug.game.campaign.launch, result: window.__ra2debug.game.campaign.result }));
        assert(report.retry.tick < 20 && !report.retry.result); assert.equal(report.retry.launch.difficulty, 'normal');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET06_PLAYER_FORCE_FAILURE_AND_RETURN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
