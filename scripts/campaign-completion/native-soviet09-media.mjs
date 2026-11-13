import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const movie = 's09_p01e', trigger = '0A3CCF3C';
const report = { status: 'RUNNING', errors: [], failedResources: [], movie,
    scope: 'Fresh original Soviet 09 naturally reaches its 35-second President communication. Native decode, subtitles, radar aspect, original source input lock, continuing simulation, audio mixing and natural restoration are inspected. No injected media action, altered source/trigger/rule/objective or hidden initial save. This is the original scene, not full-goal or public-briefing evidence.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov09u.map'));
    await waitWorld(page, 'sov09u.map');
    const initial = await page.evaluate(() => window.__ra2debug.game.currentTick); assert(initial < 525);
    await stepWorld(page, 528 - initial);
    await page.waitForSelector(`[data-sidebar-radar] [data-campaign-media=${movie}] video`, { timeout: 30000 });
    await page.waitForFunction(movie => document.querySelector(`[data-campaign-media=${movie}] video`)?.currentTime > .4
        && document.querySelector(`[data-campaign-movie-subtitle=${movie}]`)?.textContent.trim(), movie, { timeout: 30000 });
    const tick = await page.evaluate(() => window.__ra2debug.game.currentTick); await stepWorld(page, 30);
    report.playback = await page.evaluate(({ movie, trigger }) => {
        const d = window.__ra2debug, video = document.querySelector(`[data-campaign-media=${movie}] video`);
        const bounds = video.getBoundingClientRect(), radar = video.closest('[data-sidebar-radar]').getBoundingClientRect();
        return { time: video.currentTime, duration: video.duration, size: [video.videoWidth, video.videoHeight],
            bounds: { width: bounds.width, height: bounds.height }, radar: { width: radar.width, height: radar.height },
            objectFit: getComputedStyle(video).objectFit, volume: video.volume,
            text: document.querySelector(`[data-campaign-movie-subtitle=${movie}]`).textContent,
            tick: d.game.currentTick, music: d.music.getPlaybackState(), inputLocked: d.game.campaign.inputLocked,
            actions: d.game.campaign.trace.filter(action => action.key === trigger), launch: d.game.campaign.launch };
    }, { movie, trigger });
    const p = report.playback; assert.equal(p.tick, tick + 30); assert(p.text.trim() && p.volume > 0);
    assert(p.actions.some(action => action.opcode === 100 && action.tick === 525));
    assert(p.bounds.width <= p.radar.width + 1); assert.deepEqual(p.size, [140, 110]);
    assert(p.objectFit === 'contain' || Math.abs(p.bounds.width / p.bounds.height - 140 / 110) < .02);
    assert(p.music.playing && p.music.gain > 0 && p.music.gain < .15);
    // The original map independently locks input until 65 seconds. The radar
    // movie does not own that lock or pause the simulation.
    assert(p.inputLocked); assert.equal(p.tick, 558);
    await page.screenshot({ path: path.join(out, 'native-original-s09_p01e-radar.png') });
    await page.waitForFunction(movie => !document.querySelector(`[data-campaign-media=${movie}]`), movie, { timeout: 45000 });
    report.after = await page.evaluate(() => ({ outcomes: window.__ra2debug.game.campaign.movieOutcomes,
        radarVisible: !!document.querySelector('[data-sidebar-radar]'), music: window.__ra2debug.music.getPlaybackState() }));
    assert(report.after.outcomes.some(outcome => outcome.id === movie && outcome.outcome === 'ended'));
    assert(report.after.radarVisible);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET09_PRESIDENT_RADAR_MOVIE_AND_NATURAL_RECOVERY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
