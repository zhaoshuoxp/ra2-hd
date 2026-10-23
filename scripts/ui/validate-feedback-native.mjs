import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';
const [receipt, output] = process.argv.slice(2), out = path.resolve(output);
const yardReview = process.argv.includes('--yard-cycle-review');
const retailParity = process.argv.includes('--retail-ui-parity');
await fs.mkdir(out, { recursive: false });
const report = { status:'RUNNING',cases:[],disclosure:'Controlled legal fixtures, native animation clocks and unchanged simulation rules. Physical cursor input and Windows remain separate.' };
try {
    for (const [edition,density,snow] of (yardReview ? [['yr',4,false],['ra2',2,true]] : [['ra2',2,false],['yr',4,false],['ra2',4,true],['yr',2,true]])) {
        const name = `${edition}-${snow?'snow':'temperate'}-${density}x`;
        const s = await startSession(receipt,path.join(out,name),edition,snow,async({page})=>{
            await page.evaluate(density=>{window.__ra2debug.generalOptions.graphics.hdEnabled.value=true;window.__ra2debug.generalOptions.graphics.hdDensity.value=density;},density);
        },undefined,(edition==='yr'?'X':'')+(snow?'MP12S4.map':'MP03T4.map'),retailParity?3:1);
        const row={edition,density,snow,errors:s.report.errors,consoleErrors:s.report.consoleErrors};report.cases.push(row);
        try {
            await s.page.evaluate(()=>{
                window.__installAlliedFixtures(); const f=window.__allied,d=window.__ra2debug,g=d.game;
                const all=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t));
                const center={rx:all.reduce((sum,t)=>sum+t.rx,0)/all.length,ry:all.reduce((sum,t)=>sum+t.ry,0)/all.length};
                const building=(name,near)=>{
                    const worker=g.getConstructionWorker(f.player);
                    const tiles=g.map.tiles.getAll().filter(tile=>{
                        if(!worker.canPlaceAt(name,tile,{normalizedTile:true,ignoreAdjacent:true}))return false;
                        for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){
                            const t=g.map.tiles.getByMapCoords(tile.rx+dx,tile.ry+dy);
                            if(!t||t.z!==tile.z||t.rampType)return false;
                        }return true;
                    }).sort((a,b)=>Math.hypot(a.rx-near.rx,a.ry-near.ry)-Math.hypot(b.rx-near.rx,b.ry-near.ry));
                    if(!tiles.length)throw Error('No legal level foundation for '+name);
                    const object=g.createObject(2,name);g.changeObjectOwner(object,f.player);g.spawnObject(object,tiles[0]);return object;
                };
                for(let i=0;i<4;i++)building('GAPOWR',{rx:f.center.rx-15,ry:f.center.ry+i*5});
                f.feedbackBuildings=['GACNST','GAWEAP','GAREFN'].map((name,i)=>building(name,{rx:center.rx+10*i,ry:center.ry+10}));
                f.feedbackUnit=f.spawn('MTNK',7,{rx:f.center.rx+3,ry:f.center.ry+4});
                f.feedbackInfantry=f.spawn('E1',3,{rx:f.center.rx+4,ry:f.center.ry+5});
            });
            await s.page.waitForFunction(()=>{const d=window.__ra2debug;return window.__allied.feedbackBuildings.every(b=>d.renderableManager.getRenderableByGameObject(b)?.mainObj?.builder?.hdOverride);},undefined,{timeout:90000});
            row.states=[];
            for(const health of [100,35]){
                await s.page.evaluate(health=>{for(const b of window.__allied.feedbackBuildings)b.healthTrait.health=health;},health);
                const trace=await s.page.evaluate(async()=>{
                    const d=window.__ra2debug,f=window.__allied,trace=[],start=performance.now();
                    while(performance.now()-2500<start){
                        trace.push({tick:d.game.currentTick,buildings:f.feedbackBuildings.map(b=>{
                            const r=d.renderableManager.getRenderableByGameObject(b);
                            return {name:b.name,health:b.healthTrait.health,powered:r.powered,mainHd:r.mainObj.builder.hdOverride.identity,
                                anims:r.animObjects.get(2).map(a=>({frame:a.builder.getFrame(),visible:a.get3DObject().visible,hd:!!a.builder.hdOverride}))};
                        })});await new Promise(resolve=>setTimeout(resolve,50));
                    }return trace;
                });
                row.states.push({health,trace});assert(trace.at(-1).tick>trace[0].tick);
            }
            if (!yardReview) {
            row.health=[];
            for(const health of [100,50,25]){
                const result=await s.page.evaluate(({health,retailParity})=>{
                    const d=window.__ra2debug,f=window.__allied;
                    return [f.feedbackBuildings[0],f.feedbackUnit,f.feedbackInfantry].map(object=>{
                        object.healthTrait.health=health;const r=d.renderableManager.getRenderableByGameObject(object);
                        const overlay=r.pipOverlay;
                        if(!overlay)throw Error('No health overlay for '+object.name);
                        overlay.selectionModel.setSelected(true);overlay.update(0);
                        const mesh=overlay.healthBar;
                        let nativeGeometryParity;
                        if(retailParity){
                            const sample=()=>{
                                const values=[...overlay.healthBar.matrix.elements];
                                overlay.healthBar.traverse(node=>{if(node.isMesh)values.push(...node.geometry.attributes.position.array,...node.matrix.elements);});
                                return values;
                            };
                            const hd=sample();
                            d.generalOptions.graphics.hdEnabled.value=false;overlay.update(0);
                            const original=sample();
                            d.generalOptions.graphics.hdEnabled.value=true;overlay.update(0);
                            nativeGeometryParity={sameLength:hd.length===original.length,maxDelta:hd.length===original.length?Math.max(...hd.map((value,i)=>Math.abs(value-original[i]))):null};
                        }
                        return {name:object.name,health,kind:mesh.name,nativeGeometryParity,
                            materials:(mesh.isMesh?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):mesh.children.map(c=>c.material)).map(m=>({name:m.name,width:m.map.image.width,height:m.map.image.height,minFilter:m.map.minFilter}))};
                    });
                },{health,retailParity});
                row.health.push(...result);
                for(const object of result){assert(object.kind.startsWith('hd-'));if(retailParity)assert(object.nativeGeometryParity.sameLength&&object.nativeGeometryParity.maxDelta<1e-6,'Retail health geometry must remain exact');}
            }
            row.cursor=await s.page.evaluate(()=>{
                const pointer=window.__ra2debug.gameScreen.pointer,sprite=pointer.getSprite(),result=[];
                for(const frame of [0,18,31,41,53,68,89,110,129,150,204,259,279,319,346,357,435,450,470,480,488,496,504].filter(frame=>frame<sprite.getFrameCount())){
                    sprite.setFrame(frame);result.push({frame,actual:sprite.getFrame(),width:sprite.targetContext.canvas.width,height:sprite.targetContext.canvas.height});
                }
                return {frames:result,logical:sprite.getSize(),css:document.getElementById('ra2web-root').style.getPropertyValue('--ra2-ui-cursor')};
            });
            for(const cursor of row.cursor.frames){assert.equal(cursor.width,row.cursor.logical.width*4);assert.equal(cursor.height,row.cursor.logical.height*4);assert.equal(cursor.actual,cursor.frame);}
            }
            row.componentClips=[];
            for(const b of (yardReview ? ['GACNST'] : retailParity ? ['GAWEAP','GAREFN'] : ['GACNST','GAWEAP','GAREFN'])){
                for(const health of (retailParity ? [100,35] : [100])){
                    await s.page.evaluate(({name,health})=>{
                        const d=window.__ra2debug,f=window.__allied;
                        const building=f.feedbackBuildings.find(b=>b.name===name);
                        building.healthTrait.health=health;
                        f.actor=building;f.detailSize=[700,500];
                        d.worldInteraction.minimapHandler.panToTile(building.tile);
                    },{name:b,health});
                    await s.page.waitForTimeout(1200);
                    const label=`${name}-${b}-${health}`;
                    if(yardReview||retailParity){
                        await s.startClip();await s.page.waitForTimeout(4200);
                        row.componentClips.push({building:b,health,file:await s.stopClip(label+'-cycle')});
                    }
                    if(retailParity)await s.stage(label);
                    else await s.page.screenshot({path:path.join(out,`${name}-${b}.png`)});
                }
            }
            assert.deepEqual(row.errors,[]);assert.deepEqual(row.consoleErrors,[]);row.status=yardReview?'PASS_FOCUSED_YARD_CYCLE_AND_REGISTERED_LAYERS':'PASS_NATIVE_LAYERS_HEALTH_AND_COMMAND_CURSOR';
        } finally { await s.close(); }
        await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({edition,density,snow,status:row.status}));
    }
    report.status=yardReview?'PASS_FOCUSED_YARD_CYCLE_REVIEW':'PASS_FOUR_NATIVE_FEEDBACK_CASES';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);
