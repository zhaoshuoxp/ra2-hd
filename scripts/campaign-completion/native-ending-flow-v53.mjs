import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from './feedback-source-replay-v53.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const hd = process.argv.includes('--hd');
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 2);
assert([2, 4].includes(density));
const source = await readFeedbackSource(path.join(import.meta.dirname, 'fixtures/all03-source-commands-v17.json'));
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Shared ending lifecycle using the accepted original Allied03 ordinary-command route and its pinned legacy17 policy. Actual action100, original win and public Continue execute; the new opening demonstration has separate fresh-policy evidence.' };
let app, page;
try {
    const session = await campaignSession(out, report, { density, beforeCampaign: async ({ page }) => {
        await page.evaluate(hd => localStorage.setItem('_edition:ra2:ra2hd.hdMovies.v1', hd ? '1' : '0'), hd);
    } }); ({ app, page } = session);
    report.prefix = await replayFeedbackOpening(page, source, 19740);
    await page.evaluate(() => {
        window.__endingGame = window.__ra2debug.game;
        window.__endingCampaign = window.__endingGame.campaign;
        window.__endingTimes = {};
    });
    report.sourceMovie = await advanceFeedbackSource(page, 19760);
    const movie = page.locator('[data-sidebar-radar] [data-campaign-media="a03_p01e"] video');
    await movie.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-campaign-media="a03_p01e"] video')?.currentTime > .2);
    report.sourceMovieMedia = await movie.evaluate(video => ({ url: video.currentSrc, dimensions: [video.videoWidth, video.videoHeight],
        kind: video.parentElement.dataset.movieSource, time: video.currentTime }));
    assert.equal(report.sourceMovieMedia.kind, hd ? 'hd' : 'original');
    if (hd) assert.deepEqual(report.sourceMovieMedia.dimensions, [560, 440]);
    assert.equal(await page.locator('[data-campaign-media="a03_p01e"] button').count(), 0);
    await movie.evaluate(video => video.addEventListener('ended', () => window.__endingTimes.movieEnded = performance.now(), { once: true }));
    await page.screenshot({ path: path.join(out, 'native-source-ending-report.png') });
    report.goal = await advanceFeedbackSource(page, source.goal.tick);
    assert.equal(report.goal.result, 'victory'); assert.equal(report.goal.hash, source.goal.hash);
    report.deferredResult = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
        if (!g.campaign.result || !g.afterTickCallbacks.length) throw Error('Expected the actual source deferred result callback');
        const pending = g.afterTickCallbacks.length;
        manager.setPaused(false); manager.setCampaignPaused(false);
        try { manager.doGameTurn(performance.now()); }
        finally { manager.setPaused(true); manager.setCampaignPaused(true); }
        return { pending, tick: g.currentTick, status: g.status, endHandled: d.gameScreen.gameEndHandled };
    });
    assert(report.deferredResult.endHandled);
    report.retainedAtVictory = await page.evaluate(() => ({ sameWorld: window.__ra2debug.game === window.__endingGame,
        pending: window.__endingGame.campaign.captureMedia().movies,
        scoreVisible: !!document.querySelector('[data-campaign-result]') }));
    assert(report.retainedAtVictory.sameWorld && !report.retainedAtVictory.scoreVisible);
    assert(report.retainedAtVictory.pending.some(m => m.id === 'a03_p01e'));
    await page.waitForSelector('[data-campaign-result="victory"]', { timeout: 180000 });
    report.drained = await page.evaluate(() => ({ endedAt: window.__endingTimes.movieEnded, scoreAt: performance.now(),
        outcomes: window.__endingCampaign.movieOutcomes,
        attached: document.querySelectorAll('[data-campaign-media]').length }));
    assert(report.drained.endedAt > 0 && report.drained.scoreAt >= report.drained.endedAt);
    assert(report.drained.outcomes.some(m => m.id === 'a03_p01e' && m.outcome === 'ended')); assert.equal(report.drained.attached, 0);
    await page.screenshot({ path: path.join(out, 'native-score-after-report-ended.png') });
    await page.evaluate(() => {
        const audit = window.__nextMissionFrames = { frames: 0, selectionFrames: 0, startingFrames: 0, done: false };
        const frame = () => {
            if (audit.done) return; audit.frames++;
            const list = document.querySelector('[data-campaign-missions]');
            if (list && list.getBoundingClientRect().width > 0) audit.selectionFrames++;
            if (document.querySelector('[data-campaign-starting]')) audit.startingFrames++;
            requestAnimationFrame(frame);
        }; frame();
    });
    const continueLabel = session.labels['hd:campaigncontinuemission']; assert.equal(typeof continueLabel, 'string');
    await page.getByRole('button', { name: continueLabel, exact: true }).click();
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        const video = page.locator('[data-campaign-media] button');
        if (await video.count()) {
            await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .2);
            report.continueMovie = await page.evaluate(() => {
                const holder = document.querySelector('[data-campaign-media]'), video = holder.querySelector('video');
                return { id: holder.dataset.campaignMedia, kind: holder.dataset.movieSource, url: video.currentSrc,
                    dimensions: [video.videoWidth, video.videoHeight], time: video.currentTime };
            });
            assert.equal(report.continueMovie.kind, hd ? 'hd' : 'original');
            await page.screenshot({ path: path.join(out, 'native-continue-hd-opening.png') });
            await video.first().click();
        }
        if (await page.evaluate(() => window.__ra2debug.game?.campaign?.launch.mission === 'all04u.map'
            && !!window.__ra2debug.gameScreen?.playerUi)) break;
        await page.waitForTimeout(100);
    }
    await waitWorld(page, 'all04u.map');
    report.continue = await page.evaluate(() => {
        window.__nextMissionFrames.done = true;
        const g = window.__ra2debug.game;
        return { frames: window.__nextMissionFrames, launch: g.campaign.launch, oldWorldReleased: g !== window.__endingGame,
            duplicateObjectives: document.querySelectorAll('[data-campaign-objective]').length };
    });
    assert.equal(report.continue.frames.selectionFrames, 0); assert(report.continue.oldWorldReleased);
    assert.equal(report.continue.launch.difficulty, 'normal'); assert.equal(report.continue.duplicateObjectives, 0);
    await page.screenshot({ path: path.join(out, 'native-continued-allied04.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_SOURCE_ENDING_REPORT_DRAINS_BEFORE_SCORE_AND_CONTINUE_WITHOUT_SELECTION_FLASH';
    report.movieMode = hd ? 'hd' : 'original';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
