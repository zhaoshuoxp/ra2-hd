import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';
const s=await startSession(process.argv[2],process.argv[3],'ra2',true);
const {page,report,stage,close,startClip,stopClip}=s;
let failure;
try {
    await page.evaluate(()=>{
        const f=window.__allied,d=window.__ra2debug;
        f.airfield=f.building('GAAIRC');f.power=f.building('GAPOWR');
        f.planes=['ORCA','BEAG','ORCA','BEAG'].map(name=>f.spawn(name,1,f.airfield.tile));
        f.actor=f.planes[0];d.worldInteraction.minimapHandler.panToTile(f.airfield.tile);
    });
    await page.waitForFunction(()=>window.__allied.airfield.buildStatus===1);
    report.recording=await startClip();
    await page.evaluate(()=>{
        const f=window.__allied;
        for(const plane of f.planes) window.__ra2debug.actionsApi.orderUnits([plane.id],13,f.airfield.id);
    });
    await page.waitForFunction(()=>{
        const f=window.__allied;
        return f.planes.every(u=>f.airfield.dockTrait.isDocked(u)&&u.zone===0&&u.tileElevation===0);
    },undefined,{timeout:90000});
    await page.waitForTimeout(1000);
    report.parked=await page.evaluate(()=>{
        const f=window.__allied,d=window.__ra2debug;
        return f.planes.map(u=>{
            const h=d.renderableManager.getRenderableByGameObject(u).unitVxlHd;
            return {...f.sample(u),depthOffset:h?.dockDepthCache?.offset,
                visibleLayers:h?.layers.flatMap(l=>l.frames).filter(f=>f.batch.visible).length};
        });
    });
    assert.equal(new Set(report.parked.map(p=>p.tile.join(','))).size,4);
    assert(report.parked.every(p=>p.vxlHd&&p.visibleLayers>0&&p.depthOffset>0));
    await stage('four-parked-aircraft');await page.waitForTimeout(2000);
    await stopClip('four-native-landings');
    assert.equal(await page.evaluate(()=>window.__ra2debug.renderer.renderer.getContext().getError()),0);
} catch(e){failure=e;console.error(e);}
await close(failure);if(failure)process.exitCode=1;
