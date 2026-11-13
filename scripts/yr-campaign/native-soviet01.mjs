import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from '../campaign-completion/ordinary-commands.mjs';
import { namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';

const out = path.resolve(process.argv[2]);
const difficulty = process.argv.find(value => value.startsWith('--difficulty='))?.slice(13) ?? 'normal';
const observeMedia = process.argv.includes('--observe-media');
assert(['easy', 'normal', 'hard'].includes(difficulty));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', difficulty, errors: [], failedResources: [], commands: [], observations: [],
    assistance: 'Ordinary serialized player orders only. Source inspection selects objectives and visible targets. No source map/rule edits, variable changes, trigger forcing, debug damage, unit creation or forced result.',
    scope: 'Soviet01 original naval objective, source transport arrival and named save/process restart. This is a mission-stage check, not final mission acceptance.' };
let session, commands, stopMedia, mediaPhase = 'fresh-source';
async function retainMedia(phase) {
    if (!stopMedia) return;
    const stop = stopMedia; stopMedia = undefined;
    (report.missionMedia ??= []).push({ phase, ...await stop() });
}
async function observe(label) {
    const state = await session.page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const tags = c.definition.tagsForTrigger('0B752F3C').map(tag => tag.id);
        const visible = object => g.map.tileOccupation.calculateTilesForGameObject(object.tile, object)
            .some(tile => !shroud.isShrouded(tile, object.tileElevation));
        const describe = object => ({ id: object.id, name: object.name, owner: object.owner.name, tile: [object.tile.rx, object.tile.ry],
            health: object.healthTrait.health, visible: visible(object), tasks: object.unitOrderTrait?.getTasks().map(task => task.constructor.name) });
        return { tick: g.currentTick, inputLocked: c.inputLocked, failure: c.failure, result: c.result,
            completedNaval: c.machine.states.get('0B752F3C').fired > 0,
            remaining: c.machine.states.get('0B752F3C').remainingTargets,
            goals: g.world.getAllObjects().filter(object => object.isTechno() && !object.isDestroyed && object.isSpawned
                && tags.includes(object.tag?.id)).map(describe),
            own: g.localPlayer.getOwnedObjects().filter(object => object.isTechno() && object.isSpawned && !object.isDestroyed).map(describe),
            cargo: g.localPlayer.getOwnedObjects().filter(object => object.transportTrait?.units.length)
                .map(object => ({ id: object.id, name: object.name, cargo: object.transportTrait.units.map(unit => ({ id: unit.id, name: unit.name })) })),
            airborne: g.world.getAllObjects().filter(object => object.isTechno() && object.isSpawned && !object.isDestroyed
                && object.zone === 1 && object.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, object.owner)
                && visible(object)).map(describe),
            fired: [...c.machine.states].filter(([, state]) => state.fired).map(([id, state]) => [id, state.fired]) };
    });
    report.observations.push({ label, ...state });
    await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
    return state;
}
try {
    const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 0);
    session = await campaignSession(out, report, { edition: 'yr', density });
    if (observeMedia) stopMedia = await observeMissionMedia(session.page);
    const launching = session.page.evaluate(difficulty => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = difficulty;
        return screen.launchPrepared('sov01umd.map', undefined,
            { originalOpening: window.__yrMissionMediaAudit !== undefined });
    }, difficulty);
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
    await waitWorld(session.page, 'sov01umd.map');
    report.initialLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.initialLaunch.difficulty, difficulty);
    assert.equal(report.initialLaunch.edition, 'yr');
    const expectedPolicy = Number(process.argv.find(value => value.startsWith('--expect-policy='))?.slice(16) ?? 45);
    assert.equal(report.initialLaunch.semanticsVersion, expectedPolicy);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
    commands = new OrdinaryCampaignCommands(session.page, report);
    await commands.step(1200, { defend: false });
    let state = await observe('original-introduction-finished');
    for (let attempt = 0; attempt < 140 && !state.completedNaval; attempt++) {
        assert(!state.inputLocked, 'Original naval controls remain locked');
        const ships = state.goals.filter(object => ['DEST', 'CARRIER'].includes(object.name) && object.visible)
            .sort((a, b) => Number(a.name === 'CARRIER') - Number(b.name === 'CARRIER') || a.id - b.id);
        const cannons = state.goals.filter(object => object.name === 'GTGCAN' && object.visible);
        if (ships[0]) await commands.order(['SUB', 'SQD'], 2, ships[0].id);
        if (cannons[0] || ships[0]) await commands.order(['DRED'], 2, (cannons[0] ?? ships[0]).id);
        if (state.airborne[0]) await commands.order(['HYD'], 2, state.airborne[0].id);
        await commands.step(150, { defend: false });
        state = await observe('naval-objective-' + attempt);
        assert(state.own.some(object => ['DRED', 'SUB', 'SQD'].includes(object.name)), 'Original naval force was destroyed');
    }
    assert(state.completedNaval, 'Original naval objective did not complete');
    report.navalObjective = state;
    await session.page.screenshot({ path: path.join(out, 'native-original-naval-objective.png') });
    await commands.step(1200, { defend: false });
    report.landing = await observe('original-transport-and-boris-arrival');
    for (let attempt = 0; attempt < 30 && (!report.landing.own.some(object => object.name === 'BORIS') || report.landing.inputLocked); attempt++) {
        await commands.step(150, { defend: false });
        report.landing = await observe('original-landing-wait-' + attempt);
    }
    assert(report.landing.own.some(object => object.name === 'BORIS'), 'Original Boris transport has not arrived');
    await retainMedia('fresh-source-before-save');
    session = await namedSaveRestart(session, out, report, `YR Soviet01 ${difficulty} naval objective and landing`, async (page, ticks) => {
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
        return stepWorld(page, ticks);
    }, async ({ page }) => {
        if (observeMedia) { mediaPhase = 'restored-source'; stopMedia = await observeMissionMedia(page); }
    });
    report.restoredLaunch = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.restoredLaunch.difficulty, difficulty);
    report.final = await worldState(session.page);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_NAVAL_OBJECTIVE_LANDING_AND_NAMED_RESTART';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await retainMedia(mediaPhase+'-on-exit').catch(error => {
        report.status = 'FAIL'; report.mediaObserverError = error.stack; process.exitCode = 1;
    });
    if (session?.page) await session.page.screenshot({ path: path.join(out, 'native-final.png') }).catch(() => {});
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
