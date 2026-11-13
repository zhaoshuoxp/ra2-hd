// Actual accepted ordinary-command victory, original Win and PostScore movie routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { campaignSession } from '../m3-2/native-session.mjs';
import { readFeedbackSource, replayFeedbackOpening, advanceFeedbackSource } from '../campaign-completion/feedback-source-replay-v53.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const hd = !process.argv.includes('--original'), expectedKind = hd ? 'hd' : 'original';
const source = await readFeedbackSource(path.join(import.meta.dirname, '../campaign-completion/fixtures/all12-source-commands-v26.json'));
const report = { status: 'RUNNING', errors: [], failedResources: [], movieMode: expectedKind,
    scope: 'Accepted Allied12 legacy26 initial identity and ordinary player journal reconstruct the original victory hash. Real Win and PostScore sequences use the selected HD files. Accelerated observer turns do not change actors, rules, objectives or RNG. This is a media lifecycle regression, not a new complete-campaign acceptance.',
    windows: 'NOT_RUN_ON_THIS_MAC' };
let session;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    session = await campaignSession(out, report, { density: 2, beforeCampaign: async ({ page }) => {
        await page.evaluate(hd => localStorage.setItem('_edition:ra2:ra2hd.hdMovies.v1', hd ? '1' : '0'), hd);
    } });
    const { page } = session;
    report.prefix = await replayFeedbackOpening(page, source, 14938);
    await page.evaluate(() => {
        window.__m34FinalWorld = window.__ra2debug.game;
        window.__m34FinalMovies = [];
        const observed = new WeakSet();
        new MutationObserver(() => {
            for (const holder of document.querySelectorAll('[data-campaign-media]')) {
                const video = holder.querySelector('video');
                if (!video || observed.has(video)) continue;
                observed.add(video);
                const row = { id: holder.dataset.campaignMedia, requestedAt: performance.now() };
                window.__m34FinalMovies.push(row);
                video.addEventListener('loadeddata', () => Object.assign(row, { kind: holder.dataset.movieSource,
                    url: video.currentSrc, dimensions: [video.videoWidth, video.videoHeight] }), { once: true });
                video.addEventListener('timeupdate', () => {
                    row.audioDecodedBytes = Math.max(row.audioDecodedBytes ?? 0, video.webkitAudioDecodedByteCount);
                });
                video.addEventListener('ended', () => { row.endedAt = performance.now(); }, { once: true });
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
    report.goal = await advanceFeedbackSource(page, source.goal.tick);
    assert.equal(report.goal.result, 'victory'); assert.equal(report.goal.hash, source.goal.hash);
    report.resultCallback = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
        if (!g.afterTickCallbacks.length) throw Error('Original deferred victory callback is absent');
        manager.setPaused(false); manager.setCampaignPaused(false);
        try { manager.doGameTurn(performance.now()); }
        finally { manager.setPaused(true); manager.setCampaignPaused(true); }
        return { tick: g.currentTick, status: g.status, handled: d.gameScreen.gameEndHandled };
    });
    assert(report.resultCallback.handled); await save();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media="a13_f01e"] video')?.currentTime > .5,
        undefined, { timeout: 120000 });
    report.win = await page.evaluate(() => {
        const holder = document.querySelector('[data-campaign-media="a13_f01e"]'), video = holder.querySelector('video');
        return { id: holder.dataset.campaignMedia, kind: holder.dataset.movieSource, url: video.currentSrc,
            dimensions: [video.videoWidth, video.videoHeight], time: video.currentTime };
    });
    assert.equal(report.win.kind, expectedKind); assert.deepEqual(report.win.dimensions, hd ? [1440, 1080] : [640, 480]);
    await page.screenshot({ path: path.join(out, 'native-original-victory-hd-win-movie.png') });
    await page.waitForSelector('[data-campaign-result="victory"]', { timeout: 120000 });
    report.score = await page.evaluate(() => ({ movies: window.__m34FinalMovies,
        holders: document.querySelectorAll('[data-campaign-media]').length,
        outcomes: window.__m34FinalWorld.campaign.movieOutcomes }));
    const win = report.score.movies.find(row => row.id === 'a13_f01e');
    assert(win?.endedAt && win.audioDecodedBytes > 0); assert.equal(report.score.holders, 0);
    await page.screenshot({ path: path.join(out, 'native-final-victory-score.png') });
    // Final campaigns expose Return rather than a next mission; PostScore follows this public action.
    const returnLabel = session.labels['hd:campaignreturnselection']; assert.equal(typeof returnLabel, 'string');
    report.scoreAction = returnLabel;
    await page.getByRole('button', { name: returnLabel, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media="a13_f02e"] video')?.currentTime > .5,
        undefined, { timeout: 60000 });
    report.postScore = await page.evaluate(() => {
        const holder = document.querySelector('[data-campaign-media="a13_f02e"]'), video = holder.querySelector('video');
        return { id: holder.dataset.campaignMedia, kind: holder.dataset.movieSource, url: video.currentSrc,
            dimensions: [video.videoWidth, video.videoHeight], time: video.currentTime };
    });
    assert.equal(report.postScore.kind, expectedKind); assert.deepEqual(report.postScore.dimensions, hd ? [1440, 1080] : [640, 480]);
    await page.screenshot({ path: path.join(out, 'native-final-post-score-hd.png') });
    await page.waitForSelector('[data-campaign-ready="true"]', { timeout: 90000 });
    report.returned = await page.evaluate(() => ({ movies: window.__m34FinalMovies,
        holders: document.querySelectorAll('[data-campaign-media]').length,
        captions: document.querySelectorAll('[data-campaign-movie-subtitle]').length }));
    assert(report.returned.movies.find(row => row.id === 'a13_f02e')?.endedAt);
    assert.equal(report.returned.holders, 0); assert.equal(report.returned.captions, 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_VICTORY_HASH_' + expectedKind.toUpperCase() + '_WIN_AND_POST_SCORE_NATURAL_END_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
