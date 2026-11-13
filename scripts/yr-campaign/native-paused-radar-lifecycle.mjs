import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, root, stepWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused, namedSaveRestart } from '../campaign-completion/named-save-restart.mjs';
import { observeMissionMedia } from './observe-mission-media.mjs';

const out = path.resolve(process.argv[2]);
const language = process.argv.find(value => value.startsWith('--language='))?.slice(11) ?? 'en-US';
assert(['en-US','zh-CN','zh-TW'].includes(language));
const checkpointFile = path.join(root,'.artifacts/yr-campaign/all01-easy-adaptive45-2x-r1/mid-mission-checkpoint.json');
const checkpointBytes = await fs.readFile(checkpointFile), checkpoint = JSON.parse(checkpointBytes);
const checkpointSha256 = createHash('sha256').update(checkpointBytes).digest('hex');
assert.equal(checkpointSha256,'7a89bef345668be310d904cdf0d9bd83171fadbecfe19be5117148d477550165');
assert.equal(checkpoint.options.campaign.semanticsVersion,45);
assert.equal(checkpoint.identity.mission,'all01umd.map');
assert.equal(checkpoint.identity.sourceSha256,'dee38769f2247a85908705486c175ef14a4cf90437899defe7c8b4c0d1c51fb0');
assert.equal(checkpoint.tick,6030);
const trigger = new Map(checkpoint.expected.mission.triggers.triggers).get('0A8E573C');
assert.deepEqual([trigger.enabled,trigger.fired,trigger.enabledTick],[true,0,6001]);
assert.deepEqual(checkpoint.presentation.movies,[]);
await fs.mkdir(out,{recursive:false});
const report = { status:'RUNNING',phase:'startup',language,errors:[],failedResources:[],missionMedia:[],
    mission:checkpoint.identity.mission,source:checkpoint.identity,
    sourceCheckpoint:{file:checkpointFile,sha256:checkpointSha256,tick:checkpoint.tick},
    sourceMovieTrigger:'0A8E573C',sourceOpcode:117,
    scope:'Restore the unchanged, SHA-pinned legitimate city-power checkpoint under YR45. Advance only normal source turns to the original Action117 radar request. Observe real simulation pause, menu pause/resume, zero music ducking, active-media named save/process restart, natural completion, subsequent source timers and normal exit. No source, actors, RNG, trigger state, results, playback rates or scripted media seeks are assigned. Standard save restoration seeks to its saved timestamp. This supplements the independently qualified fresh-source Allied01 flow; public availability remains unchanged.' };
