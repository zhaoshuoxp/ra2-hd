import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function checkRhinoGame(page, output) {
    await page.evaluate(() => {
        const d=window.__ra2debug,u=window.__rhinoUnit,r=window.__rhinoRenderable;
        window.__rhinoPhase='movement';window.__rhinoTrace=[];window.__rhinoShots=[];window.__rhinoTraceOn=true;
        window.__rhinoSpawnListener=(o)=>{
            if(o.fromObject===u)window.__rhinoShots.push({tick:d.game.currentTick,name:o.name,
                position:o.position.worldPosition.toArray(),facing:o.direction,flh:u.primaryWeapon.flh,
                origin:u.position.worldPosition.toArray(),rules:{rof:u.primaryWeapon.rules.rof,damage:u.primaryWeapon.rules.damage}});
        };
        d.game.getWorld().onObjectSpawned.subscribe(window.__rhinoSpawnListener);
        const sample=()=>{
            if(!window.__rhinoTraceOn)return;
            window.__rhinoTrace.push({phase:window.__rhinoPhase,tick:d.game.currentTick,moving:u.isMoving,firing:u.isFiring,destroyed:u.isDestroyed,health:u.healthTrait.health,active:r.rhinoHd.active,
                position:u.position.worldPosition.toArray(),body:u.direction,turret:u.turretTrait.facing,
                error:d.renderer.renderer.getContext().getError()});
            requestAnimationFrame(sample);
        };sample();
        d.unitSelection.deselectAll();d.unitSelection.addToSelection(u);
        d.actionsApi.orderUnits([u.id],0,u.tile.rx-1,u.tile.ry+5);
    });
    await page.waitForTimeout(6500);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__rhinoUnit.id],11));
    await page.waitForTimeout(800);
    const captures=[];
    await page.evaluate(() => {
        const d=window.__ra2debug,r=window.__rhinoRenderable;
        window.__rhinoPhase='static-captures';d.gameScreen.gameAnimationLoop.stop();
        window.__rhinoCapture=(enabled,preset='1080p')=>{
            d.generalOptions.graphics.rhinoHd.value=enabled;d.generalOptions.graphics.renderResolution.value=preset;
            r.rhinoHd.update();d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();d.worldScene.meshBatchManager.processRenderQueue();d.renderer.render();
            const canvas=d.renderer.renderer.domElement,rect=canvas.getBoundingClientRect(),c=d.worldScene.camera,v=d.worldScene.viewport;
            const p=r.getPosition().clone().project(c);
            const logical=[Number(canvas.dataset.logicalWidth),Number(canvas.dataset.logicalHeight)];
            return {png:canvas.toDataURL(),tick:d.game.currentTick,active:r.rhinoHd.active,buffer:[canvas.width,canvas.height],logical,
                css:[rect.width,rect.height],dpr:devicePixelRatio,ratio:d.renderer.renderer.getPixelRatio(),
                center:[(v.x+(p.x+1)*v.width/2)*canvas.width/logical[0],(v.y+(1-p.y)*v.height/2)*canvas.height/logical[1]],
                camera:{zoom:c.zoom,projection:c.projectionMatrix.toArray()},
                transforms:r.rhinoHd.originalMeshes.map(m=>m.matrixWorld.toArray()),
                mainVisible:r.mainObj.visible,layers:[...r.rhinoHd.layers].filter(([,l])=>l.batch.visible).map(([k])=>k),
                glError:d.renderer.renderer.getContext().getError()};
        };
    });
    for(const preset of ['1080p','4k']) {
        for(const [name,color] of [['red',[255,24,24]],['blue',[34,105,212]],['green',[10,195,93]],['yellow',[230,222,13]],
            ['orange',[255,160,24]],['purple',[148,40,189]],['cyan',[112,255,226]],['pink',[255,153,234]]]) {
            const rows=await page.evaluate(({color,preset})=>{
                const r=window.__rhinoRenderable,u=window.__rhinoUnit,original=u.owner.color;
                const next=Object.create(Object.getPrototypeOf(original));Object.assign(next,{r:color[0],g:color[1],b:color[2]});
                u.owner.color=next;r.palette.remap(next);r.vxlBuilders.forEach(b=>b.setPalette(r.palette));
                try{return [false,true,false].map(on=>window.__rhinoCapture(on,preset));}
                finally {u.owner.color=original;r.palette.remap(original);r.vxlBuilders.forEach(b=>b.setPalette(r.palette));r.rhinoHd.update();}
            },{color,preset});
            assert.equal(rows[0].png,rows[2].png,'Byte-exact original restoration');
            assert.deepEqual(rows[0].transforms,rows[1].transforms);assert.deepEqual(rows[0].camera,rows[1].camera);
            assert.notEqual(rows[0].png,rows[1].png,'HD must visibly contribute to the native framebuffer');
            assert(rows[1].active);assert.equal(rows[1].logical[1],900);assert.equal(rows[1].glError,0);
            for(const [i,row] of rows.entries()) {
                if(i===2)continue;
                row.file=`${name}-${preset}-${i?'hd':'original'}.png`;
                await fs.writeFile(`${output}/${row.file}`,Buffer.from(row.png.split(',')[1],'base64'));delete row.png;
                captures.push({...row,color:name,mode:i?'hd':'original'});
            }
        }
    }
    for(let heading=0;heading<360;heading+=45) {
        const rows=await page.evaluate(h=>{
            const u=window.__rhinoUnit,r=window.__rhinoRenderable,saved=[u.direction,u.turretTrait.facing,u.owner.color];
            const color=Object.create(Object.getPrototypeOf(u.owner.color));Object.assign(color,{r:34,g:105,b:212});
            u.direction=h;u.turretTrait.facing=(h+90)%360;u.owner.color=color;
            r.updateVxlRotation(h,true);r.palette.remap(color);r.vxlBuilders.forEach(b=>b.setPalette(r.palette));
            try{return [false,true].map(on=>window.__rhinoCapture(on));}
            finally {
                [u.direction,u.turretTrait.facing,u.owner.color]=saved;
                r.updateVxlRotation(u.direction,true);r.palette.remap(u.owner.color);r.vxlBuilders.forEach(b=>b.setPalette(r.palette));r.rhinoHd.update();
            }
        },heading);
        assert.deepEqual(rows[0].transforms,rows[1].transforms);
        for(const [i,row] of rows.entries()) {
            row.file=`heading-${heading}-${i?'hd':'original'}.png`;
            await fs.writeFile(`${output}/${row.file}`,Buffer.from(row.png.split(',')[1],'base64'));delete row.png;
            captures.push({...row,color:'blue',heading,mode:i?'hd':'original'});
        }
    }
    await fs.writeFile(`${output}/captures.json`,JSON.stringify(captures,null,2));
    const lifecycle=await page.evaluate(()=>{
        const d=window.__ra2debug,r=window.__rhinoRenderable,pack=r.rhinoHd.resources;
        const owner=window.__rhinoUnit.owner,other=d.game.getCombatants().find(p=>p!==owner);
        const oldColor=other.color;
        // A reversible owner fixture exercises the rendering path; it does not claim a mind-control battle.
        window.__rhinoUnit.owner=other;r.rhinoHd.update();
        const changedOwnerActive=r.rhinoHd.active;
        window.__rhinoUnit.owner=owner;r.rhinoHd.update();
        const materialRestoration=[];
        for(const on of [false,true,false,true]){
            d.generalOptions.graphics.rhinoHd.value=on;r.rhinoHd.update();
            materialRestoration.push(r.rhinoHd.originalMeshes.every((m,i)=>m.material===(on?r.rhinoHd.hidden[i]:r.rhinoHd.originals[i])));
        }
        window.__rhinoPack=pack;
        return {changedOwnerActive,materialRestoration};
    });
    // Record an actual native-resolution crop, never enlarge or resample the framebuffer.
    await page.evaluate(() => {
        const d=window.__ra2debug,r=window.__rhinoRenderable,u=window.__rhinoUnit;
        const frame=window.__rhinoCapture(true);
        const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
        const ctx=canvas.getContext('2d'), source=d.renderer.renderer.domElement;
        const x=Math.max(0,Math.round(frame.center[0]-320)),y=Math.max(0,Math.round(frame.center[1]-180));
        const chunks=[],recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:'video/webm;codecs=vp9'});
        recorder.ondataavailable=e=>chunks.push(e.data);
        window.__rhinoVideoStop=()=>new Promise(resolve=>{recorder.onstop=async()=>{
            const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
        };recorder.stop();});
        window.__rhinoVideoOn=true;
        const draw=()=>{if(!window.__rhinoVideoOn)return;ctx.drawImage(source,x,y,640,360,0,0,640,360);requestAnimationFrame(draw);};
        draw();recorder.start();
        window.__rhinoPhase='firing';d.gameScreen.gameAnimationLoop.start();
        d.actionsApi.orderUnits([u.id],3,u.tile.rx+2,u.tile.ry-1);
    });
    await page.waitForTimeout(6500);
    const video=await page.evaluate(async()=>{window.__rhinoVideoOn=false;return await window.__rhinoVideoStop();});
    await fs.writeFile(`${output}/combat.webm`,Buffer.from(video.split(',')[1],'base64'));
    const trace=await page.evaluate(()=>{window.__rhinoTraceOn=false;window.__ra2debug.game.getWorld().onObjectSpawned.unsubscribe(window.__rhinoSpawnListener);return window.__rhinoTrace;});
    const shots=await page.evaluate(()=>window.__rhinoShots);
    await fs.writeFile(`${output}/trace.json`,JSON.stringify(trace,null,2));
    await fs.writeFile(`${output}/shots.json`,JSON.stringify(shots,null,2));
    assert(trace.some(r=>r.moving));assert(trace.some(r=>r.firing));assert(shots.length>=2);
    assert(trace.filter(r=>r.firing).every(r=>r.active),'HD must stay active during firing');
    assert(trace.every(r=>r.error===0));
    await page.screenshot({path:`${output}/firing.png`});
    await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__rhinoUnit.id],11));
    await page.waitForTimeout(500);
    lifecycle.removal=await page.evaluate(()=>{
        const d=window.__ra2debug,u=window.__rhinoUnit,nativeDeath=u.isDestroyed;
        if(!nativeDeath)d.game.destroyObject(u,undefined,true);
        return {nativeDeath};
    });
    await page.waitForTimeout(1800);
    lifecycle.afterRemoval=await page.evaluate(()=>({disposed:window.__rhinoRenderable.rhinoHd.disposed,
        refs:[...window.__rhinoPack.parts.values()].map(p=>p.refs),resourcesLive:[...window.__rhinoPack.parts.values()].every(p=>!p.disposed)}));
    assert(lifecycle.changedOwnerActive);assert(lifecycle.materialRestoration.every(Boolean));
    assert(lifecycle.afterRemoval.disposed);assert(lifecycle.afterRemoval.refs.every(n=>n===0));assert(lifecycle.afterRemoval.resourcesLive);
    await page.evaluate(()=>window.__ra2debug.actionsApi.queueForProduction(3,7,'HTNK',1));
    await page.waitForFunction(()=>window.__ra2debug.localPlayer.getOwnedObjects().some(u=>u.name==='HTNK'&&!u.isDestroyed),undefined,{timeout:90000});
    await page.waitForTimeout(800);
    lifecycle.rebuilt=await page.evaluate(()=>{
        const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.name==='HTNK'&&!u.isDestroyed);
        return {id:u.id,active:d.renderableManager.getRenderableByGameObject(u).rhinoHd?.active,
            refs:[...window.__rhinoPack.parts.values()].map(p=>p.refs)};
    });
    assert(lifecycle.rebuilt.active);
    lifecycle.matchExit=await page.evaluate(async()=>{
        const d=window.__ra2debug,pack=window.__rhinoPack,renderer=d.renderer.renderer;
        await d.gameScreen.onLeave();
        return {refs:[...pack.parts.values()].map(p=>p.refs),disposed:[...pack.parts.values()].every(p=>p.disposed),
            gpuReleased:[...pack.parts.values()].every(p=>[p.texture,p.remap,p.palette].every(t=>!renderer.properties.get(t).__webglTexture))};
    });
    assert(lifecycle.matchExit.refs.every(n=>n===0));assert(lifecycle.matchExit.disposed);assert(lifecycle.matchExit.gpuReleased);
    return {samples:trace.length,movement:trace.filter(r=>r.moving).length,firing:trace.filter(r=>r.firing).length,
        shots:shots.length,captures:captures.length,lifecycle};
}
