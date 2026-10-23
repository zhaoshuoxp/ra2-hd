// Fill renderer telemetry for the final GI selection in one short native session.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const selectedDensity=process.argv.includes('--2x')?2:4;
const s=await startSession(process.argv[2],process.argv[3],'yr',false,async({page})=>{
    await page.evaluate(density=>window.__ra2debug.generalOptions.graphics.hdDensity.value=density,selectedDensity);
});let failure;
try {
    await s.page.evaluate(()=>{
        const f=window.__allied,d=window.__ra2debug;
        f.actor=f.spawn('E1',3,{rx:f.center.rx+10,ry:f.center.ry});
        f.target=f.spawn('HTNK',7,{rx:f.actor.tile.rx-3,ry:f.actor.tile.ry+3},f.enemy);
        f.target.attackTrait.setDisabled(true);f.target.moveTrait.setDisabled(true);
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);d.actionsApi.orderUnits([f.actor.id],10);
    });
    await s.page.waitForFunction(()=>window.__allied.actor.deployerTrait.isDeployed());
    s.report.giDetails=[];
    // Density belongs to match initialization; never infer a live reload from a saved setting.
    for(const density of [selectedDensity]) {
        await s.page.waitForFunction(density=>window.__allied.sample(window.__allied.actor).shpHd&&
            window.__ra2debug.sovietUnitsHd.families.E1.density===density&&
            window.__ra2debug.renderableManager.getRenderableByGameObject(window.__allied.actor).shpRenderable.builder.hdOverride.identity.endsWith('/'+density),density);
        await s.page.evaluate(()=>{
            const d=window.__ra2debug,f=window.__allied;
            d.actionsApi.orderUnits([f.actor.id],11);d.actionsApi.orderUnits([f.actor.id],2,f.target.id);
        });
        await s.page.waitForFunction(()=>window.__allied.actor.isFiring);
        const trace=await s.page.evaluate(async density=>{
            const f=window.__allied,d=window.__ra2debug,trace=[],start=performance.now();
            while(performance.now()-start<1200){
                const u=f.actor,r=d.renderableManager.getRenderableByGameObject(u),b=r.shpRenderable.builder,n=b.getFrame(),hd=b.hdOverride,v=b.shpFile.getImage(n);
                trace.push({density,tick:d.game.currentTick,frame:n,action:r.currentSequenceParams.type,direction:u.direction,
                    source:b.shpFile.filename,native:{x:v.x,y:v.y,width:v.width,height:v.height},atlas:hd?.frames[n],hd:hd?.identity,
                    depth:r.shpRenderable.get3DObject().position.z,opacity:b.opacity,forceTransparent:b.forceTransparent,
                    shadow:{separate:!!r.shpRenderable.shadowRenderable,embedded:b.embeddedShadow,smoothCoverage:b.smoothCoverage}});
                await new Promise(resolve=>setTimeout(resolve,20));
            }return trace;
        },density);
        assert(trace.some(t=>t.action===29&&t.hd&&t.opacity===1&&t.source==='gi.shp'));
        s.report.giDetails.push({density,trace});
        await s.page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id],11));
    }
    await fs.writeFile(path.join(s.out,'gi-details.json'),JSON.stringify(s.report.giDetails,null,2)+'\n');
} catch(error){failure=error;}
await s.close(failure);if(failure)throw failure;console.log(s.report.status);
