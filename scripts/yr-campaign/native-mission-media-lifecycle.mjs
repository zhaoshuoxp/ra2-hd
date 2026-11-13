import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, stepWorld, waitWorld, root } from '../m3-2/native-session.mjs';
import { namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';

const out = path.resolve(process.argv[2]);
const language = process.argv.find(value => value.startsWith('--language='))?.slice(11) ?? 'en-US';
assert(['en-US', 'zh-CN', 'zh-TW'].includes(language));
const sourceQueue = process.argv.includes('--source-queue');
const activeMovie = sourceQueue ? 's03_p01e' : 's03_p02e';
const expectedMovies = sourceQueue ? ['s03_p01e','s03_p02e'] : ['s03_p02e'];
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', phase: 'startup', language, errors: [], failedResources: [],
    scope: 'Fresh prepared original YR Soviet03, original briefing skip, actual sequential timed radar requests, menu pause/resume, voice mixing, radar resize, active-media named save/process restart, natural queue drain and normal abort release. Source ticks are advanced through the normal turn manager for observation; no scripted seeking, forced endings or playback-rate changes are used. Standard restoration seeks to its saved timestamp. Source maps/rules/actors/triggers are never changed. Public campaign availability remains unchanged.',
    mission: 'sov03umd.map', sourceSha256: 'df69d0f63f982823bb5818d3d49776028a719a2c20ced2526fab8f5cecb49fe6',
    sourceMovieTriggers: ['0D1DACFC', '0D1DA24C'], missionMedia: [],
    timingScope: sourceQueue ? 'A single observer burst advances 540 normal source turns before yielding to media rendering. Both original Action100 requests therefore coexist in the real player queue. This exercises native queue behavior under accelerated observation; no pristine-retail wall-clock timing claim is made.'
        : 'Original requests are observed sequentially, with the first clip naturally completed before advancing the later source timer. This case does not claim simultaneous queue coverage.' };
