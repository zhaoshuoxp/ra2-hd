import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { namedSaveRestart, closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';
import { completeSourceResultFlow } from './complete-source-result-flow.mjs';

const out = path.resolve(process.argv[2]), mission = 'sov02smd.map';
const checkpointPath = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
const checkpoint = checkpointPath && JSON.parse(await fs.readFile(path.resolve(checkpointPath)));
const observeMedia = process.argv.includes('--observe-media');
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.slice(13) ?? 'normal';
assert(['easy', 'normal', 'hard'].includes(difficulty));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    assistance: 'Original map initialization, source-guided squad navigation, ordinary serialized attacks, paid production, legal construction and named save/process restart. Targeted attacks respect shroud. Source rules, triggers, units, health, RNG and victory conditions remain unchanged.' };
let session, commands, stopMedia;
async function retainMedia(phase) {
    if (!stopMedia) return;
    const stop = stopMedia; stopMedia = undefined;
    (report.missionMedia ??= []).push({ phase, ...await stop() });
}
const army = ['HTNK', 'APOC', 'V3', 'HTK', 'E2', 'SHK', 'DRON'];
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state);
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    assert(!state.failure, state.failure); return state;
}
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    if (observeMedia) stopMedia = await observeMissionMedia(session.page);
    if (checkpoint) {
        assert.equal(checkpoint.identity.mission, mission); report.sourceCheckpoint = { file: checkpointPath, tick: checkpoint.tick, checksum: checkpoint.checksum };
        await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
        await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
        const restored = await worldState(session.page);
        assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission, world: restored.world,
            pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
        await closeCampaignMenuPaused(session.page);
    } else {
        const launching = session.page.evaluate(({ mission, difficulty, originalOpening }) => {
            const screen = window.__ra2debug.mainMenuController.screens.get(22); screen.difficulty = difficulty;
            return screen.launchPrepared(mission, undefined, { originalOpening });
        }, { mission, difficulty, originalOpening: observeMedia });
        const captureOpening = async () => {
            if (!observeMedia) return;
            await session.page.waitForFunction(() => [...document.querySelectorAll('[data-campaign-media] video')]
                .some(video => video.currentTime > .8 && video.readyState >= 2), undefined, { timeout: 90000 });
            report.openingCapture = await session.page.evaluate(() => {
                const holder = document.querySelector('[data-campaign-media]'), video = holder.querySelector('video');
                return { id: holder.dataset.campaignMedia, time: video.currentTime, duration: video.duration,
                    dimensions: [video.videoWidth, video.videoHeight], rate: video.playbackRate };
            });
            await session.page.screenshot({ path: path.join(out, 'native-original-opening.png') });
        };
        await Promise.all([launching, captureOpening()]);
        await waitWorld(session.page, mission);
    }
    report.initialLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    if (!checkpoint) { assert.equal(report.initialLaunch.semanticsVersion, 45); assert.equal(report.initialLaunch.difficulty, difficulty); }
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    if (process.argv.includes('--watch-stall')) await watchNativeEvaluation(session, out, report);
    commands = new OrdinaryCampaignCommands(session.page, report);
    if (!checkpoint) await commands.step(900, { defend: false });
    for (let attempt = 0; attempt < 120 && await session.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked); attempt++) {
        await commands.step(60, { defend: false });
    }
    assert(!await session.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked), 'Original briefing did not release player control');
    let state = await inspect(checkpoint ? 'restored-original-outpost-state' : 'original-introduction-and-three-starter-squads');
    const posts = checkpoint ? [] : await session.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return ['German1 House', 'German2 House', 'German3 House'].map(house => ({ house,
            sourceTargets: g.map.getInitialMapObjects().technos.filter(object => object.owner === house)
                .map(object => ({ name: object.name, tile: [object.rx, object.ry] })) }));
    });
    const assigned = new Set();
    for (const [postIndex, post] of posts.entries()) {
        assert(post.sourceTargets.length, 'Original outpost placement is absent');
        const center = post.sourceTargets.find(object => object.name === 'GAPILE')?.tile ?? post.sourceTargets[0].tile;
        post.center = center; post.squad = [];
        for (const name of ['HTNK', 'V3', 'HTK', 'E2', 'DOG']) {
            const available = state.own.filter(object => object.name === name && object.spawned && !assigned.has(object.id));
            const count = Math.ceil(available.length / (posts.length - postIndex));
            const candidates = available
                .sort((a, b) => Math.hypot(a.tile[0] - center[0], a.tile[1] - center[1])
                    - Math.hypot(b.tile[0] - center[0], b.tile[1] - center[1])).slice(0, count);
            for (const unit of candidates) { post.squad.push(unit.id); assigned.add(unit.id); }
        }
        assert(post.squad.length, 'Original squad is absent for ' + post.house);
        await commands.order(post.squad, 4, undefined, center);
    }
    report.originalOutposts = posts;
    for (let attempt = 0; attempt < 420 && !state.own.some(object => ['SMCV', 'NACNST'].includes(object.name)); attempt++) {
        for (const post of posts) {
            const remaining = state.houses.find(house => house.name === post.house)?.objects ?? [];
            if (!remaining.length) continue;
            const artillery = post.squad.filter(id => state.own.some(object => object.id === id && object.name === 'V3'));
            const ground = post.squad.filter(id => !artillery.includes(id));
            const target = await commands.attackVisible(artillery, post.house, 'buildings');
            const contact = await commands.attackVisible(ground, post.house, 'ground');
            if (!target && !contact && attempt % 6 === 0) {
                const source = post.sourceTargets[attempt / 6 % post.sourceTargets.length | 0];
                await commands.order(post.squad, 4, undefined, source.tile);
            }
        }
        await commands.step(180, { defend: false }); state = await inspect('original-outpost-objective-' + attempt);
        assert(state.own.some(object => object.name === 'HTNK'), 'The ordinary starting armor was lost');
    }
    assert(state.own.some(object => ['SMCV', 'NACNST'].includes(object.name)), 'Original outpost conditions did not produce the source MCV reinforcement');
    await session.page.screenshot({ path: path.join(out, 'native-original-outposts-and-mcv.png') });
    if (!state.own.some(object => object.name === 'NACNST')) {
    const deployment = await session.page.evaluate(() => {
        const g = window.__ra2debug.game, mcv = g.localPlayer.getOwnedObjects().find(object => object.name === 'SMCV');
        const worker = g.getConstructionWorker(mcv.owner);
        const candidates = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
            && Math.hypot(tile.rx - mcv.tile.rx, tile.ry - mcv.tile.ry) <= 12
            && worker.canPlaceAt(mcv.rules.deploysInto, tile, { ignoreObjects: [mcv], ignoreAdjacent: true }))
            .sort((a, b) => Math.hypot(a.rx - mcv.tile.rx, a.ry - mcv.tile.ry) - Math.hypot(b.rx - mcv.tile.rx, b.ry - mcv.tile.ry));
        if (!candidates.length) throw Error('No legal ordinary MCV deployment cell');
        return [candidates[0].rx, candidates[0].ry];
    });
    report.ordinaryDeploymentCell = deployment;
    await commands.order(['SMCV'], 0, undefined, deployment); await commands.step(180);
    await commands.order(['SMCV'], 9); await commands.step(180);
    state = await inspect('ordinary-mcv-deployed'); assert(state.own.some(object => object.name === 'NACNST'));
    }
    const yard = state.own.find(object => object.name === 'NACNST');
    await commands.order(army, 4, undefined, [yard.tile[0] + 4, yard.tile[1] + 6]); await commands.step(600);
    await commands.order(['HTK'], 10); await commands.step(180);
    commands.groundDefenders = ['HTNK', 'APOC', 'V3', 'E2', 'SHK', 'DRON'];
    const required = new Map();
    for (const name of ['NAPOWR', 'NAREFN', 'NAHAND', 'NAFLAK', 'NAPOWR', 'NAWEAP', 'NARADR', 'NATECH', 'NAREFN']) {
        required.set(name, (required.get(name) ?? 0) + 1);
        if (state.own.filter(object => object.name === name).length < required.get(name)) {
            const near = name === 'NAREFN' ? [yard.tile[0] + 5, yard.tile[1] - 3]
                : name === 'NAWEAP' ? [yard.tile[0] - 3, yard.tile[1] + 4] : undefined;
            await commands.build(name, near); state = await inspect('ordinary-built-' + name);
        }
        if (name === 'NARADR') await commands.queue('FLAKT', 4);
        if (name === 'NAWEAP') await commands.queue('HARV', 1);
        if (name === 'NATECH') await commands.queue('APOC', 10);
    }
    for (const name of ['NAPOWR', 'TESLA', 'NAFLAK', 'NAPOWR', 'TESLA', 'NAPOWR']) {
        await commands.build(name, [114, 27]); state = await inspect('ordinary-built-' + name);
    }
    await commands.queue('E2', 8); await commands.queue('HTK', 3);
    state = await inspect('ordinary-source-base-and-production');
    await retainMedia('fresh-source-before-named-restart');
    session = await namedSaveRestart(session, out, report, 'Original YR Soviet02 outposts and deployed base', async (page, ticks) => {
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true)); return stepWorld(page, ticks);
    }, async ({ page }) => {
        if (observeMedia) stopMedia = await observeMissionMedia(page);
    });
    report.restoredLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.restoredLaunch.difficulty, report.initialLaunch.difficulty);
    assert.equal(report.restoredLaunch.semanticsVersion, report.initialLaunch.semanticsVersion);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    if (process.argv.includes('--watch-stall')) await watchNativeEvaluation(session, out, report);
    commands = new OrdinaryCampaignCommands(session.page, report);
    commands.groundDefenders = ['HTNK', 'APOC', 'V3', 'E2', 'SHK', 'DRON'];
    for (let attempt = 0; attempt < 100; attempt++) {
        await commands.step(180); state = await inspect('ordinary-assault-assembly-' + attempt);
        if (state.own.filter(object => object.name === 'APOC').length >= 10
            && state.own.filter(object => object.name === 'V3').length >= 6) break;
    }
    commands.groundDefenders = ['E2', 'SHK', 'DRON', 'HTNK'];
    const strike = ['APOC', 'V3', 'HTK'];
    await commands.order(strike, 4, undefined, [113, 33]); await commands.step(900);
    await fs.writeFile(path.join(out, 'ordinary-assault-checkpoint.json'), JSON.stringify(await session.page.evaluate(() => {
        const g = window.__ra2debug.game; return g.campaign.journal.capture(g);
    })) + '\n');
    const goals = await session.page.evaluate(() => window.__ra2debug.game.map.getInitialMapObjects().technos
        .filter(object => ['CALAB', 'GACSPH'].includes(object.name)).map(object => [object.rx, object.ry]));
    assert.equal(goals.length, 2);
    for (const tile of [[110, 70], [105, 110], [105, 145]]) {
        await commands.order(strike, 4, undefined, tile);
        for (let i = 0; i < 30; i++) {
            await commands.attackVisible(['APOC'], undefined, 'ground');
            await commands.attackVisible(['HTK'], undefined, 'air');
            await commands.attackVisible(['V3'], undefined, 'buildings');
            await commands.step(90);
        }
        state = await inspect('ordinary-original-route-' + tile.join('-'));
    }
    for (let attempt = 0; attempt < 350 && state.result !== 'victory'; attempt++) {
        const artillery = await commands.attackVisible(['V3'], undefined, 'buildings');
        const ground = await commands.attackVisible(['APOC'], undefined, 'ground');
        const air = await commands.attackVisible(['HTK'], undefined, 'air');
        if (!artillery && !ground && !air && attempt % 6 === 0) await commands.order(strike, 4, undefined, goals[attempt / 6 % goals.length | 0]);
        if (attempt % 12 === 0 && state.credits > 5000 && state.own.some(object => object.name === 'NAWEAP')) {
            for (const [name, count] of [['APOC', 10], ['V3', 6], ['HTK', 4]]) {
                const pending = state.queues.flatMap(queue => queue.items).filter(item => item.name === name)
                    .reduce((sum, item) => sum + item.quantity, 0);
                const needed = count - pending - state.own.filter(object => object.name === name).length;
                if (needed > 0) await commands.queue(name, needed);
            }
        }
        await commands.step(180); state = await inspect('original-laboratory-and-chronosphere-objective-' + attempt);
    }
    assert.equal(state.result, 'victory', 'Original laboratory and Chronosphere goals remain');
    report.victory = state; report.status = 'PASS_NATIVE_ORIGINAL_SOVIET02_OUTPOSTS_BASE_NAMED_RESTART_AND_VICTORY';
    await session.page.screenshot({ path: path.join(out, 'native-original-victory.png') });
    if (observeMedia) {
        await completeSourceResultFlow(session.page, out, report);
        report.status = checkpoint ? 'PASS_NATIVE_RESTORED_SOVIET02_OBJECTIVES_RESTART_VICTORY_AND_SCORE'
            : 'PASS_NATIVE_FRESH_SOVIET02_ORIGINAL_OPENING_OBJECTIVES_RESTART_VICTORY_AND_SCORE';
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await retainMedia('final-source-observation').catch(error => {
        report.status = 'FAIL'; report.mediaObserverError = error.stack; process.exitCode = 1;
    });
    if (commands) report.finalWorld = await commands.inspect('final-source-observation').catch(() => undefined);
    if (session?.page) await session.page.evaluate(() => {
        const g = window.__ra2debug?.game;
        return g?.campaign && { identity: { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch },
            commands: g.campaign.journal.commands };
    }).then(value => value && fs.writeFile(path.join(out, 'applied-source-journal.json'), JSON.stringify(value) + '\n')).catch(() => {});
    if (session?.page) await session.page.evaluate(() => {
        const g = window.__ra2debug?.game;
        return g?.campaign?.journal.trusted && !g.campaign.result && !g.campaign.failure ? g.campaign.journal.capture(g) : undefined;
    }).then(value => value && fs.writeFile(path.join(out, 'last-trusted-checkpoint.json'), JSON.stringify(value) + '\n')).catch(() => {});
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
