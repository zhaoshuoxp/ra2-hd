import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { namedSaveRestart } from './named-save-restart.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';
import { observeSourceFullscreen } from './source-fullscreen-observer.mjs';
import { requiredNativeHd } from './native-required-hd.mjs';
import { waitForCampaignFullscreen } from './native-media-wait.mjs';
import { nativeMemorySnapshot } from './native-memory-snapshot.mjs';

const [outArg, sourceArg, prefix, goal] = process.argv.slice(2);
const livePrefix = process.argv.find(value => value.startsWith('--live-prefix='))?.slice(14);
const sourceMusic = process.argv.find(value => value.startsWith('--source-music='))?.slice(15);
const sourceRadar = process.argv.find(value => value.startsWith('--source-radar='))?.slice(15);
const sourceRadarSkip = process.argv.includes('--source-radar-skip-after-restart');
const expectedResult = process.argv.find(value => value.startsWith('--expected-result='))?.split('=')[1] ?? 'victory';
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 0);
const focus = process.argv.find(value => value.startsWith('--focus='))?.slice(8);
const requiredHd = process.argv.find(value => value.startsWith('--require-hd='))?.slice(13).split(',') ?? [];
const weatherDuration = Number(process.argv.find(value => value.startsWith('--source-weather-duration='))?.split('=')[1] ?? 0);
assert(['victory', 'defeat'].includes(expectedResult));
assert([0, 2, 4].includes(density));
assert(!sourceRadarSkip || sourceRadar);
const out = path.resolve(outArg), directory = path.resolve(sourceArg);
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
if (process.argv.includes('--source-radar-audit-checkpoint')) {
    assert(sourceRadar && livePrefix && !source.samples.some(sample => sample.label === prefix));
    const observed = source.finalMovie?.find(movie => movie.placement === 'transmission-paused'
        && movie.pending.some(item => item.id === sourceRadar));
    assert(observed?.playback && observed.ended && observed.action.opcode === 117,
        'The boundary must come from a retained actual original source-movie observation');
    source.samples.push({ label: prefix, tick: observed.tick, hash: observed.hash, sourceTrace: observed.sourceTrace });
}
const target = source.samples.findLast(sample => sample.label === goal);
assert.equal(target?.result, expectedResult); assert(source.samples.some(sample => sample.label === prefix && sample.tick + 180 < target.tick));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [], mission: source.identity.launch.mission,
    expectedResult, density,
    scope: 'A fresh original world re-executes only its recorded ordinary player actions. A genuine mid-mission named save survives a full app restart with exact world, RNG, mission, teams, queues, timers, callbacks and optional camera restoration. The same subsequent ordinary actions reach the recorded original goal and complete score. No altered source, rules, triggers, health, ownership, objectives, hidden initial save or post-creation RNG edit.' };
