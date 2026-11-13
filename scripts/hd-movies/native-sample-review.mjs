// Independent short-sample preview in the actual HUD; never an original-trigger acceptance claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { campaignSession, waitWorld, root } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), selection = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const timings = JSON.parse(execFileSync('bun', ['-e',
    "import {campaignSubtitleTimings} from './src/gui/campaign/CampaignSubtitleTracks'; console.log(JSON.stringify(campaignSubtitleTimings))"],
    { cwd: root, encoding: 'utf8' }));
const report = { status: 'RUNNING', errors: [], failedResources: [], clips: [],
    scope: 'Independent source/candidate media probes on the actual fullscreen and sidebar radar surfaces. Source simulation is paused; no mission trigger or action is manufactured. Small reviewed sample buffers use temporary Blob URLs in this QA harness only. Production full movies retain the streaming registry.',
    userVisualAcceptance: 'PENDING', completeHdMovies: 0, productionPackSelected: false, windows: 'NOT_RUN_ON_THIS_MAC' };
let session;
try {
    for (const edition of ['ra2', 'yr'].filter(edition => Object.keys(selection).some(identity => identity.startsWith(edition + ':')))) {
        const folder = path.join(out, edition); await fs.mkdir(folder);
        session = await campaignSession(folder, report, { edition, density: 2 });
        const mission = edition === 'yr' ? 'sov03umd.map' : 'sov03u.map';
        await session.page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
        await waitWorld(session.page, mission);
        const before = await session.page.evaluate(() => {
            const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setPaused(true);
            return { tick: d.game.currentTick, hash: d.game.getHash() };
        });
        for (const [identity, sample] of Object.entries(selection).filter(([identity]) => identity.startsWith(edition + ':'))) {
            const sourceTime = sample.sourceStart, captionKey = (edition === 'yr' ? 'yr_' : '') + identity.split(':')[1];
            const cues = (timings[captionKey] ?? []).filter(cue => cue.start < sourceTime + sample.length && cue.end > sourceTime)
                .map(cue => ({ ...cue, start: Math.max(0, cue.start - sourceTime), end: Math.min(sample.length, cue.end - sourceTime) }));
            for (const kind of ['original', 'candidate']) {
                const file = path.resolve(kind === 'original' ? sample.original : sample.file), bytes = await fs.readFile(file);
                const id = 'm34-preview-' + edition + '-' + identity.split(':')[1] + '-' + kind;
                const placement = sample.placement === 'radar' ? 'transmission' : 'fullscreen';
                await session.page.evaluate(({ id, kind, placement, data, cues }) => {
                    const d = window.__ra2debug, strings = d.gameScreen.strings;
                    const decoded = atob(data), bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
                    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
                    window.__m34SampleUrl = url;
                    const stats = window.__m34SampleStats = { requestedAt: performance.now(), presented: [], firstFrameMs: null };
                    window.__m34SamplePlayback = d.gameScreen.campaignMediaPlayer.play({ id, url, placement,
                        skipLabel: 'Skip', source: async () => ({ url, kind: kind === 'candidate' ? 'hd' : 'original' }),
                        subtitles: cues.map(cue => ({ start: cue.start, end: cue.end, text: strings.get(cue.key) })) });
                    const video = d.gameScreen.campaignMediaPlayer.current.video;
                    const frame = (now, metadata) => {
                        stats.firstFrameMs ??= now - stats.requestedAt;
                        stats.presented.push(metadata.mediaTime);
                        const quality = video.getVideoPlaybackQuality();
                        stats.totalFrames = quality.totalVideoFrames; stats.droppedFrames = quality.droppedVideoFrames;
                        stats.callback = video.requestVideoFrameCallback(frame);
                    };
                    stats.callback = video.requestVideoFrameCallback(frame);
                    window.__m34SampleVideo = video;
                }, { id, kind, placement, data: bytes.toString('base64'), cues });
                await session.page.waitForFunction(id => {
                    const current = window.__ra2debug.gameScreen.campaignMediaPlayer.current;
                    return current?.request.id === id && current.video.currentTime > .35;
                }, id, { timeout: 30000 });
                const state = await session.page.evaluate(() => {
                    const d = window.__ra2debug, screen = d.gameScreen, current = screen.campaignMediaPlayer.current;
                    const video = current.video, frame = new VideoFrame(video), colorSpace = frame.colorSpace.toJSON(); frame.close();
                    const quality = video.getVideoPlaybackQuality();
                    const bounds = element => { const rect = element?.getBoundingClientRect();
                        return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
                    return { id: current.request.id, placement: current.request.placement, time: video.currentTime,
                        size: [video.videoWidth, video.videoHeight], fit: getComputedStyle(video).objectFit, colorSpace,
                        volume: video.volume, subtitles: current.request.subtitles.length,
                        videoBounds: bounds(video), radarBounds: bounds(screen.hud.getCampaignRadarHost()),
                        viewport: [innerWidth, innerHeight],
                        attachedToRadar: video.parentElement.parentElement === screen.hud.getCampaignRadarHost(),
                        totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames };
                });
                assert.equal(state.fit, 'contain'); assert.equal(state.attachedToRadar, placement === 'transmission');
                assert.deepEqual(state.colorSpace, { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
                const screenshot = edition + '-' + identity.split(':')[1] + '-' + kind + '.png';
                await session.page.screenshot({ path: path.join(out, screenshot) });
                assert.equal(await session.page.evaluate(() => window.__m34SamplePlayback), 'ended');
                const playback = await session.page.evaluate(() => {
                    const stats = window.__m34SampleStats, video = window.__m34SampleVideo;
                    video.cancelVideoFrameCallback(stats.callback);
                    URL.revokeObjectURL(window.__m34SampleUrl);
                    delete window.__m34SampleUrl; delete window.__m34SampleVideo; delete stats.callback;
                    return { ...stats, releasedSrc: video.getAttribute('src'), readyState: video.readyState };
                });
                assert.equal(playback.releasedSrc, null);
                report.clips.push({ identity, kind, file, bytes: bytes.length,
                    sha256: createHash('sha256').update(bytes).digest('hex'), screenshot, ...state, playback });
            }
        }
        const after = await session.page.evaluate(() => {
            const d = window.__ra2debug;
            return { tick: d.game.currentTick, hash: d.game.getHash(), pending: d.gameScreen.campaignMediaPlayer.pending,
                holders: document.querySelectorAll('[data-campaign-media]').length,
                captions: document.querySelectorAll('[data-campaign-movie-subtitle]').length };
        });
        assert.equal(after.tick, before.tick); assert.equal(after.hash, before.hash);
        assert.deepEqual(after.pending, []); assert.equal(after.holders, 0); assert.equal(after.captions, 0);
        await session.app.close(); session = undefined;
    }
    assert.equal(report.clips.length, Object.keys(selection).length * 2);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_INDEPENDENT_NATIVE_SHORT_SAMPLES_FULLSCREEN_RADAR_CAPTIONS_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, clips: report.clips.length, out, error: report.error }));
