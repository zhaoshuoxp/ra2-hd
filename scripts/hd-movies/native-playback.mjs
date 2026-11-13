import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, stepWorld, waitWorld, root } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';

const out = path.resolve(process.argv[2]), edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const hd = process.argv.includes('--hd'), expectedKind = hd ? 'hd' : 'original';
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 2);
assert([0, 2, 4].includes(density));
const mission = edition === 'yr' ? 'sov03umd.map' : 'sov03u.map';
const expectedTriggers = edition === 'yr' ? ['0D1DACFC', '0D1DA24C'] : ['0A3A685C'];
await fs.mkdir(out, { recursive: false });
const built = JSON.parse(await fs.readFile(path.join(root, 'desktop/app-files.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'RUNNING', phase: 'startup', edition, mission, errors: [], failedResources: [],
    build: await Promise.all(built.filter(file => file.startsWith('dist/assets/') && file.endsWith('.js'))
        .map(async file => ({ file, sha256: hash(await fs.readFile(path.join(root, file))) }))),
    scope: 'Native current-main original streaming regression. Original opening and real source radar actions use unmodified maps and normal source turns. Observer bursts accelerate source ticks without changing actors, RNG or triggers. A named save restarts the process with active radar media. Independent missing-HD decoder probes are labeled separately and do not establish native story triggers or HD visual quality.',
    hdVisualAcceptance: hd ? 'REPRESENTATIVE_NATURAL_DIRECTION_ACCEPTED_FINAL_FILM_REVIEW_PENDING' : 'ORIGINAL_FALLBACK_REGRESSION',
    mode: expectedKind, artworkDensity: density, windows: 'NOT_RUN_ON_THIS_MAC' };
if (hd) report.scope = report.scope.replace('original streaming regression', 'HD streaming integration')
    .replace('Original opening', 'Selected HD opening');
let session;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function phase(value) { report.phase = value; await save(); }
async function state() {
    return session.page.evaluate(() => {
        const d = window.__ra2debug, screen = d.gameScreen, player = screen?.campaignMediaPlayer;
        const current = player?.current, video = current?.video, radar = screen?.hud?.getCampaignRadarHost();
        const quality = video?.getVideoPlaybackQuality();
        return { tick: d.game?.currentTick, hash: d.game?.getHash(), pending: player?.snapshot(),
            current: current && { id: current.request.id, kind: current.source?.kind, url: video.currentSrc || video.src,
                time: current.time(), mediaTime: video.currentTime, duration: video.duration,
                dimensions: [video.videoWidth, video.videoHeight], volume: video.volume, paused: video.paused,
                fit: getComputedStyle(video).objectFit, rate: video.playbackRate,
                attachedToRadar: video.parentElement?.parentElement === radar,
                totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames,
                audioDecodedBytes: video.webkitAudioDecodedByteCount },
            actions: d.game?.campaign.trace.filter(action => [10, 100, 117].includes(action.opcode)),
            holders: document.querySelectorAll('[data-campaign-media]').length,
            captions: document.querySelectorAll('[data-campaign-movie-subtitle]').length,
            subtitle: current && { text: document.querySelector(`[data-campaign-movie-subtitle="${current.request.id}"]`)?.textContent,
                expected: current.request.subtitles?.find(cue => cue.start <= current.time() && current.time() < cue.end)?.text ?? '',
                cueCount: current.request.subtitles?.length ?? 0, strategy: current.source?.subtitleStrategy },
            heapBytes: performance.memory?.usedJSHeapSize, music: d.music?.getPlaybackState() };
    });
}
try {
    session = await campaignSession(out, report, { edition, density,
        beforeCampaign: async ({ page }) => page.evaluate(({ hd, edition }) => {
            localStorage.setItem(`_edition:${edition}:ra2hd.hdMovies.v1`, hd ? '1' : '0');
            const clips = window.__m34MovieFrames = [], attached = new WeakSet();
            new MutationObserver(() => {
                for (const video of document.querySelectorAll('[data-campaign-media] video')) {
                    if (attached.has(video)) continue;
                    attached.add(video);
                    const row = { id: video.parentElement.dataset.campaignMedia, requestedAt: performance.now() };
                    clips.push(row);
                    video.addEventListener('loadedmetadata', () => { row.metadataMs = performance.now() - row.requestedAt; }, { once: true });
                    video.requestVideoFrameCallback(() => { row.firstFrameMs = performance.now() - row.requestedAt; row.url = video.currentSrc; });
                }
            }).observe(document.body, { childList: true, subtree: true });
        }, { hd, edition }),
        observeIntroduction: async ({ page }) => {
            await page.waitForFunction(() => document.querySelector('[data-campaign-media$="-introduction"] video')?.currentTime > .4);
            report.introduction = await page.evaluate(() => {
                const video = document.querySelector('[data-campaign-media$="-introduction"] video');
                return { url: video.currentSrc, dimensions: [video.videoWidth, video.videoHeight],
                    time: video.currentTime, fit: getComputedStyle(video).objectFit, frameMetrics: window.__m34MovieFrames };
            });
            assert(report.introduction.url.startsWith('ra2://game/local-'));
            if (hd) assert(report.introduction.url.startsWith('ra2://game/local-hd-movies/'));
        } });
    await phase(expectedKind + '-premission-opening-and-skip');
    const launching = session.page.evaluate(mission => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = 'easy'; return screen.launchPrepared(mission, undefined, { originalOpening: true });
    }, mission);
    await session.page.waitForFunction(() => document.querySelector('[data-campaign-media=s03_f00e] video')?.currentTime > .6);
    report.opening = await session.page.evaluate(() => {
        const video = document.querySelector('[data-campaign-media=s03_f00e] video');
        return { url: video.currentSrc, dimensions: [video.videoWidth, video.videoHeight],
            source: video.parentElement.dataset.movieSource, fit: getComputedStyle(video).objectFit,
            frameMetrics: window.__m34MovieFrames };
    });
    assert.equal(report.opening.source, expectedKind); assert(!report.opening.url.startsWith('blob:'));
    if (hd) assert.deepEqual(report.opening.dimensions, [1440, 1080]);
    await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
    await session.page.waitForTimeout(500);
    report.fullscreenWindow = await session.page.evaluate(() => {
        const holder = document.querySelector('[data-campaign-media=s03_f00e]'), video = holder.querySelector('video');
        const bounds = holder.getBoundingClientRect();
        // innerWidth/innerHeight are integer-rounded; at fractional display
        // scales (Windows 150%) the exact viewport is visualViewport's size.
        return { viewport: [visualViewport?.width ?? innerWidth, visualViewport?.height ?? innerHeight],
            roundedViewport: [innerWidth, innerHeight], holder: [bounds.width, bounds.height],
            fit: getComputedStyle(video).objectFit, time: video.currentTime, width: video.videoWidth, height: video.videoHeight };
    });
    assert.deepEqual(report.fullscreenWindow.holder, report.fullscreenWindow.viewport);
    assert.equal(report.fullscreenWindow.fit, 'contain');
    await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await session.page.waitForTimeout(500);
    await session.page.screenshot({ path: path.join(out, 'native-' + expectedKind + '-fullscreen.png') });
    await session.page.locator('[data-campaign-media=s03_f00e] button').click(); await launching; await waitWorld(session.page, mission);
    await phase('unchanged-source-radar-actions');
    await stepWorld(session.page, edition === 'yr' ? 540 : 1350);
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.current?.video.readyState >= 2
        && window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.currentTime > .4, undefined, { timeout: 45000 });
    report.radar = await state();
    assert(report.radar.current.attachedToRadar); assert.equal(report.radar.current.kind, expectedKind);
    if (hd) assert.deepEqual(report.radar.current.dimensions, [560, 440]);
    assert(!report.radar.current.url.startsWith('blob:')); assert.equal(report.radar.current.fit, 'contain');
    assert(expectedTriggers.every(trigger => report.radar.actions.some(action => action.key === trigger && action.opcode === 100)));
    await session.page.waitForFunction(() => {
        const current = window.__ra2debug.gameScreen.campaignMediaPlayer.current;
        const text = current?.request.subtitles?.find(cue => cue.start <= current.time() && current.time() < cue.end)?.text;
        return !!text && document.querySelector(`[data-campaign-movie-subtitle="${current.request.id}"]`)?.textContent === text;
    });
    report.radarCaptions = await state();
    assert(report.radarCaptions.subtitle.cueCount > 0 && report.radarCaptions.subtitle.text);
    assert.equal(report.radarCaptions.subtitle.text, report.radarCaptions.subtitle.expected);
    assert(report.radarCaptions.current.audioDecodedBytes > 0);
    await session.page.screenshot({ path: path.join(out, 'native-source-radar-playing.png') });
    await session.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.paused);
    report.menuPaused = await state(); await session.page.waitForTimeout(350); report.menuAfter = await state();
    assert(Math.abs(report.menuPaused.current.time - report.menuAfter.current.time) < .05);
    report.independentVoiceMixer = await session.page.evaluate(async () => {
        const screen = window.__ra2debug.gameScreen, mixer = screen.mixer;
        const before = { voice: mixer.getVolume(4), muted: mixer.isMuted(4) };
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        mixer.setMuted(4, false); mixer.setVolume(4, .37); await nextFrame();
        const changed = screen.campaignMediaPlayer.current.video.volume;
        const expected = mixer.isMuted(0) ? 0 : mixer.getVolume(0) * .37;
        mixer.setMuted(4, true); await nextFrame(); const muted = screen.campaignMediaPlayer.current.video.volume;
        mixer.setVolume(4, before.voice); mixer.setMuted(4, before.muted); await nextFrame();
        return { before, changed, expected, muted, restored: screen.campaignMediaPlayer.current.video.volume };
    });
    assert(Math.abs(report.independentVoiceMixer.changed - report.independentVoiceMixer.expected) < 1e-8);
    assert.equal(report.independentVoiceMixer.muted, 0);
    await session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 900));
    report.resized = await state(); assert(report.resized.current.attachedToRadar);
    await session.page.screenshot({ path: path.join(out, 'native-source-radar.png') });
    await phase('active-radar-named-save-and-process-restart');
    session = await namedSaveRestart(session, out, report, `M3.4 ${edition} ${expectedKind} streamed radar`, stepWorld,
        async (restored, checkpoint) => {
            session = restored; report.savedMedia = checkpoint.presentation.movies;
            await session.page.waitForFunction(time => {
                const current = window.__ra2debug.gameScreen.campaignMediaPlayer.current;
                return current?.video.readyState >= 2 && current.time() >= time;
            }, checkpoint.presentation.movies[0].time, { timeout: 45000 });
            report.restoredMedia = await state();
            assert.equal(report.restoredMedia.current.id, checkpoint.presentation.movies[0].id);
            assert.equal(report.restoredMedia.current.kind, expectedKind);
            assert(report.restoredMedia.current.time < checkpoint.presentation.movies[0].time + 1.5);
            assert(!report.restoredMedia.current.url.startsWith('blob:'));
        });
    await phase('natural-radar-queue-drain');
    await session.page.waitForFunction(() => !window.__ra2debug.gameScreen.campaignMediaPlayer.pending.length, undefined, { timeout: 90000 });
    report.drained = await state(); assert.equal(report.drained.holders, 0); assert.equal(report.drained.captions, 0);
    await session.page.screenshot({ path: path.join(out, 'native-radar-restored-after-drain.png') });
    await phase('independent-repeat-queue-and-cancel');
    report.independentQueue = await session.page.evaluate(async () => {
        const d = window.__ra2debug, player = d.gameScreen.campaignMediaPlayer, assets = d.gameScreen.campaignMovieAssets;
        const source = assets.sources.get('s03_p01e');
        const request = id => ({ id, url: source.url, source: source.source, placement: 'transmission', skipLabel: 'Skip' });
        const first = player.play(request('m34-independent-repeat')), duplicate = player.play(request('m34-independent-repeat'));
        const next = player.play(request('m34-independent-queued'));
        const samePromise = first === duplicate, pending = player.snapshot();
        player.cancel();
        return { samePromise, pending, outcomes: await Promise.all([first, duplicate, next]),
            remaining: player.snapshot(), recorded: player.outcomes.filter(row => row.id.startsWith('m34-independent-')) };
    });
    assert(report.independentQueue.samePromise); assert.equal(report.independentQueue.pending.length, 2);
    assert.deepEqual(report.independentQueue.outcomes, ['cancelled', 'cancelled', 'cancelled']);
    assert.equal(report.independentQueue.recorded.length, 2); assert.deepEqual(report.independentQueue.remaining, []);
    await phase('independent-decoder-failure-fallback-probes');
    for (const placement of ['transmission', 'fullscreen']) {
        const id = 'm34-independent-' + placement;
        await session.page.evaluate(({ id, placement }) => {
            const d = window.__ra2debug, player = d.gameScreen.campaignMediaPlayer;
            const original = d.gameScreen.campaignMovieAssets.sources.get('s03_p01e').url;
            window.__m34Probe = player.play({ id, placement, url: original, startTime: 2, skipLabel: 'Skip',
                source: async () => ({ url: '/local-movies/m34-intentional-missing-' + placement + '.webm', kind: 'hd',
                    fallback: async () => ({ url: original, kind: 'original' }) }) });
        }, { id, placement });
        await session.page.waitForFunction(id => {
            const element = document.querySelector(`[data-campaign-media="${id}"]`), video = element?.querySelector('video');
            return element?.dataset.movieFallback === 'original' && video?.currentTime > 2.3;
        }, id, { timeout: 30000 });
        (report.independentFallbacks ??= []).push(await state());
        if (placement === 'fullscreen') await session.page.locator(`[data-campaign-media="${id}"] button`).click();
        const outcome = await session.page.evaluate(() => window.__m34Probe);
        assert.equal(outcome, placement === 'fullscreen' ? 'skipped' : 'ended');
        const outcomes = await session.page.evaluate(id => window.__ra2debug.gameScreen.campaignMediaPlayer.outcomes.filter(outcome => outcome.id === id), id);
        assert.equal(outcomes.length, 1);
    }
    await phase('independent-unsupported-codec-fallback');
    await session.page.evaluate(() => {
        const d = window.__ra2debug, player = d.gameScreen.campaignMediaPlayer;
        const original = d.gameScreen.campaignMovieAssets.sources.get('s03_p01e').url;
        window.__m34InvalidCodec = URL.createObjectURL(new Blob(['intentional-invalid-video-codec-fixture'], { type: 'video/mp4' }));
        window.__m34CodecProbe = player.play({ id: 'm34-independent-unsupported-codec', placement: 'transmission',
            url: original, startTime: 2, skipLabel: 'Skip', source: async () => ({ url: window.__m34InvalidCodec, kind: 'hd',
                fallback: async () => ({ url: original, kind: 'original' }) }) });
    });
    await session.page.waitForFunction(() => {
        const holder = document.querySelector('[data-campaign-media="m34-independent-unsupported-codec"]');
        return holder?.dataset.movieFallback === 'original' && holder.querySelector('video')?.currentTime > 2.3;
    }, undefined, { timeout: 30000 });
    report.independentCodecFallback = await state();
    assert.equal(await session.page.evaluate(() => window.__m34CodecProbe), 'ended');
    assert.equal(await session.page.evaluate(() => window.__ra2debug.gameScreen.campaignMediaPlayer.outcomes
        .filter(row => row.id === 'm34-independent-unsupported-codec').length), 1);
    await session.page.evaluate(() => URL.revokeObjectURL(window.__m34InvalidCodec));
    await phase('normal-mission-exit-and-release');
    await session.page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m34Release = { player: d.gameScreen.campaignMediaPlayer, assets: d.gameScreen.campaignMovieAssets, scene: d.worldScene };
    });
    await session.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await session.page.getByRole('button', { name: session.labels['gui:abortmission'], exact: true }).click();
    await session.page.getByRole('button', { name: session.labels['gui:quit'], exact: true }).click();
    await session.page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    report.release = await session.page.evaluate(() => {
        const audit = window.__m34Release, d = window.__ra2debug;
        return { pending: audit.player.pending, disposed: audit.player.disposed, sources: audit.assets.sources.size,
            sceneActive: d.renderer.getScenes().includes(audit.scene), holders: document.querySelectorAll('[data-campaign-media]').length,
            captions: document.querySelectorAll('[data-campaign-movie-subtitle]').length, heapBytes: performance.memory?.usedJSHeapSize };
    });
    assert(report.release.disposed && !report.release.sceneActive); assert.equal(report.release.sources, 0);
    assert.equal(report.release.holders, 0); assert.equal(report.release.captions, 0); assert.deepEqual(report.release.pending, []);
    const expectedFailure = /^ra2:\/\/game\/local-movies\/m34-intentional-missing-(transmission|fullscreen)\.webm$/;
    report.expectedFailedResources = report.failedResources.filter(([url]) => expectedFailure.test(url));
    assert.equal(report.expectedFailedResources.length, 2);
    assert.deepEqual(report.failedResources.filter(([url]) => !expectedFailure.test(url)), []); assert.deepEqual(report.errors, []);
    report.status = hd ? 'PASS_NATIVE_HD_OPENING_RADAR_SAVE_RESTART_FALLBACK_AND_RELEASE'
        : 'PASS_NATIVE_STREAMED_ORIGINAL_OPENING_RADAR_SAVE_RESTART_FALLBACK_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    report.failureState = await state().catch(() => undefined);
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await session?.app.close(); }
console.log(JSON.stringify({ status: report.status, phase: report.phase, out, error: report.error }));
