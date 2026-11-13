import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all05umd.map');
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Exact legitimate supported-play Allied05 force checkpoint, ordinary attack orders and camera pans, native real-time simulation. Optional two bounded QA workers retain 128 MiB each and perform 80 ms CPU bursts. No accelerated stepping, world editing or physical-memory-target credit during measurement.';
    const targets = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(u => u.name === 'ROBO' && u.isSpawned);
        const center = own.reduce((p, u) => [p[0]+u.tile.rx/own.length, p[1]+u.tile.ry/own.length], [0, 0]);
        return g.world.getAllObjects().filter(u => u.isBuilding() && !u.isDestroyed && !g.areFriendly({owner:g.localPlayer},u)
            && !u.owner.isNeutral && !u.rules.insignificant)
            .sort((a,b)=>Math.hypot(a.tile.rx-center[0],a.tile.ry-center[1])-Math.hypot(b.tile.rx-center[0],b.tile.ry-center[1]))
            .slice(0,5).map(u=>({id:u.id,tile:[u.tile.rx,u.tile.ry],name:u.name}));
    });
    assert(targets.length >= 3);
    await pilot.commands.order(['ROBO', 'JUMPJET'], 2, targets[0].id);
    await pilot.page.evaluate(stress => {
        const d = window.__ra2debug, g = d.game;
        const stats = window.__battleFrames = { intervals: [], longTasks: [], started: performance.now(), tick: g.currentTick, frame: 0 };
        let previous = stats.started;
        const frame = now => { stats.intervals.push(now-previous); previous=now; stats.frame=requestAnimationFrame(frame); };
        stats.frame=requestAnimationFrame(frame);
        if (globalThis.PerformanceObserver) {
            stats.observer=new PerformanceObserver(list=>stats.longTasks.push(...list.getEntries().map(e=>({duration:e.duration,start:e.startTime}))));
            stats.observer.observe({type:'longtask',buffered:false});
        }
        if (stress) {
            const source='const memory=new Uint8Array(128*1024*1024);memory.fill(1);let v=0;function work(){const end=performance.now()+80;while(performance.now()<end)v=Math.sin(v+1);setTimeout(work,20)}work();';
            const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
            stats.workers=[new Worker(url),new Worker(url)]; URL.revokeObjectURL(url);
        }
        d.gameScreen.gameTurnMgr.setPaused(false); d.gameScreen.gameTurnMgr.setCampaignPaused(false);
    }, process.argv.includes('--stress'));
    pilot.report.views = [];
    for (let i=0;i<15;i++) {
        const target = targets[i%targets.length];
        await pilot.page.evaluate(target=>{
            const d=window.__ra2debug, g=d.game, u=g.world.hasObjectId(target.id)&&g.world.getObjectById(target.id);
            const t=u?.tile??g.map.tiles.getByMapCoords(...target.tile);
            const free=d.worldScene.cameraPan.freeCamera, previous=free.value; free.value=true;
            try { d.worldInteraction.minimapHandler.panToTile(t); } finally { free.value=previous; }
        },target);
        await pilot.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const view=await pilot.page.evaluate(target=>{
            const d=window.__ra2debug,g=d.game,u=g.world.hasObjectId(target.id)&&g.world.getObjectById(target.id),r=u&&d.renderableManager.getRenderableByGameObject(u);
            return {target,tick:g.currentTick,exists:!!u,actualHdBody:r?.mainObj?.builder?!!r.mainObj.builder.hdOverride:undefined,
                actors:{bytes:d.sovietUnitsHd.gpuBytes,budget:d.sovietUnitsHd.budget,
                    fallback:Object.entries(d.sovietUnitsHd.families).filter(([,f])=>f.status!=='READY').map(([name,f])=>({name,status:f.status,density:f.density}))},
                environment:{bytes:d.environmentHd.gpuBytes,budget:d.environmentHd.budget},
                terrain:{bytes:d.terrainHd.gpuBytes,budget:d.terrainHd.budget},gpu:d.renderer.renderer.info.memory};
        },target);
        pilot.report.views.push(view);
        await pilot.page.waitForTimeout(1500);
        if (i===7) await pilot.page.screenshot({path:path.join(pilot.out,'native-live-battle.png')});
    }
    pilot.report.realTime = await pilot.page.evaluate(()=>{
        const d=window.__ra2debug,s=window.__battleFrames; cancelAnimationFrame(s.frame);s.observer?.disconnect();s.workers?.forEach(w=>w.terminate());
        d.gameScreen.gameTurnMgr.setCampaignPaused(true);d.gameScreen.gameTurnMgr.setPaused(true);
        const values=s.intervals.slice(2).sort((a,b)=>a-b),quantile=p=>values[Math.min(values.length-1,Math.floor(values.length*p))];
        return {elapsedMs:performance.now()-s.started,fromTick:s.tick,toTick:d.game.currentTick,frames:values.length,
            medianMs:quantile(.5),p95Ms:quantile(.95),p99Ms:quantile(.99),over50Ms:values.filter(v=>v>50).length,
            longTasks:s.longTasks,intervals:s.intervals,realTimeSimulation:true,acceleratedStepsDuringMeasurement:0};
    });
    assert(pilot.report.realTime.toTick>pilot.report.realTime.fromTick+100,'Real-time simulation must advance');
    assert(pilot.report.views.every(v=>!v.exists||v.actualHdBody!==false),'Surviving camera targets must remain HD');
    assert(pilot.report.views.every(v=>v.actors.bytes<=v.actors.budget));
    assert.deepEqual(pilot.report.errors,[]);assert.deepEqual(pilot.report.failedResources,[]);
    pilot.report.status='PASS_NATIVE_REAL_TIME_ALLIED05_LARGE_FORCE_AND_HD_CAMERA_PRESSURE_OBSERVATION';
} catch(error) { failure=error; }
await pilot.finish(failure);
