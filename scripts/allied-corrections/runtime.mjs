// Isolated native orders and renderer-visible frame evidence; no production fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const density = process.argv.includes('--2x') ? 2 : 4;
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const snow = process.argv.includes('--snow');
const smoke = process.argv.includes('--smoke');
const sidebarOnly = process.argv.includes('--sidebar-only');
const giOnly = process.argv.includes('--gi-only');
const prismOnly = process.argv.includes('--prism-only');
const worldOnly = process.argv.includes('--world-only');
const openArena = process.argv.includes('--open-arena');
const s = await startSession(process.argv[2], process.argv[3], edition, snow, async ({ page }) => {
    await page.evaluate(density => window.__ra2debug.generalOptions.graphics.hdDensity.value = density, density);
});
const { page, out, report, stage, startClip, stopClip } = s;
report.density = density;
let failure;
try {
    report.setup = await page.evaluate(openArena => {
        const d = window.__ra2debug, f = window.__allied;
        f.buildings = ['GAAIRC', 'AMRADR', 'ATESLA'].map((name, i) => f.building(name, { rx: f.center.rx + 8 + i*6, ry: f.center.ry + 8 }));
        for (const name of ['GACNST','GAPOWR','GAPOWR','GAPOWR','GAPOWR','GAPOWR','GAPILE','GAWEAP','GAREFN','GATECH']) f.building(name);
        let near = { rx: f.center.rx+20, ry: f.center.ry-10 };
        if (openArena) {
            const g=d.game, rule=g.rules.getObject('HTNK',7);
            const candidates=g.map.tiles.getAll().slice().sort((a,b)=>
                Math.hypot(a.rx-f.center.rx+12,a.ry-f.center.ry+10)-Math.hypot(b.rx-f.center.rx+12,b.ry-f.center.ry+10));
            near=candidates.find(center=>{
                for(let x=-4;x<=4;x++)for(let y=-4;y<=4;y++){
                    const tile=g.map.tiles.getByMapCoords(center.rx+x,center.ry+y);
                    if(!tile||!g.map.isWithinBounds(tile)||tile.rampType||tile.z!==center.z
                        ||g.map.terrain.getPassableSpeed(tile,rule.speedType,false,false)<=0
                        ||g.map.getGroundObjectsOnTile(tile).some(o=>o.isTechno()||o.isTerrain()))return false;
                }return true;
            });
            if(!near)throw Error('No clear legal GI facing arena');
        }
        f.actor = f.spawn('E1', 3, near);
        f.gi = f.actor;
        return f.buildings.map(u => ({ name: u.name, id: u.id }));
    },openArena);
    await page.waitForFunction(() => {
        const d = window.__ra2debug, f = window.__allied;
        return f.sample(f.actor).shpHd && f.buildings.every(u => d.renderableManager.getRenderableByGameObject(u)?.mainObj?.builder.hdOverride);
    }, undefined, { timeout: 90000 });
    report.buildingBindings = await page.evaluate(() => {
        const d = window.__ra2debug;
        return window.__allied.buildings.map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            return { name:u.name, ruleImage:u.rules.image, art:u.art?.name, source:r.mainObj.builder.shpFile?.filename,
                identity:r.mainObj.builder.hdOverride.identity, powered:r.powered,
                active:r.animObjects.get(2).map(o => ({ frame:o.builder.getFrame(), identity:o.builder.hdOverride?.identity,
                    offset:o.builder.getOffset?.(), props:r.animations.get(o).props, visible:o.get3DObject().visible })) };
        });
    });
    report.buildingCycles = [];
    const testedBuildings = sidebarOnly || giOnly ? [] : report.setup.filter(u => !worldOnly && !prismOnly || u.name === 'ATESLA');
    for (const u of testedBuildings) {
        await page.evaluate(id => {
            const d=window.__ra2debug, unit=window.__allied.buildings.find(u=>u.id===id);
            window.__allied.actor=unit;
            d.worldInteraction.minimapHandler.panToTile(unit.tile);
        }, u.id);
        await startClip();
        const cycle = await page.evaluate(async id => {
            const d=window.__ra2debug,unit=window.__allied.buildings.find(u=>u.id===id),r=d.renderableManager.getRenderableByGameObject(unit);
            const trace=[], start=performance.now();
            while(performance.now()-start<3500) {
                trace.push({tick:d.game.currentTick,powered:r.powered,health:unit.healthTrait.health,
                    frames:r.animObjects.get(2).map(o=>({frame:o.builder.getFrame(),visible:o.get3DObject().visible,hd:!!o.builder.hdOverride}))});
                await new Promise(resolve=>setTimeout(resolve,40));
            }
            return trace;
        },u.id);
        const clip=await stopClip(u.name+'-native-cycle');
        report.buildingCycles.push({name:u.name,trace:cycle,clip});
        await stage(u.name+'-normal');
        // Native state changes are observed separately from clock inspection.
        await page.evaluate(id => {
            const d=window.__ra2debug,unit=window.__allied.buildings.find(u=>u.id===id);
            unit.healthTrait.health=35;
        },u.id);
        await page.waitForTimeout(700); await stage(u.name+'-damaged');
        report.buildingStates ??= [];
        report.buildingStates.push(await page.evaluate(id => {
            const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id),r=d.renderableManager.getRenderableByGameObject(u);
            return {name:u.name,state:'damaged',damage:r.damageType,body:r.mainObj.builder.getFrame(),active:r.animObjects.get(2).map(o=>o.builder.getFrame())};
        },u.id));
        await page.evaluate(id=>window.__allied.buildings.find(u=>u.id===id).poweredTrait?.setTurnedOn(false),u.id);
        await page.waitForTimeout(500); await stage(u.name+'-power-off');
        report.buildingStates.push(await page.evaluate(id=>{
            const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id),r=d.renderableManager.getRenderableByGameObject(u);
            return {name:u.name,state:'power-off',powered:r.powered,active:r.animObjects.get(2).map(o=>({frame:o.builder.getFrame(),visible:o.get3DObject().visible}))};
        },u.id));
        await page.evaluate(id=>window.__allied.buildings.find(u=>u.id===id).poweredTrait?.setTurnedOn(true),u.id);
        await page.waitForTimeout(500); await stage(u.name+'-power-on');
        report.buildingStates.push(await page.evaluate(id=>{
            const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id),r=d.renderableManager.getRenderableByGameObject(u);
            return {name:u.name,state:'power-on',powered:r.powered,active:r.animObjects.get(2).map(o=>({frame:o.builder.getFrame(),visible:o.get3DObject().visible}))};
        },u.id));
    }
    if(process.argv.includes('--charge')) {
        report.prismCharge=[];
        const id=report.setup.find(u=>u.name==='ATESLA').id;
        await page.evaluate(id=>{
            const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id);
            window.__allied.actor=u;d.worldInteraction.minimapHandler.panToTile(u.tile);
        },id);
        await startClip();
        for(const health of [100,35]) {
            await page.evaluate(({id,health})=>{
                const d=window.__ra2debug,f=window.__allied,u=f.buildings.find(u=>u.id===id);
                d.actionsApi.orderUnits([u.id],11);u.healthTrait.health=health;
                const target=f.spawn('HTNK',7,{rx:u.tile.rx+4,ry:u.tile.ry},f.enemy);
                target.attackTrait.setDisabled(true);target.moveTrait.setDisabled(true);
                d.actionsApi.orderUnits([u.id],2,target.id);
            },{id,health});
            const trace=await page.evaluate(async id=>{
                const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id),r=d.renderableManager.getRenderableByGameObject(u);
                const trace=[],start=performance.now();
                while(performance.now()-start<3500){
                    trace.push({tick:d.game.currentTick,attack:u.attackTrait.attackState,animation:r.currentAnimType,
                        layers:(r.animObjects.get(3)??[]).map(o=>({frame:o.builder.getFrame(),visible:o.get3DObject().visible,hd:o.builder.hdOverride?.identity}))});
                    await new Promise(resolve=>setTimeout(resolve,30));
                }return trace;
            },id);
            assert(trace.some(t=>t.layers.some(o=>o.visible&&o.hd)), 'Prism native charge layer must become visible with HD');
            report.prismCharge.push({health,trace});await stage('ATESLA-charge-'+health);
        }
        await page.evaluate(id=>window.__ra2debug.actionsApi.orderUnits([id],11),id);
        await stopClip('ATESLA-native-charge');
    }
    // Stop only this session's animation loop for same-pose Original/HD comparison.
    report.matched = [];
    for (const fixture of testedBuildings) {
        await page.evaluate(id => {
            const d=window.__ra2debug,u=window.__allied.buildings.find(u=>u.id===id);
            d.worldInteraction.minimapHandler.panToTile(u.tile);d.gameScreen.gameAnimationLoop.stop();
            const r=d.renderableManager.getRenderableByGameObject(u);
            window.__compare={sprites:[r.mainObj,r.bib,...[...r.animObjects.values()].flat()].filter(Boolean)};
            window.__compare.overrides=window.__compare.sprites.map(o=>o.builder.hdOverride);
        },fixture.id);
        for (const hd of [false,true]) {
            await page.evaluate(hd=>{
                const d=window.__ra2debug,c=window.__compare;
                c.sprites.forEach((o,i)=>o.setHdOverride(hd?c.overrides[i]:undefined));
                for(const scene of d.renderer.getScenes()){scene.scene.updateMatrixWorld(false);scene.meshBatchManager?.updateMeshes();}
                d.renderer.render();
            },hd);
            const file=fixture.name+'-matched-'+(hd?'hd':'original')+'.png';
            await page.screenshot({path:path.join(out,file)});report.matched.push(file);
        }
        await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    if (!sidebarOnly && !prismOnly) {
    await page.evaluate(()=>{
        const d=window.__ra2debug,f=window.__allied;
        f.actor=f.gi;
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);d.actionsApi.orderUnits([f.actor.id],10);
    });
    await page.waitForFunction(()=>window.__allied.actor.deployerTrait.isDeployed());
    await stage('GI-deployed-idle'); await startClip();
    report.giDirections=[];
    const offsets=smoke?[[-3,3],[3,-3]]:[[0,-3],[-3,-3],[-3,0],[-3,3],[0,3],[3,3],[3,0],[3,-3]];
    for (const offset of offsets) {
        const placement=await page.evaluate(({offset,openArena})=>{
            const d=window.__ra2debug,f=window.__allied,u=f.actor;
            d.actionsApi.orderUnits([u.id],11);
            if(openArena&&f.target&&!f.target.isDestroyed)d.game.destroyObject(f.target,undefined,true);
            f.target=f.spawn('HTNK',7,{rx:u.tile.rx+offset[0],ry:u.tile.ry+offset[1]},f.enemy);
            f.target.attackTrait.setDisabled(true);f.target.moveTrait.setDisabled(true);
            d.actionsApi.orderUnits([u.id],2,f.target.id);
            return {actor:[u.tile.rx,u.tile.ry],target:[f.target.tile.rx,f.target.tile.ry]};
        },{offset,openArena});
        if(openArena)assert.deepEqual(placement.target,placement.actor.map((v,i)=>v+offset[i]));
        await page.waitForFunction(()=>window.__allied.actor.isFiring,undefined,{timeout:15000});
        const trace=await page.evaluate(async()=>{
            const d=window.__ra2debug,f=window.__allied,trace=[],start=performance.now();
            while(performance.now()-start<2500){
                const u=f.actor,r=d.renderableManager.getRenderableByGameObject(u),b=r.shpRenderable.builder,n=b.getFrame();
                const native=b.shpFile?.getImage?.(n),hd=b.hdOverride;
                trace.push({tick:d.game.currentTick,frame:n,direction:u.direction,action:r.currentSequenceParams?.type,stance:u.stance,
                    firing:u.isFiring,hd:hd?.identity,atlas:hd?.frames[n],native:native&&{x:native.x,y:native.y,width:native.width,height:native.height},
                    source:b.shpFile?.filename,shadow:{separate:!!r.shpRenderable.shadowRenderable,embedded:b.embeddedShadow,smoothCoverage:b.smoothCoverage},
                    depth:r.shpRenderable.get3DObject().position.z,opacity:b.opacity,forceTransparent:b.forceTransparent});
                await new Promise(resolve=>requestAnimationFrame(resolve));
            }return trace;
        });
        report.giDirections.push({offset,placement,trace});
        await stage('GI-fire-'+offset.join('_'));
    }
    await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id],11));
    await page.waitForTimeout(500);await stage('GI-fire-end');
    await page.evaluate(()=>window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id],10));
    await page.waitForFunction(()=>!window.__allied.actor.deployerTrait.isDeployed());
    await stage('GI-undeployed');await stopClip('GI-native-facing-sweep');
    if(openArena){
        const frames=new Set(report.giDirections.flatMap(d=>d.trace.map(t=>t.frame)));
        const expected=smoke?[...Array.from({length:6},(_,i)=>327+i),...Array.from({length:6},(_,i)=>351+i)]:Array.from({length:48},(_,i)=>315+i);
        for(const n of expected)assert(frames.has(n),'Missing native deployed frame '+n);
    }
    }
    // Actual category switching, including a cold first page and rapid supersession.
    if (!prismOnly && !worldOnly) {
    report.sidebar=[];await startClip();
    for (const tab of [0,1,2,3,0,2,1,3,2,0,2,0,2]) {
        const evidence=await page.evaluate(async tab=>{
            const d=window.__ra2debug,card=d.gameScreen.hud.sidebarCard,model=d.gameScreen.sidebarModel;
            const start=performance.now();model.selectTab(tab);
            const trace=[];
            for(let i=0;i<15;i++){
                trace.push({elapsed:performance.now()-start,tab:model.activeTabId,pending:!!card.cancelPreparation,
                    published:card.publishedItems?.map(u=>u.target.rules.name),
                    slots:card.slotObjects.map((o,i)=>({frame:o.builder.getFrame(),hd:o.isHdArtwork,visible:o.get3DObject().visible,
                        label:card.nameObjects[i]?.value,target:card.publishedItems?.[i]?.target.rules.name,
                        expectedFrame:card.publishedItems?.[i]&&card.props.cameoNameToIdMap.get(card.publishedItems[i].cameo+'.shp'),
                        price:card.publishedItems?.[i]?.target?.rules?.cost}))});
                await new Promise(resolve=>requestAnimationFrame(resolve));
            }return {requested:tab,trace};
        },tab);
        report.sidebar.push(evidence);
    }
    report.rapid=await page.evaluate(async()=>{
        const d=window.__ra2debug,c=d.gameScreen.hud.sidebarCard,m=d.gameScreen.sidebarModel;
        for(const tab of [3,1,2,0,3,2]){m.selectTab(tab);c.handleFrame();await new Promise(resolve=>setTimeout(resolve,1));}
        await new Promise(resolve=>setTimeout(resolve,800));
        return {tab:m.activeTabId,published:c.publishedItems?.map(u=>u.target.rules.name),expected:m.activeTab.items.slice(c.pagingOffset,c.pagingOffset+c.props.slots).map(u=>u.target.rules.name),pages:c.artworkPages?.pages.size,metrics:c.artworkPages?.store.metrics()};
    });
    await stage('sidebar-final-infantry');await stopClip('sidebar-category-switching');
    if(report.rapid.published)assert.deepEqual(report.rapid.published,report.rapid.expected);
    report.hdOff=await page.evaluate(async()=>{
        const d=window.__ra2debug;d.generalOptions.graphics.hdEnabled.value=false;
        await new Promise(resolve=>setTimeout(resolve,300));
        const card=d.gameScreen.hud.sidebarCard;
        return {slots:card.slotObjects.filter(o=>o.get3DObject().visible).map(o=>o.isHdArtwork),published:card.publishedItems?.map(u=>u.target.rules.name),metrics:card.artworkPages?.store.metrics()};
    });
    assert(report.hdOff.slots.every(value=>!value));
    await stage('sidebar-hd-off');
    report.teardown=await page.evaluate(()=>{
        const d=window.__ra2debug,card=d.gameScreen.hud.sidebarCard;
        d.gameScreen.gameAnimationLoop.stop();
        card.getUiObject().destroy();
        return {pages:card.artworkPages?.pages.size,metrics:card.artworkPages?.store.metrics()};
    });
    if(report.teardown.pages!==undefined)assert.equal(report.teardown.pages,0);
    }
} catch(error){failure=error;}
await s.close(failure);
if(failure)throw failure;
console.log(report.status);
