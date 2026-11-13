import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const [outArg, mission, movie, trigger] = process.argv.slice(2), out = path.resolve(outArg);
assert(/^(?:all|sov)\d{2}[tsu]\.map$/.test(mission) && /^[as]\d{2}_p\d{2}e$/.test(movie));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], mission, movie,
    scope: 'A fresh unchanged original mission naturally executes its opening Action100. Verify actual sidebar decode, subtitles, audio mix, continued simulation and natural radar restoration. Prepared launch omits pre-mission playback only; public Intro/Brief has separate evidence. No modified source, manufactured trigger, human orders or post-creation RNG edit.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission);
    report.initial = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { tick: g.currentTick, launch: g.campaign.launch, commands: g.campaign.journal.commands.length }; });
    assert.equal(report.initial.commands, 0);
    for (let tick = 0; tick < 1500 && !await page.locator(`[data-sidebar-radar] [data-campaign-media=${movie}]`).count(); tick += 15) {
        await stepWorld(page, 15); await page.waitForTimeout(20);
    }
    await page.waitForFunction(movie => document.querySelector(`[data-sidebar-radar] [data-campaign-media=${movie}] video`)?.currentTime > .5
        && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), movie);
    report.before = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), inputLocked: g.campaign.inputLocked,
            music: d.music.getPlaybackState(), theme: g.campaign.musicTheme }; });
    await stepWorld(page, 30);
    report.playback = await page.evaluate(({ movie, trigger }) => {
        const d = window.__ra2debug, g = d.game, host = document.querySelector('[data-sidebar-radar]');
        const element = host.querySelector(`[data-campaign-media=${movie}]`), video = element.querySelector('video');
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), actions: g.campaign.trace.filter(action => action.key === trigger),
            time: video.currentTime, duration: video.duration, volume: video.volume, size: [video.videoWidth, video.videoHeight],
            fit: getComputedStyle(video).objectFit, radar: host.getBoundingClientRect().toJSON(),
            rect: element.getBoundingClientRect().toJSON(), subtitle: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent,
            inputLocked: g.campaign.inputLocked, music: d.music.getPlaybackState() };
    }, { movie, trigger });
    const playback = report.playback;
    assert.equal(playback.tick, report.before.tick + 30); assert(playback.volume > 0 && playback.subtitle.trim());
    assert.deepEqual(playback.size, [140, 110]); assert.equal(playback.fit, 'contain');
    assert(playback.rect.width <= playback.radar.width + 1 && playback.rect.height <= playback.radar.height + 1);
    assert(playback.actions.some(action => action.opcode === 100));
    assert.equal(playback.inputLocked, report.before.inputLocked);
    if (report.before.music.playing) assert(playback.music.playing && playback.music.gain > 0 && playback.music.gain < .15);
    await page.screenshot({ path: path.join(out, 'native-original-opening-radar.png') });
    await page.waitForFunction(movie => !document.querySelector(`[data-campaign-media=${movie}]`), movie,
        { timeout: Math.ceil(playback.duration * 1000) + 5000 });
    report.after = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), outcomes: g.campaign.movieOutcomes,
            radarVisible: !!document.querySelector('[data-sidebar-radar]'), commands: g.campaign.journal.commands.length,
            failure: g.campaign.failure, music: d.music.getPlaybackState() }; });
    assert.equal(report.after.tick, playback.tick); assert.equal(report.after.commands, 0); assert(!report.after.failure);
    assert.equal(report.after.hash, playback.hash); assert.deepEqual(report.after.rng, playback.rng);
    assert(report.after.radarVisible && report.after.outcomes.some(outcome => outcome.id === movie && outcome.outcome === 'ended'));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_FRESH_ORIGINAL_RADAR_MOVIE_LIVE_SIMULATION_AND_NATURAL_RECOVERY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