let app, page, labels, journal;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(label) {
    const state = await new OrdinaryCampaignCommands(page, report).inspect(label);
    report.samples.push(state); await save(); assert(!state.failure, state.failure); return state;
}
async function advanceRecorded(currentPage, ticks) {
    await waitForCampaignFullscreen(currentPage);
    const start = await currentPage.evaluate(() => window.__ra2debug.game.currentTick), end = start + ticks;
    assert(end < target.tick);
    await currentPage.evaluate(({ records, end }) => {
        const d = window.__ra2debug, g = d.game;
        while (g.currentTick < end && !g.campaign.failure && !g.campaign.result) {
            for (const record of records.filter(record => record.tick === g.currentTick)) {
                const action = d.actionFactory.create(record.type); action.unserialize(new Uint8Array(record.data));
                action.player = g.getPlayer(record.player); g.campaign.journal.record(g, action.player, [action]); action.process();
            }
            g.update();
        }
        if (g.currentTick !== end) throw Error('Original mission ended before the save continuation boundary');
    }, { records: source.appliedCommands.filter(record => record.tick >= start && record.tick < end), end });
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    report.replay = await replaySourcePrefix(page, source, livePrefix ?? prefix);
    if (livePrefix) report.livePrefix = await continueRecordedSource(page, source, prefix);
    if (sourceRadar) {
        assert(livePrefix, 'A radar-save check requires a live original source trigger before the save');
        await page.waitForFunction(movie => document.querySelector(`[data-sidebar-radar] [data-campaign-media=${movie}] video`)?.currentTime > .4
            && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), sourceRadar);
        report.sourceRadarBeforeSave = await page.evaluate(movie => {
            const d = window.__ra2debug, video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { id: movie, time: video.currentTime, volume: video.volume, media: d.game.campaign.captureMedia().movies,
                originalActions: d.game.campaign.trace.filter(action => [100, 117].includes(action.opcode)) };
        }, sourceRadar);
        assert(report.sourceRadarBeforeSave.volume > 0 && report.sourceRadarBeforeSave.originalActions.length > 0);
    }
    if (sourceMusic) {
        await page.waitForFunction(sound => { const d = window.__ra2debug, state = d.music.getPlaybackState();
            return d.game.campaign.musicTheme === sound && state?.sound === sound && state.playing && state.time > .2;
        }, sourceMusic, { timeout: 30000 });
        report.sourceMusicBeforeSave = await page.evaluate(() => ({ theme: window.__ra2debug.game.campaign.musicTheme,
            state: window.__ra2debug.music.getPlaybackState(), actions: window.__ra2debug.game.campaign.trace.filter(action => action.opcode === 20) }));
        assert(report.sourceMusicBeforeSave.actions.some(action => action.tick >= report.replay.tick));
    }
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    await inspect('original-mid-mission-before-save');
    if (focus) {
        report.focus = await page.evaluate(name => {
            const d = window.__ra2debug, object = d.game.world.getAllObjects().find(o => o.name === name && o.isSpawned && !o.isDestroyed);
            if (!object) throw Error('Original focus actor is absent: ' + name);
            d.worldInteraction.minimapHandler.panToTile(object.tile);
            return { name, id: object.id, policy: 'Ordinary UI camera pan only; no world, shroud or simulation edit.' };
        }, focus);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, 'native-original-mid-mission.png') });
    }
    if (process.argv.includes('--observe-memory')) report.memoryBeforeSave = await nativeMemorySnapshot(app, page);
    if (requiredHd.length) report.requiredHdBeforeSave = await requiredNativeHd(page, requiredHd, density);
    if (weatherDuration) {
        report.weatherBeforeSave = await page.evaluate(() => window.__ra2debug.game.campaign.checkpointState().lightningStorms);
        assert.equal(report.weatherBeforeSave.length, 1); assert.equal(report.weatherBeforeSave[0].campaignDuration, weatherDuration);
        assert.equal(report.weatherBeforeSave[0].owner, null); assert(report.weatherBeforeSave[0].manifestEndTimer > 0);
    }
    const restoredRadar = sourceRadarSkip ? async ({ page }, checkpoint) => {
        const saved = checkpoint.presentation.movies.find(movie => movie.id === sourceRadar);
        assert.equal(saved?.placement, 'transmission-paused');
        await page.waitForFunction(({ id, time }) => document.querySelector(`[data-campaign-media=${id}] video`)
            ?.currentTime > time + .25, saved);
        report.sourceRadarAfterRestart = await page.evaluate(saved => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            const video = document.querySelector(`[data-sidebar-radar] [data-campaign-media=${saved.id}] video`);
            const before = { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() };
            for (let attempt = 0; attempt < 100; attempt++) manager.doGameTurn(performance.now());
            return { saved, time: video.currentTime, volume: video.volume, placement: g.campaign.captureMedia().movies[0].placement,
                objectFit: getComputedStyle(video).objectFit, before,
                after: { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() } };
        }, saved);
        assert.deepEqual(report.sourceRadarAfterRestart.before, report.sourceRadarAfterRestart.after);
        assert.equal(report.sourceRadarAfterRestart.objectFit, 'contain'); assert(report.sourceRadarAfterRestart.volume > 0);
        await page.screenshot({ path: path.join(out, 'native-restored-original-paused-radar.png') });
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true));
        await page.locator(`[data-sidebar-radar] [data-campaign-media=${sourceRadar}] button`).click();
        await page.evaluate(() => window.__ra2debug.gameScreen.gameTurnMgr.setCampaignPaused(true));
        report.restoredRadarSkip = await page.evaluate(() => window.__ra2debug.game.campaign.movieOutcomes);
        assert(report.restoredRadarSkip.some(item => item.id === sourceRadar && item.outcome === 'skipped'));
    } : undefined;
    ({ app, page, labels } = await namedSaveRestart({ app, page, labels }, out, report,
        'Original ' + report.mission + ' mission state', advanceRecorded, restoredRadar));
    if (sourceRadar && !sourceRadarSkip) {
        const checkpoint = JSON.parse(await fs.readFile(path.join(out, 'mid-mission-checkpoint.json')));
        const saved = checkpoint.presentation.movies.find(movie => movie.id === sourceRadar);
        assert(['transmission', 'transmission-paused'].includes(saved?.placement));
        assert.equal(saved.placement, report.sourceRadarBeforeSave.media.find(movie => movie.id === sourceRadar)?.placement);
        await page.waitForFunction(({ movie, time }) => {
            const video = document.querySelector(`[data-sidebar-radar] [data-campaign-media=${movie}] video`);
            return video && video.currentTime >= time - .1;
        }, { movie: sourceRadar, time: saved.time });
        const actual = await page.evaluate(movie => {
            const video = document.querySelector(`[data-campaign-media=${movie}] video`);
            return { id: movie, time: video.currentTime, volume: video.volume };
        }, sourceRadar);
        assert(actual.time - saved.time < 3 && actual.volume > 0);
        report.sourceRadarAfterRestart = { saved, actual };
    }
    if (sourceMusic) {
        const checkpoint = JSON.parse(await fs.readFile(path.join(out, 'mid-mission-checkpoint.json')));
        const saved = checkpoint.presentation.music; assert.equal(saved.sound, sourceMusic);
        await page.waitForFunction(({ sound, time }) => { const d = window.__ra2debug, state = d.music.getPlaybackState();
            return d.game.campaign.musicTheme === sound && state?.sound === sound && state.playing && state.time >= time - .1;
        }, saved, { timeout: 30000 });
        report.sourceMusicAfterRestart = { saved, actual: await page.evaluate(() => window.__ra2debug.music.getPlaybackState()) };
        const offset = report.sourceMusicAfterRestart.actual.time - saved.time;
        assert(offset >= -.1 && offset < 3, `Original source music restore offset: ${offset}`);
    }
    await inspect('original-mid-mission-after-full-restart');
    if (requiredHd.length) report.requiredHdAfterRestart = await requiredNativeHd(page, requiredHd, density);
    if (process.argv.includes('--observe-memory')) report.memoryAfterRestart = await nativeMemorySnapshot(app, page);
    if (weatherDuration) {
        report.weatherAfterRestart = await page.evaluate(() => window.__ra2debug.game.campaign.checkpointState().lightningStorms);
        assert.equal(report.weatherAfterRestart.length, 1); assert.equal(report.weatherAfterRestart[0].campaignDuration, weatherDuration);
        assert.equal(report.weatherAfterRestart[0].owner, null);
        assert.equal(report.weatherAfterRestart[0].manifestEndTimer, report.weatherBeforeSave[0].manifestEndTimer - 180);
    }
    if (process.argv.includes('--source-fullscreen')) {
        await observeSourceFullscreen(page);
        page.on('console', message => {
            if (message.text().includes('[original-paused-movie-proof]')) void page.screenshot({
                path: path.join(out, 'native-original-paused-movie.png') }).catch(() => {});
        });
    }
    report.continuation = await continueRecordedSource(page, source, goal);
    if (process.argv.includes('--source-fullscreen')) {
        report.sourceFullscreenAudit = await page.evaluate(() => window.__sourceFullscreenAudit);
        assert(report.sourceFullscreenAudit.length > 0, 'The original goal must actually trigger paused source media');
        for (const media of report.sourceFullscreenAudit) {
            assert(media.playback && media.ended, 'The original paused movie must decode and end naturally');
            assert.deepEqual(media.playback.before, media.playback.after, 'Source paused media must preserve actual turns, world and RNG');
            assert.equal(media.ended.tick, media.tick); assert.equal(media.ended.hash, media.hash); assert.deepEqual(media.ended.rng, media.rng);
            assert.equal(media.playback.worldInputEnabled, false); assert.equal(media.playback.campaignPaused, true);
            assert.equal(media.playback.music.gain, 0); assert(media.playback.volume > 0); assert.equal(media.playback.objectFit, 'contain');
        }
    }
    const state = await inspect('final'); assert.equal(state.result, expectedResult);
    assert.equal(state.tick, target.tick); assert.equal(state.hash, target.hash);
    report.goal = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { globals: c.globals?.snapshot(), viewBounds: c.checkpointState().viewBounds,
            originalGoalActions: [...c.definition.triggers.values()].filter(trigger => trigger.actions.some(action => [1, 2].includes(action.opcode)))
                .map(trigger => ({ id: trigger.id, fired: c.machine.states.get(trigger.id).fired, actions: trigger.actions })),
            sourceQuirks: c.sourceQuirks }; });
    assert(report.goal.originalGoalActions.some(trigger => trigger.fired > 0
        && trigger.actions.some(action => action.opcode === (expectedResult === 'victory' ? 1 : 2))));
    journal = await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands);
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr;
        m.setPaused(false); m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector(`[data-campaign-result=${expectedResult}][data-score-phase=complete]`, { timeout: 120000 });
    report.score = await page.locator('body').innerText(); report.result = { tick: state.tick, hash: state.hash, result: state.result };
    await page.screenshot({ path: path.join(out, `native-original-${expectedResult}.png`) });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = expectedResult === 'victory' ? 'PASS_NATIVE_RECORDED_ORIGINAL_GOAL_FULL_RESTART_AND_COMPLETE_SCORE'
        : 'PASS_NATIVE_RECORDED_ORIGINAL_DEFEAT_FULL_RESTART_AND_COMPLETE_SCORE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (error.nativeHdRows) report.requiredHdFailure = error.nativeHdRows;
    if (process.argv.includes('--observe-memory') && app && page) {
        report.memoryAtFailure = await nativeMemorySnapshot(app, page).catch(error => ({ error: error.message }));
    }
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    if (journal) await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(journal));
    await save(); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
