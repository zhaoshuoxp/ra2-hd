import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';
import { completeSourceResultFlow } from './complete-source-result-flow.mjs';

const out = path.resolve(process.argv[2]), source = path.resolve(process.argv[3]);
const checkpoint = JSON.parse(await fs.readFile(source));
assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, 'sov02smd.map');
assert(!checkpoint.trainer);
const observeMedia = process.argv.includes('--observe-media');
const fleetSize = Number(process.argv.find(value => value.startsWith('--fleet='))?.slice(8) ?? 8);
assert(Number.isInteger(fleetSize) && fleetSize >= 1 && fleetSize <= 12);
const assemblyTile = process.argv.includes('--hold-under-flak') ? [107, 17] : [97, 32];
const customRoute = process.argv.find(value => value.startsWith('--route='))?.slice(8);
const skipFlight = process.argv.includes('--skip-flight');
assert(!skipFlight || process.argv.includes('--advance-only'));
const flightRoute = skipFlight ? [] : customRoute ? JSON.parse(customRoute) : [[70, 85], [65, 125], [70, 152]];
assert(Array.isArray(flightRoute) && flightRoute.length >= (skipFlight ? 0 : 1) && flightRoute.length <= 12);
assert(flightRoute.every(tile => Array.isArray(tile) && tile.length === 2 && tile.every(Number.isInteger)));
const goalOrder = (process.argv.find(value => value.startsWith('--goals='))?.slice(8) ?? 'CALAB,GACSPH').split(',');
assert.deepEqual([...goalOrder].sort(), ['CALAB', 'GACSPH']);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], source,
    fleetSize, assemblyTile, flightRoute, goalOrder,
    assistance: 'Exact original checkpoint continuation with ordinary paid Kirov production, visible-target attacks and player-issued flight routes. No source, rules, actors, tasks, health, RNG or results are edited.' };
