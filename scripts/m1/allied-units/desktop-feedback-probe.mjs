import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';
const s = await startSession(process.argv[2], process.argv[3]);
const {page, report, stage, close} = s;
let failure;
try {
    await page.evaluate(() => {
        const f=window.__allied, d=window.__ra2debug;
        f.actor=f.spawn('ORCA',1); f.airfield=f.building('GAAIRC',f.actor.tile); f.power=f.building('GAPOWR',f.actor.tile);
        d.worldInteraction.minimapHandler.panToTile(f.airfield.tile);
    });
    await page.waitForFunction(() => window.__allied.airfield.buildStatus === 1);
    await page.evaluate(() => {
        const f=window.__allied;
        window.__ra2debug.actionsApi.orderUnits([f.actor.id],13,f.airfield.id);
    });
    await page.waitForFunction(() => window.__allied.airfield.dockTrait.isDocked(window.__allied.actor), undefined, {timeout:90000});
    await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd);
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    report.docked=await page.evaluate(() => {
        const d=window.__ra2debug, f=window.__allied, r=d.renderableManager.getRenderableByGameObject(f.actor), h=r.unitVxlHd;
        return {dockDepth:h.dockDepthCache, dockable:!!f.actor.dockableTrait, dockName:f.actor.dockableTrait?.dock?.name, managerLookup:typeof r.renderableManager?.getRenderableByGameObject, dockShape:!!d.renderableManager.getRenderableByGameObject(f.airfield).mainObj?.getShapeMesh(), sample:f.sample(f.actor), position:r.getPosition(), yaw:f.actor.yaw, pitch:f.actor.pitch,
            native:h.meshes.map(m=>({visible:m.visible,matrix:m.matrixWorld.toArray(),order:m.renderOrder})),
            layers:h.layers.flatMap(l=>l.frames.filter(f=>f.batch.visible).map(f=>({heading:f.frame.heading,order:f.batch.renderOrder,
                minY:Math.min(...Array.from(f.source.geometry.attributes.position.array).filter((v,i)=>i%3===1)),
                matrix:f.batch.matrixWorld.toArray()})))};
    });
    await stage('ORCA-docked-hd');
    await page.evaluate(() => {
        const d=window.__ra2debug, f=window.__allied, h=d.renderableManager.getRenderableByGameObject(f.actor).unitVxlHd;
        h.layers.forEach(l=>l.frames.forEach(f=>{for(const m of [f.batch,f.translucent,...f.batch.children])m.material.depthTest=false;}));
        d.renderer.render();
    });
    await stage('ORCA-no-depth-test');
    await page.evaluate(() => {
        const d=window.__ra2debug, f=window.__allied, h=d.renderableManager.getRenderableByGameObject(f.actor).unitVxlHd;
        h.layers.forEach(l=>l.frames.forEach(f=>{for(const m of [f.batch,f.translucent,...f.batch.children])m.material.depthTest=true;}));
    });
    await page.evaluate(() => {
        const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.actor);
        r.unitVxlHd.layers.forEach(l=>l.frames.forEach(f=>{f.batch.visible=f.depth.visible=f.translucent.visible=false;}));
        r.unitVxlHd.meshes.forEach((m,i)=>m.material=r.unitVxlHd.originals[i]); d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
    });
    await stage('ORCA-docked-original');
    await page.evaluate(() => {
        const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.actor);
        r.unitVxlHd.update(); d.renderableManager.getRenderableByGameObject(f.airfield).get3DObject().traverse(o=>o.visible=false); d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
    });
    await stage('ORCA-docked-no-building');
    await page.evaluate(() => {
        const d=window.__ra2debug,f=window.__allied;
        f.actor=f.spawn('DLPH',7); d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        d.gameScreen.gameAnimationLoop.start();
    });
    await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    report.dolphin=[];
    for (const direction of [0,45,90,135,180,225,270,315]) {
        report.dolphin.push(await page.evaluate(direction=>{
            const d=window.__ra2debug,f=window.__allied,r=d.renderableManager.getRenderableByGameObject(f.actor);
            r.updateShapeFrame(direction,true,false);
            const p=r.getPosition(), v=d.worldScene.camera.position.clone().copy(p), from=v.clone().project(d.worldScene.camera);
            const angle=-(direction+90)*Math.PI/180;
            v.x+=Math.cos(angle)*256; v.z+=Math.sin(angle)*256; v.project(d.worldScene.camera);
            d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
            return {direction, frame:r.shpRenderable.builder.getFrame(), screenDelta:[v.x-from.x,from.y-v.y]};
        },direction));
        await stage('DLPH-direction-'+direction);
    }
} catch(error) {failure=error; console.error(error);}
await close(failure); if(failure) process.exitCode=1;
