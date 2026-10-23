import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';
const s=await startSession(process.argv[2],process.argv[3]);
const {page,report,stage,close,startClip,stopClip}=s;
let failure;
try {
    await page.evaluate(()=>{
        const d=window.__ra2debug,f=window.__allied;
        f.actor=f.spawn('MTNK',7); f.infantry=f.spawn('E1',3);
        f.control=f.spawn('HTNK',7); f.conscript=f.spawn('E2',3);
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
    });
    await page.waitForFunction(()=>Object.values(window.__allied.actors).every(u=>{
        const s=window.__allied.sample(u);return s.shpHd||s.vxlHd||u.name==='HTNK';
    }),undefined,{timeout:60000});
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    report.comparisons=[];
    for(const width of [4,1]){
        report.comparisons.push(await page.evaluate(width=>{
            const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.actor),h=r.unitVxlHd;
            h.layers.forEach(l=>l.frames.forEach(f=>{
                for(const m of [f.source,f.batch,f.depth,f.translucent,...f.batch.children])
                    if(m.material?.uniforms?.hdMinFootprint){m.material.uniforms.hdMinFootprint.value=width;}
            }));
            h.update();d.worldScene.scene.updateMatrixWorld(true);d.worldScene.meshBatchManager.updateMeshes();d.renderer.render();
            const gl=d.renderer.renderer,c=gl.domElement,v=d.worldScene.viewport,p=r.getPosition().clone().project(d.worldScene.camera);
            const ratio=c.width/d.renderer.width,x=(v.x+(p.x+1)*v.width/2)*ratio,y=(v.y+(1-p.y)*v.height/2)*ratio;
            const crop=document.createElement('canvas');crop.width=420;crop.height=300;
            crop.getContext('2d').drawImage(c,Math.round(x-210),Math.round(y-180),420,300,0,0,420,300);
            return {width,buffer:[c.width,c.height],png:crop.toDataURL(),camera:d.worldScene.camera.position,
                bodyLayers:h.layers.flatMap(l=>l.frames).filter(f=>f.batch.visible).length,gl:gl.getContext().getError()};
        },width));
        const result=report.comparisons.at(-1);
        await fs.writeFile(path.join(s.out,`MTNK-filter-${width}.png`),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
        await stage('filter-'+width);
    }
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.start());
    report.recording=await startClip();
    await page.evaluate(()=>{
        const d=window.__ra2debug,f=window.__allied;
        for(const u of Object.values(f.actors))d.actionsApi.orderUnits([u.id],0,u.tile.rx+3,u.tile.ry);
    });
    await page.waitForTimeout(6000);
    await stopClip('clarity-motion');
} catch(e){failure=e;console.error(e);}
await close(failure);if(failure)process.exitCode=1;
