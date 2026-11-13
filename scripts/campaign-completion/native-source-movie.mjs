import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld } from '../m3-2/native-session.mjs';
import { replaySourcePrefix, continueRecordedSource } from './replay-source.mjs';

const argument = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const out = path.resolve(process.argv[2]), directory = path.resolve(argument('source'));
const prefix = argument('prefix'), target = argument('target'), movie = argument('movie'), trigger = argument('trigger');
assert(prefix && target && movie && trigger); await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(path.join(directory, 'report.json')));
source.appliedCommands = JSON.parse(await fs.readFile(path.join(directory, 'applied-command-journal.json')));
source.difficulty = source.identity.launch.difficulty;
assert(source.samples.findLast(sample => sample.label === target)?.sourceTrace
    .some(action => action.key === trigger && action.opcode === 100), 'The retained original trace must identify the actual movie trigger');
const report = { status: 'RUNNING', errors: [], failedResources: [], mission: source.identity.launch.mission, movie,
    scope: 'Actual original action-100 radar movie reached by re-executing ordinary recorded player orders in a fresh source world. No injected event, altered map/trigger/rule/objective or hidden initial save. The earlier reconstruction suppresses presentation only; the tested source action and its real media execute normally. This is media evidence, not a separate full-goal claim.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    report.replay = await replaySourcePrefix(page, source, prefix);
    report.continuation = await continueRecordedSource(page, source, target);
    await page.waitForSelector(`[data-sidebar-radar] [data-campaign-media=${movie}] video`, { timeout: 30000 });
    await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .4
        && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), movie, { timeout: 30000 });
    const before = await page.evaluate(() => { const d = window.__ra2debug;
        return { tick: d.game.currentTick, inputLocked: d.game.campaign.inputLocked,
            theme: d.game.campaign.definition.ini.getSection('Basic')?.getString('Theme', ''), music: d.music.getPlaybackState() }; });
    const tick = before.tick; report.before = before; await stepWorld(page, 30);
    report.playback = await page.evaluate(({ movie, trigger }) => {
        const d = window.__ra2debug, video = document.querySelector(`[data-campaign-media=${movie}] video`);
        const bounds = video.getBoundingClientRect(), radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            bounds: { width: bounds.width, height: bounds.height }, radar: { width: radar.width, height: radar.height },
            objectFit: getComputedStyle(video).objectFit, volume: video.volume,
            text: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent,
            tick: d.game.currentTick, music: d.music.getPlaybackState(), inputLocked: d.game.campaign.inputLocked,
            actions: d.game.campaign.trace.filter(action => action.key === trigger) };
    }, { movie, trigger });
    const playback = report.playback;
    assert.equal(playback.tick, tick + 30); assert(playback.text.trim() && playback.volume > 0);
    assert(playback.actions.some(action => action.opcode === 100 && action.tick > report.replay.tick));
    assert(playback.bounds.width <= playback.radar.width + 1); assert.deepEqual(playback.size, [140, 110]);
    assert(playback.objectFit === 'contain' || Math.abs(playback.bounds.width / playback.bounds.height - 140 / 110) < .02);
    if (before.music.playing) assert(playback.music.playing && playback.music.gain > 0 && playback.music.gain < .15);
    else { assert(/^(?:no theme|<none>)?$/i.test(before.theme)); assert(!playback.music.playing); }
    const sourceLocks = await page.evaluate(tick => window.__ra2debug.game.campaign.trace
        .filter(action => action.tick >= tick && [46, 47].includes(action.opcode)), tick);
    report.sourceLocksDuringPlayback = sourceLocks;
    if (!sourceLocks.length) assert.equal(playback.inputLocked, before.inputLocked);
    await page.screenshot({ path: path.join(out, 'native-original-' + movie + '-radar.png') });
    await page.waitForFunction(movie => !document.querySelector(`[data-campaign-media=${movie}]`), movie, { timeout: 45000 });
    report.after = await page.evaluate(() => ({ outcomes: window.__ra2debug.game.campaign.movieOutcomes,
        radarVisible: !!document.querySelector('[data-sidebar-radar]'), music: window.__ra2debug.music.getPlaybackState() }));
    assert(report.after.outcomes.some(outcome => outcome.id === movie && outcome.outcome === 'ended'));
    assert(report.after.radarVisible);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOURCE_RADAR_MOVIE_AND_NATURAL_RECOVERY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, movie, error: report.error, out }));
