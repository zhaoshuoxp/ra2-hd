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
assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, 'sov03umd.map');
assert(!checkpoint.trainer);
const observeMedia = process.argv.includes('--observe-media');
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [], source,
    assistance: 'Exact real London liberation checkpoint, original source-unlocked Tesla tank production, ordinary paid units and visible-target tactical navigation. No source, rules, actors, health, tasks, RNG or results are edited.' };
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
async function column(goal) {
    const plan = await session.page.evaluate(goal => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        const tanks = own.filter(unit => unit.name === 'TTNK'); if (!tanks.length) return;
        const center = tanks.reduce((p, unit) => [p[0] + unit.tile.rx / tanks.length, p[1] + unit.tile.ry / tanks.length], [0, 0]);
        const distance = unit => Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]);
        const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
            && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
            && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
            && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
        const target = enemies.filter(unit => distance(unit) < (unit.isBuilding() ? 13 : 10) && unit.zone !== 1)
            .sort((a, b) => Number(b.name === 'YAPPET') - Number(a.name === 'YAPPET')
                || Number(a.isBuilding()) - Number(b.isBuilding()) || distance(a) - distance(b))[0];
        const infantry = enemies.filter(unit => unit.isInfantry() && distance(unit) < 10)
            .sort((a, b) => distance(a) - distance(b))[0];
        const fort = enemies.filter(unit => unit.isBuilding() && distance(unit) < 15)
            .sort((a, b) => Number(b.name === 'YAPOWR') - Number(a.name === 'YAPOWR') || distance(a) - distance(b))[0];
        const following = g.map.tiles.getByMapCoords(Math.round(center[0]), Math.round(center[1] + 3));
        return { center, target: target?.id, infantry: infantry?.id, fort: fort?.id,
            following: following && g.map.mapBounds.isWithinPlayerBounds(following) ? [following.rx, following.ry] : undefined,
            distance: Math.hypot(center[0] - goal[0], center[1] - goal[1]) };
    }, goal);
    assert(plan, 'The ordinary Tesla tank column was lost');
    if (plan.target !== undefined) await commands.order(['TTNK'], 2, plan.target);
    else await commands.order(['TTNK'], 4, undefined, goal);
    if (plan.infantry !== undefined) await commands.order(['BORIS', 'TANY', 'E1'], 2, plan.infantry);
    else {
        if (plan.fort !== undefined) await commands.order(['BORIS'], 2, plan.fort);
        else if (plan.following) await commands.order(['BORIS'], 0, undefined, plan.following);
        if (plan.following) await commands.order(['TANY', 'E1', 'HTK', 'FV'], 4, undefined, plan.following);
    }
    return plan;
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
    commands.groundDefenders = ['HTNK', 'MTNK', 'E2', 'SHK'];
    commands.airDefenders = ['FV', 'HTK', 'NASAM'];
    for (let i = 0; i < 30 && await session.page.evaluate(() => window.__ra2debug.game.rules.getObject('TTNK', 7).techLevel > 5); i++) {
        await commands.step(90);
    }
    report.sourceState = await session.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { launch: g.campaign.launch, bounds: g.map.mapBounds.getRawLocalSize(),
            music: window.__ra2debug.music?.getPlaybackState?.(),
            ttank: { tech: g.rules.getObject('TTNK', 7).techLevel, prerequisite: g.rules.getObject('TTNK', 7).prerequisite },
            v3: { tech: g.rules.getObject('V3', 7).techLevel } };
    });
    let state = await inspect('exact-original-liberated-base');
    await commands.order(['GAWEAP'], 0, undefined, [61, 96]);
    await commands.order(['HTNK', 'MTNK', 'FV'], 4, undefined, [62, 94]);
    if (!process.argv.includes('--advance-only')) {
        await commands.queue('TTNK', Math.max(0, 12 - state.own.filter(unit => unit.name === 'TTNK').length));
        for (let i = 0; i < 160; i++) {
            await commands.order(['TTNK'], 0, undefined, [60, 92]);
            await commands.step(180); state = await inspect('ordinary-source-unlocked-tesla-tanks-' + i);
            if (state.own.filter(unit => unit.name === 'TTNK').length >= 12) break;
            assert(state.own.some(unit => unit.name === 'GAWEAP'), 'The liberated factory was lost');
        }
        assert(state.own.filter(unit => unit.name === 'TTNK').length >= 12, 'Ordinary Tesla tank production did not complete');
        await save('ordinary-tesla-column-checkpoint.json');
    }
    for (const goal of [[60, 82], [57, 68], [55, 50], [56, 35], [63, 24]]) {
        for (let i = 0; i < 160 && !state.result; i++) {
            const plan = await column(goal); await commands.step(90);
            if (i % 6 === 0) state = await inspect('original-northern-objectives-' + goal.join('-') + '-' + i);
            if (plan.distance < 5) break;
        }
        state = await inspect('original-northern-stage-' + goal.join('-'));
        if (state.result) break;
        await save('last-northern-checkpoint.json');
    }
    for (let i = 0; i < 250 && state.result !== 'victory'; i++) {
        const target = await commands.attackVisible(['TTNK'], 'YuriCountry', 'buildings');
        if (!target && i % 10 === 0) await commands.order(['TTNK'], 4, undefined, [68, 22]);
        await commands.attackVisible(['TANY', 'BORIS'], 'YuriCountry', 'ground');
        await commands.step(90); if (i % 5 === 0) state = await inspect('original-remaining-yuri-structures-' + i);
    }
    state = await inspect('original-london-result'); assert.equal(state.result, 'victory');
    report.victory = state; report.status = 'PASS_NATIVE_ORIGINAL_SOVIET03_BEACON_LIBERATION_RESTART_TESLA_TANKS_DOMINATOR_AND_VICTORY';
    await save('original-victory-checkpoint.json');
    await retainJournal();
    await session.page.screenshot({ path: path.join(out, 'native-original-victory.png') });
    if (observeMedia) {
        await completeSourceResultFlow(session.page, out, report);
        report.status = 'PASS_NATIVE_CURRENT_SOVIET03_RESTORED_SOURCE_PAID_TESLA_TANKS_DOMINATOR_VICTORY_AND_SCORE';
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