let session,stopMedia;
const save = () => fs.writeFile(path.join(out,'progress.json'),JSON.stringify(report,null,2)+'\n');
async function phase(value) { report.phase=value;await save(); }
async function retainMedia(label) {
    if (!stopMedia) return;
    const stop=stopMedia;stopMedia=undefined;
    report.missionMedia.push({phase:label,...await stop()});
}
async function state() {
    return session.page.evaluate(() => {
        const d=window.__ra2debug,g=d.game,s=d.gameScreen,p=s.campaignMediaPlayer,v=p.current?.video;
        return {tick:g.currentTick,hash:g.getHash(),pending:p.snapshot(),menu:!!s.menu.getCurrentScreen(),
            failure:g.campaign.failure,result:g.campaign.result,
            fullscreenPending:p.fullscreenPending,mediaPaused:s.campaignMediaPaused,
            independentPaused:s.gameTurnMgr.paused,campaignPaused:s.gameTurnMgr.campaignPaused,
            speechPaused:s.campaignSpeech.paused,music:d.music.getPlaybackState(),
            current:v && {id:p.current.request.id,time:v.currentTime,duration:v.duration,paused:v.paused,
                rate:v.playbackRate,attachedToCurrentRadar:v.parentElement.parentElement===s.hud.getCampaignRadarHost()},
            triggers:[...g.campaign.machine.states].filter(([id])=>['0691357C','0A8E573C','0A8EA21C','0A8E0E9C'].includes(id)),
            trace:g.campaign.trace.filter(action=>['0691357C','0A8E573C','0A8EA21C','0A8E0E9C'].includes(action.key)),
            holders:document.querySelectorAll('[data-campaign-media]').length,
            captions:document.querySelectorAll('[data-campaign-movie-subtitle]').length};
    });
}
try {
    session=await campaignSession(out,report,{edition:'yr',density:2});
    if (await session.page.evaluate(()=>document.documentElement.lang)!==language) {
        await session.page.evaluate(language=>localStorage.setItem('ra2hd.interfaceLanguage',language),language);
        await session.page.reload();
        if (await session.page.locator('[data-edition=yr]').count()) await session.page.locator('[data-edition=yr]').click();
        await session.page.waitForFunction(language=>document.documentElement.lang===language
            && !!window.__ra2debug?.mainMenuController,language,{timeout:90000});
        session.labels={...JSON.parse(await fs.readFile(path.join(root,`public/res/locale/retail-yr-${language}.json`))).labels,
            ...JSON.parse(await fs.readFile(path.join(root,`public/res/locale/${language}.json`)))};
        await session.page.getByRole('button',{name:session.labels['hd:menucampaign'],exact:true}).click();
        await session.page.waitForFunction(()=>document.querySelector('[data-campaign-ready=true]')
            || document.querySelector('[data-campaign-media$="-introduction"] video'));
        if (await session.page.locator('[data-campaign-media$="-introduction"]').count())
            await session.page.locator('[data-campaign-media$="-introduction"] button').click();
        await session.page.waitForSelector('[data-campaign-ready=true]');
    }
    await session.page.evaluate(()=>{const g=window.__ra2debug.generalOptions.graphics;g.hdEnabled.value=true;g.hdDensity.value=2;});
    await phase('exact-legitimate-city-power-checkpoint-restoration');
    await session.page.evaluate(checkpoint=>window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint,checkpoint.identity.mission),checkpoint);
    await session.page.waitForFunction(tick=>window.__ra2debug.game?.currentTick===tick
        && !!window.__ra2debug.gameScreen?.menu?.getCurrentScreen(),checkpoint.tick,{timeout:180000});
    const restored=await worldState(session.page);
    assert.deepEqual({worldHash:restored.hash,rng:restored.rng,mission:restored.mission,
        world:restored.world,pendingCallbacks:restored.pendingCallbacks},checkpoint.expected);
    await closeCampaignMenuPaused(session.page);
    stopMedia=await observeMissionMedia(session.page);
    await phase('original-action117-source-pause');
    let reached=false;
    for (let burst=0;burst<10 && !reached;burst++) reached=await session.page.evaluate(()=>{
        const d=window.__ra2debug,g=d.game,s=d.gameScreen,m=s.gameTurnMgr,p=s.campaignMediaPlayer;
        m.setPaused(false);m.setCampaignPaused(false);
        try {
            for (let i=0;i<30 && !p.fullscreenPending;i++) {
                if (g.campaign.failure || g.campaign.result || m.getErrorState()) throw Error('Source simulation stopped');
                m.doGameTurn(performance.now());
            }
        } finally { if (!p.fullscreenPending) m.setCampaignPaused(true); }
        return p.pending.includes('a01_p02e');
    });
    assert(reached);
    await session.page.waitForFunction(()=>window.__ra2debug.gameScreen.campaignMediaPlayer.current?.video.currentTime>=.8);
    report.sourcePaused=await state();
    const movieAction=report.sourcePaused.trace.find(action=>action.key==='0A8E573C' && action.opcode===117);
    assert.equal(movieAction.tick,6001+12*15);
    // The current ordinary game update completes after dispatching its UI action.
    const pausedTick=movieAction.tick+1;
    assert.equal(report.sourcePaused.tick,pausedTick);
    assert(!report.sourcePaused.independentPaused && report.sourcePaused.campaignPaused);
    assert(!report.sourcePaused.menu && !report.sourcePaused.mediaPaused);
    assert(report.sourcePaused.fullscreenPending && !report.sourcePaused.current.paused);
    assert(report.sourcePaused.speechPaused);assert.equal(report.sourcePaused.music.gain,0);
    assert.deepEqual(report.sourcePaused.pending.map(movie=>[movie.id,movie.placement]),[['a01_p02e','transmission-paused']]);
    await session.page.waitForTimeout(700);
    report.afterSourcePausedWallTime=await state();
    assert.equal(report.afterSourcePausedWallTime.tick,report.sourcePaused.tick);
    assert(report.afterSourcePausedWallTime.current.time>report.sourcePaused.current.time+.3);
    await session.page.screenshot({path:path.join(out,'native-original-action117-radar-simulation-paused.png')});
    await session.page.evaluate(()=>window.__ra2debug.gameScreen.menu.open());
    report.menuPaused=await state();
    await session.page.waitForTimeout(550);
    report.menuPausedAfterWallTime=await state();
    assert.equal(report.menuPausedAfterWallTime.tick,pausedTick);
    assert(Math.abs(report.menuPausedAfterWallTime.current.time-report.menuPaused.current.time)<.05);
    assert(report.menuPausedAfterWallTime.current.paused && report.menuPausedAfterWallTime.mediaPaused);
    await session.page.getByRole('button',{name:session.labels['gui:resumemission'],exact:true}).click();
    await session.page.waitForFunction(time=>window.__ra2debug.gameScreen.campaignMediaPlayer.current.video.currentTime>time+.3,
        report.menuPaused.current.time);
    report.resumed=await state();assert.equal(report.resumed.tick,pausedTick);assert(!report.resumed.current.paused);
    await session.page.evaluate(()=>window.__ra2debug.gameScreen.menu.open());
    await retainMedia('original-source-action117-and-menu-controls-before-save');
    await phase('active-paused-radar-named-save-and-process-restart');
    session=await namedSaveRestart(session,out,report,`YR45 ${language} Allied01 active original Action117`,stepWorld,
        async(restored,checkpoint)=>{
            session=restored;report.savedMedia=checkpoint.presentation.movies;
            assert.deepEqual(report.savedMedia.map(movie=>[movie.id,movie.placement]),[['a01_p02e','transmission-paused']]);
            await session.page.waitForFunction(time=>{
                const v=window.__ra2debug.gameScreen.campaignMediaPlayer.current?.video;
                return v?.readyState>=2 && v.currentTime>=time;
            },report.savedMedia[0].time);
            report.restoredMedia=await state();
            assert.equal(report.restoredMedia.tick,pausedTick);assert(report.restoredMedia.fullscreenPending);
            assert(report.restoredMedia.current.time<report.savedMedia[0].time+1.5);
            assert.equal(report.restoredMedia.music.gain,0);
            report.expectedRestoredCues=await session.page.evaluate(()=>{
                const request=window.__ra2debug.gameScreen.campaignMediaPlayer.current.request;
                return request.subtitles.map((cue,index)=>({index,start:cue.start,end:cue.end,text:cue.text}))
                    .filter(cue=>cue.end>request.startTime);
            });
            stopMedia=await observeMissionMedia(session.page);
        });
    report.naturallyFinished=await state();
    assert.deepEqual(report.naturallyFinished.pending,[]);
    assert.equal(report.naturallyFinished.tick,pausedTick+180);
    assert.equal(new Map(report.naturallyFinished.triggers).get('0A8EA21C').fired,1);
    await retainMedia('restored-source-action117-natural-completion-and-source-timer-continuation');
    const clip=report.missionMedia.at(-1).clips.find(clip=>clip.id==='a01_p02e');
    assert(clip.ended?.ended);assert.equal(clip.ended.tick,pausedTick);
    assert.deepEqual(clip.seenCues.map(cue=>cue.index),report.expectedRestoredCues.map(cue=>cue.index));
    const allSeen=new Set(report.missionMedia.flatMap(media=>media.clips).flatMap(clip=>clip.seenCues.map(cue=>cue.index)));
    assert.equal(allSeen.size,clip.cueCount);assert.deepEqual(clip.mismatches,[]);
    assert.equal(clip.decoderError,null);assert.equal(clip.seeks,0);assert.deepEqual(clip.rates,[1]);
    assert(clip.radarSamples.every(sample=>sample.attachedToCurrentRadar));
    await phase('normal-abort');
    await session.page.evaluate(()=>window.__ra2debug.gameScreen.menu.open());
    await session.page.getByRole('button',{name:session.labels['gui:abortmission'],exact:true}).click();
    await session.page.getByRole('button',{name:session.labels['gui:quit'],exact:true}).click();
    await session.page.waitForSelector('[data-campaign-ready=true]',{timeout:90000});
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedResources,[]);assert.deepEqual(report.consoleErrors??[],[]);
    report.status='PASS_NATIVE_YR_ORIGINAL_ACTION117_SIMULATION_MENU_PAUSE_ACTIVE_SAVE_RESTART_AND_SOURCE_TIMER_CONTINUATION';
} catch(error) {
    report.status='FAIL';report.error=error.stack;process.exitCode=1;
    report.failureState=await state().catch(()=>undefined);
    await session?.page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
} finally {
    await retainMedia('final-on-exit').catch(error=>{report.observerError=error.stack;});
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    await session?.app.close();
}
console.log(JSON.stringify({status:report.status,phase:report.phase,error:report.error,out}));
