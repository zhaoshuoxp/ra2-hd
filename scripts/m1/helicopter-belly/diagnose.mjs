// Same-pose native diagnostics: isolate culling, rotor occlusion and depth.
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../allied-units/desktop-session.mjs';
const s = await startSession(process.argv[2], process.argv[3], 'yr');
const {page,report,close} = s;
let failure;
try {
    report.samples = [];
    for (const name of ['SHAD','SCHP']) {
        await page.evaluate(name => {
            const d=window.__ra2debug,f=window.__allied,g=d.game;
            f.player.color=g.rules.colors.get('DarkBlue');
            f.actor=f.spawn(name,7,{rx:f.center.rx-8,ry:f.center.ry-4});
            f.actor.attackTrait.setDisabled(true);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            const u=f.actor;
            const t=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)&&!t.rampType&&g.map.getTileZone(t)===0
                &&!g.map.getGroundObjectsOnTile(t).some(o=>o.isTerrain()||o.isTechno()))
                .sort((a,b)=>Math.abs(Math.hypot(a.rx-u.tile.rx,a.ry-u.tile.ry)-15)-Math.abs(Math.hypot(b.rx-u.tile.rx,b.ry-u.tile.ry)-15))[0];
            d.actionsApi.orderUnits([u.id],0,t.rx,t.ry);
        }, name);
        await page.waitForFunction(()=>window.__allied.actor.zone===1 && window.__allied.sample(window.__allied.actor).vxlHd,
            undefined,{timeout:45000});
        await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        for (const direction of [0,135,225,315]) for (const variant of ['baseline','double-side','no-body-depth','no-rotor','original']) {
            const result=await page.evaluate(({direction,variant})=>{
                const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.actor),h=r.unitVxlHd;
                f.actor.direction=direction;r.updateVxlRotation(direction,true);h.update();
                for(const l of h.layers)for(const q of l.frames){
                    for(const m of [q.source,q.batch,q.depth,q.translucent,...q.batch.children]){
                        m.material.side=variant==='double-side'?2:l.rotor?2:0;m.material.needsUpdate=true;
                    }
                    if(variant==='no-body-depth'&&!l.rotor){q.depth.visible=false;q.batch.material.depthWrite=false;}
                    else q.batch.material.depthWrite=true;
                    if(variant==='no-rotor'&&l.rotor)q.batch.visible=q.depth.visible=q.translucent.visible=false;
                    if(variant==='original')q.batch.visible=q.depth.visible=q.translucent.visible=false;
                }
                if(variant==='original')h.meshes.forEach((m,i)=>m.material=h.originals[i]);
                d.worldScene.scene.updateMatrixWorld(true);d.worldScene.meshBatchManager.updateMeshes();d.renderer.render();
                const c=d.renderer.renderer.domElement,v=d.worldScene.viewport,p=r.getPosition().clone().project(d.worldScene.camera);
                const ratio=c.width/d.renderer.width,x=(v.x+(p.x+1)*v.width/2)*ratio,y=(v.y+(1-p.y)*v.height/2)*ratio;
                const a=document.createElement('canvas');a.width=600;a.height=420;
                a.getContext('2d').drawImage(c,Math.round(x-300),Math.round(y-252),600,420,0,0,600,420);
                return {variant,direction,zone:f.actor.zone,elevation:f.actor.tileElevation,tilt:f.actor.tilterTrait?.tilt,
                    png:a.toDataURL(),glError:d.renderer.renderer.getContext().getError(),
                    layers:h.layers.map(l=>({section:l.frames[0].part.section,rotor:l.rotor,
                        visible:l.frames.filter(q=>q.batch.visible).map(q=>q.frame.heading),
                        triangleCount:l.frames[0].source.geometry.attributes.position.count/3}))};
            },{direction,variant});
            await fs.writeFile(path.join(s.out,`${name}-${direction}-${variant}.png`),Buffer.from(result.png.split(',')[1],'base64'));
            delete result.png;report.samples.push({name,...result});
        }
        await page.evaluate(()=>{const d=window.__ra2debug;d.game.unspawnObject(window.__allied.actor);d.gameScreen.gameAnimationLoop.start();});
    }
} catch(error){failure=error;console.error(error);}
await close(failure);if(failure)process.exitCode=1;
