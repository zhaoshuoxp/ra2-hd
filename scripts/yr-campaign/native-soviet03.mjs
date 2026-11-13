import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { namedSaveRestart, closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { watchNativeEvaluation } from './watch-native-evaluation.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';

const out = path.resolve(process.argv[2]), mission = 'sov03umd.map';
const source = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
const checkpoint = source && JSON.parse(await fs.readFile(path.resolve(source)));
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.slice(13) ?? 'normal';
const observeMedia = process.argv.includes('--observe-media');
const coverBoris = process.argv.includes('--cover-boris');
assert(['easy', 'normal', 'hard'].includes(difficulty));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], commands: [], samples: [],
    assistance: 'Original source mission, source-guided ordinary movement, paid production and visible-target attacks. No source, rules, actors, health, tasks, RNG, trigger conditions or result edits.' };
let session, commands, stopMedia;
async function retainMedia(phase) {
    if (!stopMedia) return;
    const stop = stopMedia; stopMedia = undefined;
    const audit = await stop(); (report.missionMedia ??= []).push({ phase, ...audit });
    assert.deepEqual(audit.errors, []);
}
async function inspect(label) {
    const state = await commands.inspect(label); report.samples.push(state);
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n'); return state;
}
async function save(name) {
    const value = await session.page.evaluate(() => { const g = window.__ra2debug.game; return g.campaign.journal.capture(g); });
    await fs.writeFile(path.join(out, name), JSON.stringify(value) + '\n');
}
let coverTarget;
async function coverHero(attempt, fallbackTarget) {
    if (!coverBoris) return;
    const plan = await session.page.evaluate(() => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const boris = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'BORIS' && !unit.isDestroyed);
        if (!boris) throw Error('The original hero was lost');
        const threats = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.zone !== 1
            && unit.isSpawned && !unit.isDestroyed && unit.owner !== g.localPlayer && !unit.owner.isNeutral
            && !g.alliances.areAllied(g.localPlayer, unit.owner)
            && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
            && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
            && Math.hypot(unit.tile.rx-boris.tile.rx, unit.tile.ry-boris.tile.ry) < 10)
            .sort((a, b) => Number(b.isVehicle())-Number(a.isVehicle())
                || Math.hypot(a.tile.rx-boris.tile.rx, a.tile.ry-boris.tile.ry)
                - Math.hypot(b.tile.rx-boris.tile.rx, b.tile.ry-boris.tile.ry));
        const point = g.map.tiles.getByMapCoords(boris.tile.rx+3, boris.tile.ry+3);
        return { target: threats[0]?.id,
            point: point && g.map.mapBounds.isWithinPlayerBounds(point) ? [point.rx, point.ry] : undefined };
    });
    const names = ['HTNK', 'SHK', 'DRON', 'E2', 'HTK'], target = plan.target ?? fallbackTarget;
    if (target !== undefined && target !== coverTarget) {
        await commands.order(names, 2, target); coverTarget = target;
    } else if (target === undefined && plan.point && (attempt % 5 === 0 || coverTarget !== undefined)) {
        await commands.order(names, 4, undefined, plan.point); coverTarget = undefined;
    }
}
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    if (observeMedia) stopMedia = await observeMissionMedia(session.page);
    if (checkpoint) {
        assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, mission);
        assert(!checkpoint.trainer);
        report.sourceCheckpoint = source;
        await session.page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
            .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
        await session.page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
        const restored = await worldState(session.page);
        assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
            world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
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
    if (!checkpoint) assert.equal(report.initialLaunch.difficulty, difficulty);
    if (observeMedia) assert.equal(report.initialLaunch.semanticsVersion, 45);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    await watchNativeEvaluation(session, out, report);
    commands = new OrdinaryCampaignCommands(session.page, report);
    if (!checkpoint) await commands.step(900, { defend: false });
    for (let i = 0; i < 120 && await session.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked); i++) {
        await commands.step(60, { defend: false });
    }
    let state = await inspect('original-london-briefing-and-starting-squads');
    report.difficulty = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch.difficulty);
    await save('original-unlocked-checkpoint.json');
    if (process.argv.includes('--clear-beacon-air-defense')) {
        const target = await session.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const boris = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'BORIS' && !unit.isDestroyed);
            if (!boris) throw Error('The original Boris unit is required');
            const target = g.world.getAllObjects().filter(unit => unit.name === 'NASAM' && !unit.isDestroyed
                && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && !shroud.isShrouded(unit.tile, unit.tileElevation))
                .sort((a, b) => Math.hypot(a.tile.rx-boris.tile.rx, a.tile.ry-boris.tile.ry)
                    - Math.hypot(b.tile.rx-boris.tile.rx, b.tile.ry-boris.tile.ry))[0];
            return target && { id: target.id, tile: [target.tile.rx, target.tile.ry] };
        });
        assert(target, 'The ordinary supported assault requires a revealed air defense target');
        await commands.order(['HTNK', 'SHK', 'BORIS'], 2, target.id);
        for (let i = 0; i < 60; i++) {
            await coverHero(i, target.id);
            await commands.step(90, { defend: false }); state = await inspect('ordinary-visible-air-defense-' + i);
            if (!state.houses.some(house => house.objects.some(unit => unit.id === target.id))) break;
            assert(state.own.some(unit => unit.name === 'BORIS'), 'Boris was lost in the ordinary air defense assault');
        }
        await save('ordinary-air-defense-assault-checkpoint.json');
    }
    if (process.argv.includes('--resume-liberated')) {
        assert(!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB')), 'The original beacon remains');
    } else if (process.argv.includes('--direct-beacon')) {
        const target = await session.page.evaluate(() => {
            const g = window.__ra2debug.game, unit = g.world.getAllObjects().find(unit => unit.name === 'NAPSYB' && !unit.isDestroyed);
            if (!unit) return;
            return { id: unit.id, tile: [unit.tile.rx, unit.tile.ry] };
        });
        assert(target);
        await commands.order(['BORIS'], 2, target.id);
        if (!coverBoris) await commands.order(['HTNK', 'SHK'], 4, undefined, [54, 92]);
        for (let i = 0; i < 80; i++) {
            await coverHero(i);
            if (coverBoris && i % 10 === 0 && await session.page.evaluate(id =>
                window.__ra2debug.game.localPlayer.getOwnedObjects().find(unit => unit.name === 'BORIS')
                    ?.attackTrait.currentTarget?.obj?.id !== id, target.id))
                await commands.order(['BORIS'], 2, target.id);
            await commands.step(90, { defend: false }); state = await inspect('ordinary-direct-beacon-' + i);
            if (!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB'))) break;
        }
    } else if (process.argv.includes('--micro')) {
        await commands.queue('SHK', report.difficulty === 'easy' ? 12 : 4);
        await commands.order(['DRON', 'SHK'], 4, undefined, [73, 88]);
        for (const goal of [[70, 86], [64, 86], [58, 87], [53, 89], [49, 92]]) {
            const assigned = new Map();
            for (let i = 0; i < 60; i++) {
                const plan = await session.page.evaluate(goal => {
                    const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
                    const boris = own.find(unit => unit.name === 'BORIS'); if (!boris) return;
                    const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                        && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                        && !shroud.isShrouded(unit.tile, unit.tileElevation)
                        && !unit.cloakableTrait?.isCloaked()
                        && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
                    const distance = unit => Math.hypot(unit.tile.rx - boris.tile.rx, unit.tile.ry - boris.tile.ry);
                    const infantry = enemies.filter(unit => unit.isInfantry() && distance(unit) < 10).sort((a, b) => distance(a) - distance(b))[0];
                    const goalDistance = (x, y) => Math.hypot(x - 47, y - 94);
                    const building = enemies.filter(unit => unit.isBuilding() && distance(unit) < 15
                        && ['NASAM', 'GAPILL', 'NAPSYB'].includes(unit.name)
                        && goalDistance(unit.tile.rx, unit.tile.ry) < goalDistance(boris.tile.rx, boris.tile.ry))
                        .sort((a, b) => Number(b.name === 'NAPSYB') - Number(a.name === 'NAPSYB')
                            || Number(b.name === 'NASAM') - Number(a.name === 'NASAM') || distance(a) - distance(b))[0];
                    const tanks = enemies.filter(unit => unit.isVehicle() && unit.zone !== 1 && distance(unit) < 13)
                        .sort((a, b) => distance(a) - distance(b));
                    return { boris: boris.id, target: (infantry ?? building)?.id,
                        tankTarget: tanks[0]?.id, drones: own.filter(unit => unit.name === 'DRON').map((unit, i) => [unit.id, tanks[i % tanks.length]?.id]),
                        atGoal: Math.hypot(boris.tile.rx - goal[0], boris.tile.ry - goal[1]) < 3 };
                }, goal);
                assert(plan, 'Boris was lost during the ordinary column advance');
                const orders = [[plan.boris, plan.target], ...plan.drones];
                for (const [id, target] of orders) if (target !== undefined && assigned.get(id) !== target) {
                    await commands.order([id], 2, target); assigned.set(id, target);
                }
                if (plan.tankTarget !== undefined && assigned.get('tanks') !== plan.tankTarget) {
                    await commands.order(['HTNK', 'SHK'], 2, plan.tankTarget); assigned.set('tanks', plan.tankTarget);
                }
                if (plan.target === undefined && (i % 8 === 0 || assigned.has(plan.boris))) {
                    await commands.order(['BORIS'], 4, undefined, goal); assigned.delete(plan.boris);
                }
                if (plan.tankTarget === undefined && i % 8 === 0) await commands.order(['HTNK', 'SHK'], 4, undefined, goal);
                await commands.step(60); state = await inspect('ordinary-supported-beacon-column-' + goal.join('-') + '-' + i);
                if (!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB')) || plan.atGoal) break;
            }
            await save('last-supported-column-checkpoint.json');
            await save('supported-column-' + goal.join('-') + '-checkpoint.json');
            if (!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB'))) break;
        }
    } else if (process.argv.includes('--transport')) {
        const boat = state.own.find(unit => unit.name === 'SAPC');
        const cargo = state.own.filter(unit => ['BORIS', 'HTNK'].includes(unit.name)).map(unit => unit.id);
        assert(boat && cargo.length === 4);
        await commands.order([boat.id], 0, undefined, [91, 109]); await commands.step(480, { defend: false });
        await commands.order([boat.id], 11); await commands.step(60, { defend: false });
        for (const id of cargo) await commands.order([id], 17, boat.id);
        for (let i = 0; i < 30; i++) {
            if (i && i % 5 === 0) for (const id of cargo) await commands.order([id], 17, boat.id);
            await commands.step(60, { defend: false }); state = await inspect('ordinary-beacon-transport-boarding-' + i);
            if (state.own.find(unit => unit.id === boat.id)?.passengers?.length === cargo.length) break;
        }
        assert.equal(state.own.find(unit => unit.id === boat.id)?.passengers?.length, cargo.length);
        await commands.order([boat.id], 0, undefined, [52, 98]);
        for (let i = 0; i < 50; i++) {
            await commands.step(60, { defend: false }); state = await inspect('ordinary-beacon-transport-crossing-' + i);
            const current = state.own.find(unit => unit.id === boat.id); assert(current, 'Original transport lost');
            if (Math.hypot(current.tile[0] - 52, current.tile[1] - 98) < 3) break;
        }
        await commands.order([boat.id], 10);
        for (let i = 0; i < 20; i++) {
            await commands.step(60, { defend: false }); state = await inspect('ordinary-beacon-transport-unloading-' + i);
            if (!state.own.find(unit => unit.id === boat.id)?.passengers?.length) break;
        }
        await save('original-beacon-landing-checkpoint.json');
        for (let i = 0; i < 100; i++) {
            const beacon = await session.page.evaluate(() => {
                const g = window.__ra2debug.game, unit = g.world.getAllObjects().find(unit => unit.name === 'NAPSYB' && !unit.isDestroyed);
                if (!unit) return;
                return { id: unit.id, visible: !g.mapShroudTrait.getPlayerShroud(g.localPlayer).isShrouded(unit.tile, unit.tileElevation) };
            });
            if (!beacon) break;
            if (beacon.visible) { if (i % 10 === 0) await commands.order(['BORIS', 'HTNK'], 2, beacon.id); }
            else if (i % 10 === 0) await commands.order(['BORIS', 'HTNK'], 4, undefined, [49, 97]);
            await commands.step(90); state = await inspect('original-transport-beacon-objective-' + i);
            assert(state.own.some(unit => unit.name === 'BORIS'), 'Boris was lost during the ordinary beacon attack');
        }
    } else {
    for (const tile of [[88, 100], [71, 96], [55, 96]]) {
        await commands.order(['HTNK', 'DRON', 'BORIS', 'E2', 'HTK'], 4, undefined, tile);
        for (let i = 0; i < 36; i++) {
            const beacon = state.houses.flatMap(house => house.objects).find(unit => unit.name === 'NAPSYB');
            if (!beacon) break;
            await commands.attackVisible(['HTNK', 'DRON', 'E2'], 'BadGuy1', 'ground');
            await commands.attackVisible(['HTK'], undefined, 'air');
            if (i % 4 === 0) await commands.attackVisible(['BORIS'], 'BadGuy1', 'buildings');
            await commands.step(90); state = await inspect('ordinary-beacon-route-' + tile.join('-') + '-' + i);
        }
        if (!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB'))) break;
        await save('last-beacon-route-checkpoint.json');
    }
    for (let i = 0; i < 80 && state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB')); i++) {
        await commands.attackVisible(['BORIS', 'HTNK'], 'BadGuy1', 'buildings');
        await commands.attackVisible(['DRON', 'E2'], 'BadGuy1', 'ground');
        await commands.step(90); state = await inspect('original-beacon-objective-' + i);
    }
    }
    assert(!state.houses.some(h => h.objects.some(unit => unit.name === 'NAPSYB')), 'Original beacon remains');
    for (let i = 0; i < 30; i++) {
        await commands.step(90); state = await inspect('original-allied-liberation-' + i);
        if (state.own.some(unit => unit.name === 'GACNST') && !await session.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) break;
    }
    await save('liberated-allied-base-checkpoint.json');
    await retainMedia('before-named-save-restart');
    session = await namedSaveRestart(session, out, report, 'Original YR Soviet03 London beacon and Allied liberation', async (page, ticks) => {
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true)); return stepWorld(page, ticks);
    }, async ({ page }) => {
        if (observeMedia) stopMedia = await observeMissionMedia(page);
    });
    commands = new OrdinaryCampaignCommands(session.page, report);
    report.restoredLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.restoredLaunch.semanticsVersion, report.initialLaunch.semanticsVersion);
    assert.equal(report.restoredLaunch.difficulty, report.initialLaunch.difficulty);
    report.liberation = await inspect('restored-original-liberation');
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET03_BEACON_LIBERATION_AND_RESTART_FINAL_OBJECTIVES_PENDING';
    await session.page.screenshot({ path: path.join(out, 'native-original-liberation.png') });
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await retainMedia('final-source-observation').catch(error => {
        report.status = 'FAIL'; report.mediaObserverError = error.stack; process.exitCode = 1;
    });
    if (commands) report.finalWorld = await commands.inspect('final-original-observation').catch(() => undefined);
    if (session?.page && !report.finalWorld?.result) await save('last-trusted-checkpoint.json').catch(() => {});
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