let session, stopMedia;
const save = () => fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2)+'\n');
async function phase(value) { report.phase = value; await save(); }
async function retainMedia(label) {
    if (!stopMedia) return;
    const stop = stopMedia; stopMedia = undefined;
    report.missionMedia.push({ phase: label, ...await stop() });
}
async function state() {
    return session.page.evaluate(() => {
        const d = window.__ra2debug, screen = d.gameScreen, player = screen.campaignMediaPlayer;
        const current = player?.current, video = current?.video, radar = screen.hud?.getCampaignRadarHost();
        return { tick: d.game.currentTick, hash: d.game.getHash(), pending: player?.snapshot(),
            menu: !!screen.menu?.getCurrentScreen(), mediaPaused: screen.campaignMediaPaused,
            inputLocked: d.game.campaign.inputLocked, failure: d.game.campaign.failure, result: d.game.campaign.result,
            current: current && { id: current.request.id, time: video.currentTime, duration: video.duration,
                paused: video.paused, rate: video.playbackRate, readyState: video.readyState,
                volume: video.volume, muted: video.muted, attachedToCurrentRadar: video.parentElement.parentElement === radar,
                size: [video.videoWidth, video.videoHeight] },
            movieHolders: document.querySelectorAll('[data-campaign-media]').length,
            movieCaptions: document.querySelectorAll('[data-campaign-movie-subtitle]').length,
            speechPaused: screen.campaignSpeech?.paused, music: d.music?.getPlaybackState(),
            triggers: [...d.game.campaign.machine.states].filter(([id]) => ['0D1DACFC', '0D1DA24C'].includes(id)),
            trace: d.game.campaign.trace.filter(action => ['0D1DACFC', '0D1DA24C'].includes(action.key)) };
    });
}
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 0 });
    if (await session.page.evaluate(() => document.documentElement.lang) !== language) {
        await session.page.evaluate(language => localStorage.setItem('ra2hd.interfaceLanguage', language), language);
        await session.page.reload();
        if (await session.page.locator('[data-edition=yr]').count()) await session.page.locator('[data-edition=yr]').click();
        await session.page.waitForFunction(language => document.documentElement.lang === language
            && !!window.__ra2debug?.mainMenuController, language, { timeout: 90000 });
        session.labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-yr-${language}.json`))).labels,
            ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
        await session.page.getByRole('button', { name: session.labels['hd:menucampaign'], exact: true }).click();
        await session.page.waitForFunction(() => document.querySelector('[data-campaign-ready=true]')
            || document.querySelector('[data-campaign-media$="-introduction"] video'));
        if (await session.page.locator('[data-campaign-media$="-introduction"]').count())
            await session.page.locator('[data-campaign-media$="-introduction"] button').click();
        await session.page.waitForSelector('[data-campaign-ready=true]');
    }
    stopMedia = await observeMissionMedia(session.page);
    await phase('source-original-opening');
    const launching = session.page.evaluate(() => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = 'easy'; return screen.launchPrepared('sov03umd.map', undefined, { originalOpening: true });
    });
    await session.page.waitForSelector('[data-campaign-media=s03_f00e] video', { timeout: 90000 });
    await session.page.waitForFunction(() => document.querySelector('[data-campaign-media=s03_f00e] video')?.readyState >= 2);
    report.opening = await session.page.evaluate(() => {
        const video = document.querySelector('[data-campaign-media=s03_f00e] video');
        return { id: video.parentElement.dataset.campaignMedia, time: video.currentTime, duration: video.duration,
            sourceWorldPresent: !!window.__ra2debug.game?.campaign, rate: video.playbackRate };
    });
    assert(!report.opening.sourceWorldPresent); assert.equal(report.opening.rate, 1);
    await session.page.locator('[data-campaign-media=s03_f00e] button').click();
    await launching; await waitWorld(session.page, report.mission);
    report.fresh = await session.page.evaluate(() => window.__ra2debug.game.campaign.launch);
    assert.equal(report.fresh.sourceSha256, report.sourceSha256);
    assert.equal(report.fresh.semanticsVersion, 45); assert(!report.fresh.diagnostic);
    await phase(sourceQueue ? 'actual-original-source-requests-in-native-queue' : 'actual-original-sequential-radar-playback');
    if (sourceQueue) {
        report.sourceTurnBurst = await session.page.evaluate(() => {
            const d=window.__ra2debug,g=d.game,m=d.gameScreen.gameTurnMgr,paused=m.paused;
            m.setPaused(false);m.setCampaignPaused(false);
            try {
                for (let i=0;i<540;i++) {
                    if (g.campaign.failure || g.campaign.result || m.getErrorState()) throw Error('Source simulation stopped');
                    m.doGameTurn(performance.now());
                }
            } finally { m.setCampaignPaused(true);m.setPaused(paused); }
            return {tick:g.currentTick,pending:d.gameScreen.campaignMediaPlayer.snapshot()};
        });
        assert.deepEqual(report.sourceTurnBurst.pending.map(movie=>movie.id),expectedMovies);
    } else {
        await stepWorld(session.page,210);
        await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.outcomes
            .some(outcome => outcome.id === 's03_p01e' && outcome.outcome === 'ended'));
        report.firstSourceMovieNaturallyEnded = true;
        await stepWorld(session.page,330);
    }
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.pending.includes('s03_p02e'));
    await session.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await session.page.waitForFunction(activeMovie => {
        const current = window.__ra2debug.gameScreen.campaignMediaPlayer.current;
        return current?.request.id === activeMovie && current.video.readyState >= 2 && current.video.paused;
    },activeMovie);
    report.playbackPaused = await state();
    assert.deepEqual(report.playbackPaused.pending.map(movie => movie.id),expectedMovies);
    if (sourceQueue) {
        report.duplicateRequest = await session.page.evaluate(() => {
            const player=window.__ra2debug.gameScreen.campaignMediaPlayer,current=player.current;
            const before=player.snapshot(),existing=player.inflight.get(current.request.id);
            const duplicate=player.play(current.request);
            return {samePromise:duplicate===existing,before,after:player.snapshot(),
                decoders:document.querySelectorAll('[data-campaign-media] video').length};
        });
        assert(report.duplicateRequest.samePromise);assert.equal(report.duplicateRequest.decoders,1);
        assert.deepEqual(report.duplicateRequest.before,report.duplicateRequest.after);
    }
    assert(report.playbackPaused.current.attachedToCurrentRadar && report.playbackPaused.mediaPaused);
    const before = report.playbackPaused.current.time;
    await session.page.waitForTimeout(550);
    report.pausedAfterWallTime = await state();
    assert.equal(report.pausedAfterWallTime.tick, report.playbackPaused.tick);
    assert(Math.abs(report.pausedAfterWallTime.current.time-before) < .05);
    await session.page.screenshot({ path: path.join(out, 'native-actual-source-radar-menu-paused.png') });
    await phase('native-volume-and-radar-resize');
    report.volumeBefore = await session.page.evaluate(() => {
        const mixer = window.__ra2debug.gameScreen.mixer;
        const saved = [0,4].map(channel => ({ channel, volume: mixer.getVolume(channel), muted: mixer.isMuted(channel) }));
        mixer.setMuted(0, false); mixer.setMuted(4, false); mixer.setVolume(0,.6); mixer.setVolume(4,.5);
        return saved;
    });
    await session.page.waitForFunction(() => Math.abs(window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.volume-.3) < .001);
    report.changedVolume = await state();
    await session.page.evaluate(() => window.__ra2debug.gameScreen.mixer.setMuted(4,true));
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.volume === 0);
    report.voiceMuted = await state();
    await session.page.evaluate(() => {
        const mixer = window.__ra2debug.gameScreen.mixer;
        mixer.setMuted(4,false); mixer.setMuted(0,true);
    });
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.volume === 0);
    report.masterMuted = await state();
    await session.page.evaluate(() => window.__ra2debug.gameScreen.mixer.setMuted(0,false));
    await session.page.waitForFunction(() => Math.abs(window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.volume-.3) < .001);
    report.windowBefore = await session.app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0], before = window.getSize(); window.setSize(1280,900); return before;
    });
    await session.page.waitForFunction(() => {
        const screen = window.__ra2debug.gameScreen, current = screen.campaignMediaPlayer.current;
        return current.video.parentElement.parentElement === screen.hud.getCampaignRadarHost();
    });
    report.resized = await state(); assert.equal(report.resized.tick, report.playbackPaused.tick);
    assert(report.resized.current.attachedToCurrentRadar);
    await session.page.evaluate(saved => { const mixer = window.__ra2debug.gameScreen.mixer;
        for (const value of saved) { mixer.setVolume(value.channel,value.volume); mixer.setMuted(value.channel,value.muted); }
    }, report.volumeBefore);
    await session.page.getByRole('button', { name: session.labels['gui:resumemission'], exact: true }).click();
    await session.page.waitForFunction(() => window.__ra2debug.gameScreen.campaignMediaPlayer.current?.video.currentTime >= .8);
    await session.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    report.activeSaveState = await state();
    assert(report.activeSaveState.tick > report.playbackPaused.tick, 'Non-pausing original radar media must allow normal turns');
    assert.equal(report.activeSaveState.current.id,activeMovie);
    assert(report.activeSaveState.current.time > .5 && report.activeSaveState.current.time < report.activeSaveState.current.duration-2);
    await retainMedia('fresh-opening-sequential-radar-and-menu-controls-before-save');
    await phase('active-radar-named-save-and-process-restart');
    session = await namedSaveRestart(session, out, report, `YR45 ${language} Soviet03 active original radar`,
        stepWorld, async (restored, checkpoint) => {
            session = restored;
            const movies = checkpoint.presentation.movies;
            report.savedMedia = movies;
            assert.deepEqual(movies.map(movie => movie.id),expectedMovies);
            await session.page.waitForFunction(({time,activeMovie}) => {
                const current = window.__ra2debug.gameScreen.campaignMediaPlayer.current;
                return current?.request.id === activeMovie && current.video.readyState >= 2 && current.video.currentTime >= time;
            },{time:movies[0].time,activeMovie});
            report.restoredMedia = await state();
            assert.deepEqual(report.restoredMedia.pending.map(movie => movie.id), movies.map(movie => movie.id));
            assert(report.restoredMedia.current.time < movies[0].time+1.5);
            await session.page.evaluate(() => {
                const d = window.__ra2debug, assets = d.gameScreen.campaignMovieAssets;
                const audit = window.__yrRestoredMediaRelease = { assets, player: d.gameScreen.campaignMediaPlayer,
                    scene: d.worldScene, urls: [...assets.sources.values()].map(source => source.url).filter(url => url.startsWith('blob:')), revoked: [] };
                const original = URL.revokeObjectURL;
                const wrapper = function(url) { audit.revoked.push(url); return original.call(URL,url); };
                URL.revokeObjectURL = wrapper; audit.stop = () => { if (URL.revokeObjectURL === wrapper) URL.revokeObjectURL = original; };
            });
            stopMedia = await observeMissionMedia(session.page);
        });
    await phase('natural-restored-radar-completion');
    await session.page.waitForFunction(() => !window.__ra2debug.gameScreen.campaignMediaPlayer.pending.length,
        undefined, { timeout: 120000 });
    report.drained = await state();
    assert.equal(report.drained.movieHolders,0); assert.equal(report.drained.movieCaptions,0);
    assert(report.drained.triggers.every(([,value]) => value.fired === 1));
    await session.page.screenshot({ path: path.join(out, 'native-restored-source-radar-finished.png') });
    await phase('normal-abort-media-and-scene-release');
    await session.page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await session.page.getByRole('button', { name: session.labels['gui:abortmission'], exact: true }).click();
    await session.page.getByRole('button', { name: session.labels['gui:quit'], exact: true }).click();
    await session.page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await session.page.waitForFunction(() => { const a=window.__yrRestoredMediaRelease;
        return a.assets.sources.size===0 && a.player.disposed && !window.__ra2debug.renderer.getScenes().includes(a.scene);
    },undefined,{timeout:30000});
    report.release = await session.page.evaluate(() => {
        const d = window.__ra2debug, audit = window.__yrRestoredMediaRelease;
        return { assetsRemaining: audit.assets.sources.size, playerDisposed: audit.player.disposed,
            pending: audit.player.pending, expectedUrls: audit.urls, revokedUrls: audit.revoked,
            oldSceneActive: d.renderer.getScenes().includes(audit.scene),
            holders: document.querySelectorAll('[data-campaign-media]').length,
            captions: document.querySelectorAll('[data-campaign-movie-subtitle]').length };
    });
    await retainMedia('restored-original-radar-natural-end-and-normal-abort');
    await session.page.evaluate(() => { window.__yrRestoredMediaRelease.stop(); delete window.__yrRestoredMediaRelease; });
    assert.equal(report.release.assetsRemaining,0); assert(report.release.playerDisposed);
    assert.deepEqual(report.release.pending,[]); assert(!report.release.oldSceneActive);
    assert(report.release.expectedUrls.every(url => report.release.revokedUrls.includes(url)));
    assert.equal(report.release.holders,0); assert.equal(report.release.captions,0);
    assert.deepEqual(report.errors,[]); assert.deepEqual(report.failedResources,[]); assert.deepEqual(report.consoleErrors ?? [],[]);
    for (const media of report.missionMedia) {
        assert.deepEqual(media.errors,[]);
        for (const clip of media.clips) {
            assert.deepEqual(clip.mismatches,[]); assert.equal(clip.decoderError,null);
            assert.deepEqual(clip.rates,[1]); assert.equal(clip.seeks,0);
            assert(clip.radarSamples.every(sample => sample.attachedToCurrentRadar));
        }
    }
    const restoredClips=report.missionMedia.find(media=>media.phase==='restored-original-radar-natural-end-and-normal-abort').clips;
    assert.deepEqual(restoredClips.map(clip=>clip.id),expectedMovies);
    assert(restoredClips[0].requestedStartTime>0);
    for (const clip of restoredClips) {
        assert(clip.ended?.ended);assert.equal(clip.seenCues.length,clip.cueCount);
    }
    report.status = sourceQueue ? 'PASS_NATIVE_YR_SOURCE_RADAR_QUEUE_DEDUP_PAUSE_MIXING_SAVE_RESTART_AND_RELEASE'
        : 'PASS_NATIVE_YR_SEQUENTIAL_RADAR_MENU_PAUSE_RESIZE_MIXING_ACTIVE_SAVE_RESTART_AND_RELEASE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    report.failureState = await state().catch(() => undefined);
    await session?.page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await retainMedia('final-on-exit').catch(error => { report.observerError = error.stack; });
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, phase: report.phase, error: report.error, out }));
