import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { replaySourcePrefix } from './replay-source.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    scope: 'Fresh original Soviet 04, ordinary paid production, legal placement, shroud-respecting combat and accelerated native turns. Source map/rules/triggers/objectives, health and RNG remain intact. No forced victory or hidden save initializes the mission. Presentation and HD coverage are qualified separately.' };
const replayDirectory = process.argv.find(value => value.startsWith('--replay='))?.slice(9);
const prefixLabel = process.argv.find(value => value.startsWith('--prefix='))?.slice(9) ?? 'ordinary-army-assembly-36';
let app, page, labels, commands, appliedJournal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state); await save();
    assert(!state.failure, state.failure); return state;
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    if (replayDirectory) {
        const source = JSON.parse(await fs.readFile(path.resolve(replayDirectory, 'report.json')));
        source.appliedCommands = JSON.parse(await fs.readFile(path.resolve(replayDirectory, 'applied-command-journal.json')));
        source.identity.launch ??= source.identity.source; source.difficulty = source.identity.launch.difficulty;
        report.replay = await replaySourcePrefix(page, source, prefixLabel);
    } else {
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'));
        await waitWorld(page, 'sov04s.map');
    }
    commands = new OrdinaryCampaignCommands(page, report);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, options: g.gameOpts, launch: g.campaign.launch }; });
    let state;
    if (!replayDirectory) {
    await inspect('fresh-original-world');
    await commands.queue('SUB', 3);
    await commands.order(['SMCV'], 9); await commands.step(150);
    assert((await inspect('ordinary-deployment')).own.some(unit => unit.name === 'NACNST'));
    await commands.build('NAREFN'); await commands.build('NAHAND'); await commands.queue('E2', 10);
    await commands.build('NAPOWR'); await commands.build('NAWEAP', [64, 142]);
    await commands.queue('HTNK', 6); await commands.queue('HTK', 4);
    await commands.build('NAFLAK'); await commands.build('NAREFN'); await commands.build('NAPOWR');
    await commands.build('NARADR'); await commands.build('NAFLAK');
    await commands.build('NALASR', [65, 133]); await commands.build('NALASR', [61, 134]); await commands.build('NAPOWR');
    await commands.queue('V3', 4); await commands.queue('SUB', 3); await commands.queue('HYD', 4); await commands.queue('DRON', 3);
    await inspect('ordinary-defense-and-production'); await page.screenshot({ path: path.join(out, 'native-defense-base.png') });
    for (let i = 0; i < 55; i++) {
        await commands.step(450); state = await inspect('original-landings-and-base-' + i);
        if (state.baseTrace.filter(entry => entry.phase === 'placed' && entry.house === 'BadGuy1 House').length >= 8) break;
        assert(state.tick < 30000, 'Original Allied deployment/base production did not progress');
    }
    assert(state.baseTrace.some(entry => entry.type === 'GAREFN' && entry.phase === 'placed'), 'Source landing base must build normally');
    await page.screenshot({ path: path.join(out, 'native-original-landing-base-phase.png') });
    await commands.queue('HTK', 4);
    for (let i = 0; i < 120; i++) {
        await commands.step(300); state = await inspect('ordinary-army-assembly-' + i);
        if (i % 6 === 0 && state.credits > 1500) for (const [name, desired] of [['HTK', 4], ['HTNK', 8], ['V3', 4]]) {
            const live = state.own.filter(unit => unit.name === name).length;
            const pending = state.queues.flatMap(queue => queue.items).filter(item => item.name === name)
                .reduce((sum, item) => sum + item.quantity, 0);
            if (live + pending < desired) await commands.queue(name, desired - live - pending);
        }
        if (state.own.filter(unit => unit.name === 'HTNK').length >= 5 && state.own.filter(unit => unit.name === 'V3').length >= 4
            && state.own.filter(unit => unit.name === 'HTK').length >= 3) break;
    }
    assert(state.own.filter(unit => unit.name === 'V3').length >= 4, 'The ordinary assault requires its produced artillery before advancing');
    } else await inspect('replayed-source-army-assembly');
    const preSave = await inspect('ordinary-pre-save-army');
    const pendingTanks = preSave.queues.flatMap(queue => queue.items).filter(item => item.name === 'HTNK')
        .reduce((sum, item) => sum + item.quantity, 0);
    const missingTanks = 8 - pendingTanks - preSave.own.filter(unit => unit.name === 'HTNK').length;
    if (missingTanks > 0) await commands.queue('HTNK', missingTanks);
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report, 'Original Soviet 04 landing and base construction'));
    commands = new OrdinaryCampaignCommands(page, report);
    state = await inspect('restored-source-army-assembly');
    await commands.build('NADEPT');
    const depot = await page.evaluate(() => [...window.__ra2debug.game.localPlayer.buildings].find(unit => unit.name === 'NADEPT').id);
    await commands.order(['HTNK'], 15, depot);
    await commands.queue('HARV', 2);
    for (let i = 0; i < 35; i++) {
        await commands.step(180); state = await inspect('ordinary-service-depot-' + i);
        if (state.own.filter(unit => unit.name === 'HTNK' && unit.health >= 95).length >= 8) break;
    }
    const army = ['HTNK', 'HTK', 'V3', 'DRON'];
    for (const waypoint of [[80, 122], [90, 103], [100, 80], [100, 65]]) {
        await commands.order(army, 4, undefined, waypoint); await commands.step(900);
        await inspect('ordinary-ground-advance-' + waypoint.join('-'));
    }
    await commands.order(['V3'], 0, undefined, [103, 61]);
    await commands.order(['SUB', 'HYD'], 4, undefined, [123, 125]);
    for (let i = 0; i < 200 && state.result !== 'victory'; i++) {
        const artillery = await commands.attackVisible(['V3'], 'BadGuy1 House', 'buildings');
        const ground = await commands.attackVisible(['HTNK', 'DRON'], 'BadGuy1 House', 'ground');
        const air = await commands.attackVisible(['HTK'], 'BadGuy1 House', 'air');
        if (!air) {
            const leader = state.own.find(unit => unit.name === 'V3');
            if (leader) await commands.order(['HTK'], 5, leader.id);
        }
        const navy = await commands.attackVisible(['SUB', 'HYD'], 'BadGuy1 House');
        if (!ground && !artillery && i % 6 === 0) await commands.order(army, 4, undefined, [110, 35]);
        if (!navy && i % 8 === 0) await commands.order(['SUB', 'HYD'], 4, undefined, [128, 38]);
        await commands.step(240); state = await inspect('original-objective-combat-' + i);
        if (i % 12 === 0 && state.credits > 4500) {
            if (state.own.filter(unit => unit.name === 'HTNK').length < 8) await commands.queue('HTNK', 4);
            if (state.own.filter(unit => unit.name === 'V3').length < 4) await commands.queue('V3', 2);
            if (state.own.filter(unit => unit.name === 'HTK').length < 4) await commands.queue('HTK', 2);
        }
    }
    assert.equal(state.result, 'victory', 'Original source objective did not complete');
    assert(await page.evaluate(() => window.__ra2debug.game.campaign.machine.states.get('09506090').fired > 0));
    assert(state.sourceTrace.some(entry => entry.key === '0A6E825C'));
    appliedJournal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(false));
    await page.waitForSelector('[data-campaign-score]', { timeout: 120000 });
    await page.waitForSelector('[data-score-phase=complete]', { timeout: 30000 });
    report.result = { tick: state.tick, hash: state.hash, body: await page.locator('body').innerText() };
    await page.screenshot({ path: path.join(out, 'native-original-soviet04-victory.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_OBJECTIVE_CHAIN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (commands) report.failureState = await commands.inspect('failure-state').catch(error => ({ inspectionError: String(error) }));
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
    if (page && !appliedJournal) appliedJournal = await page.evaluate(() => window.__ra2debug.game?.campaign?.journal.commands).catch(() => undefined);
    if (appliedJournal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(appliedJournal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