let session, commands, stopMedia, retainedJournal = false;
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state);
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); return state;
}
async function save(name) {
    const value = await session.page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    await fs.writeFile(path.join(out, name), JSON.stringify(value) + '\n');
}
async function retainJournal() {
    const value = await session.page.evaluate(() => { const g = window.__ra2debug.game; return {
        gameId: g.id, timestamp: g.startTimestamp, tick: g.currentTick,
        launch: g.campaign.launch, commands: g.campaign.journal.commands }; });
    await fs.writeFile(path.join(out, 'applied-source-journal.json'), JSON.stringify(value) + '\n', { flag: 'wx' });
    retainedJournal = true;
}
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    if (observeMedia) stopMedia = await observeMissionMedia(session.page);
    await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
    await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    const restored = await worldState(session.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    report.launch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.launch.semanticsVersion, checkpoint.options.campaign.semanticsVersion);
    assert.equal(report.launch.difficulty, checkpoint.options.campaign.difficulty);
    if (observeMedia) assert.equal(report.launch.semanticsVersion, 45);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    await watchNativeEvaluation(session, out, report);
    commands = new OrdinaryCampaignCommands(session.page, report);
    commands.groundDefenders = ['HTNK', 'APOC', 'V3', 'E2', 'SHK', 'DRON'];
    commands.airDefenders = ['APOC', 'HTK', 'FLAKT'];
    let state = await inspect('exact-original-base-checkpoint');
    if (!process.argv.includes('--advance-only')) {
        const pending = state.queues.flatMap(queue => queue.items).find(item => item.name === 'APOC');
        if (pending) await commands.cancel('APOC', pending.quantity);
        if (process.argv.includes('--reinforce-base')) {
            if (!state.own.some(unit => unit.name === 'NAHAND')) {
                await commands.build('NAHAND', [102, 16]); state = await inspect('ordinary-paid-barracks-rebuilt');
            }
            for (const [name, near] of [['NAPOWR', [102, 14]], ['NAFLAK', [105, 24]], ['NAREFN', [107, 14]]]) {
                await commands.build(name, near); state = await inspect('ordinary-paid-base-reinforcement-' + name);
            }
            await save('ordinary-reinforced-base-checkpoint.json');
        }
        await commands.order(['NAWEAP'], 0, undefined, [112, 32]);
        await commands.order(['V3'], 0, undefined, [103, 26]);
        await commands.queue('ZEP', fleetSize);
        for (let i = 0; i < 180; i++) {
            await commands.order(['ZEP'], 0, undefined, assemblyTile);
            await commands.step(180); state = await inspect('ordinary-paid-kirov-assembly-' + i);
            if (state.own.filter(unit => unit.name === 'ZEP').length >= fleetSize) break;
            assert(state.own.some(unit => unit.name === 'NAWEAP'), 'Original combat destroyed the ordinary factory');
        }
        assert(state.own.filter(unit => unit.name === 'ZEP').length >= fleetSize, 'Ordinary Kirov production did not complete');
        await save('ordinary-kirov-checkpoint.json');
    }
    report.departure = { tick: state.tick, productionSkipped: process.argv.includes('--advance-only'),
        bombers: state.own.filter(unit => unit.name === 'ZEP') };
    for (const tile of flightRoute) {
        await commands.order(['ZEP'], 0, undefined, tile);
        for (let i = 0; i < 90; i++) {
            await commands.step(90); state = await inspect('ordinary-flight-' + tile.join('-') + '-' + i);
            const fleet = state.own.filter(unit => unit.name === 'ZEP');
            assert(fleet.length, 'The ordinary bomber fleet was lost');
            if (fleet.every(unit => Math.hypot(unit.tile[0] - tile[0], unit.tile[1] - tile[1]) < 7)) break;
        }
        await save('last-flight-checkpoint.json');
    }
    for (const name of goalOrder) {
        let target;
        for (let i = 0; i < 180; i++) {
            const visible = await session.page.evaluate(name => {
                const g = window.__ra2debug.game, unit = g.world.getAllObjects()
                    .find(unit => unit.name === name && unit.isSpawned && !unit.isDestroyed);
                if (!unit) return { remaining: false };
                return { remaining: true, id: unit.id,
                    visible: !g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(unit.tile, unit.tileElevation),
                    tile: [unit.tile.rx, unit.tile.ry] };
            }, name);
            if (!visible.remaining) break;
            if (visible.visible && visible.id !== target) {
                await commands.order(['ZEP'], 2, visible.id); target = visible.id;
            } else if (!visible.visible && i % 10 === 0) await commands.order(['ZEP'], 0, undefined, visible.tile);
            await commands.step(90); state = await inspect('original-bomber-objective-' + name + '-' + i);
            if (state.result) break;
            assert(state.own.some(unit => unit.name === 'ZEP'), 'The ordinary bomber fleet was lost');
        }
        assert(!state.houses.some(h => h.objects.some(unit => unit.name === name)), 'Original objective remains: ' + name);
    }
    for (let i = 0; i < 20 && state.result !== 'victory'; i++) {
        await commands.step(90); state = await inspect('original-victory-delay-' + i);
    }
    assert.equal(state.result, 'victory'); report.victory = state;
    report.status = 'PASS_NATIVE_ORIGINAL_NORMAL_SOVIET02_OUTPOSTS_BASE_RESTART_KIROV_OBJECTIVES_AND_VICTORY';
    await save('original-victory-checkpoint.json');
    await retainJournal();
    await session.page.screenshot({ path: path.join(out, 'native-original-victory.png') });
    if (observeMedia) {
        await completeSourceResultFlow(session.page, out, report);
        report.status = 'PASS_NATIVE_CURRENT_SOVIET02_RESTORED_SOURCE_PAID_KIROV_OBJECTIVES_VICTORY_AND_SCORE';
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    if (stopMedia) await stopMedia().then(value => { report.missionMedia = value; }).catch(error => {
        report.status = 'FAIL'; report.mediaObserverError = error.stack; process.exitCode = 1;
    });
    if (commands) report.finalWorld = await commands.inspect('final-original-observation').catch(() => undefined);
    if (session?.page) {
        if (!report.finalWorld?.result) await save('last-trusted-checkpoint.json').catch(() => {});
        if (!retainedJournal) await retainJournal().catch(() => {});
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
