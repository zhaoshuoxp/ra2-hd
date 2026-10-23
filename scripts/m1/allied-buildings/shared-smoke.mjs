import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const reusedHeadings=process.argv.find(a=>a.startsWith('--reuse-headings='))?.split('=')[1];
await fs.mkdir(out,{recursive:false});
const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
const catalog=JSON.parse(await fs.readFile('desktop/allied-building-coverage.json','utf8'));
const selected=JSON.parse(await fs.readFile(path.join(folder,'RA2-HD-Editions-Resources',catalog['gapill-temperate'].familyPath),'utf8'));
const report={status:'RUNNING',errors:[]};
let app;
try{
    app=await electron.launch({executablePath:path.join(folder,'Red Alert 2 HD Offline Trainer R1.app/Contents/MacOS/RA2 HD Editions'),cwd:'/private/tmp',args:[],
        env:{...process.env,RA2_DESKTOP_USER_DATA:path.join(out,'profile'),RA2_DESKTOP_NO_DISCOVERY:'0'}});
    const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.stack));
    await page.locator('[data-edition=ra2]').click({timeout:60000});
    await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor({timeout:90000});
    await page.evaluate(()=>{
        const d=window.__ra2debug;d.generalOptions.graphics.hdEnabled.value=true;
        for(const[k,v]of Object.entries({_r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:'1',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
            _r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])}))localStorage.setItem('_edition:ra2:'+k,v);
    });
    await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).click();
    await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
    await page.evaluate(()=>window.__ra2debug.skirmishLobby.startGame(1700000000000));
    const fixture=async(mode)=>{
        await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
        await page.evaluate(()=>{
            const d=window.__ra2debug,g=d.game,p=d.localPlayer,home=p.getOwnedObjects().find(u=>u.name==='AMCV').tile;
            for(const b of g.botManager.bots.values())b.onGameTick=()=>{};
            g.mapShroudTrait.getPlayerShroud(p).revealAll();
            window.sharedActors={};
            for(const [i,name]of ['GTGCAN','NASAM','GAPILL'].entries()){
                const u=g.createObject(2,name),tile=g.map.tiles.getByMapCoords(home.rx-7+i*4,home.ry-6);
                g.changeObjectOwner(u,p);g.spawnObject(u,tile);window.sharedActors[name]=u;
            }
            d.worldInteraction.minimapHandler.panToTile(home);
        });
        await page.waitForFunction(mode=>{
            const d=window.__ra2debug;
            return Object.entries(window.sharedActors).every(([name,u])=>{
                const r=d.renderableManager.getRenderableByGameObject(u);
                if(!r?.mainObj?.get3DObject().visible)return false;
                if(mode==='off')return !r.mainObj.builder.hdOverride&&!r.buildingTurretHd;
                if(mode==='corrupt'&&name==='GAPILL')return d.sovietUnitsHd.families.GAPILL.status==='FAILED'&&!r.mainObj.builder.hdOverride;
                return !!r.mainObj.builder.hdOverride&&(!r.turret||r.buildingTurretHd);
            });
        },mode,{timeout:90000});
        return page.evaluate(()=>Object.entries(window.sharedActors).map(([name,u])=>{const r=window.__ra2debug.renderableManager.getRenderableByGameObject(u);return {name,identity:r.mainObj.builder.hdOverride?.identity??null,turret:!!r.buildingTurretHd};}));
    };
    report.on=await fixture('on');
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    const render=()=>page.evaluate(()=>{const d=window.__ra2debug;for(const scene of d.renderer.getScenes()){scene.scene.updateMatrixWorld(false);scene.meshBatchManager?.updateMeshes();}d.renderer.render();});
    report.headings=[];
    if(reusedHeadings){
        const previous=JSON.parse(await fs.readFile(path.join(reusedHeadings,'result.json'),'utf8'));
        assert.equal(previous.headings.length,8);report.headings=previous.headings;
        report.reusedHeadingEvidence=path.resolve(reusedHeadings);
        for(let h=0;h<360;h+=45)await fs.copyFile(path.join(reusedHeadings,`heading-${h}.png`),path.join(out,`heading-${h}.png`));
    }
    for(let heading=0;!reusedHeadings&&heading<360;heading+=45){
        const binding=await page.evaluate(heading=>{
            const d=window.__ra2debug;
            return ['GTGCAN','NASAM'].map(name=>{const u=window.sharedActors[name],r=d.renderableManager.getRenderableByGameObject(u);u.turretTrait.facing=heading;r.update(0);
                return {name,heading,active:[...r.buildingTurretHd.meshes].filter(([,m])=>m[1].visible).map(([h])=>h),parts:r.buildingTurretHd.originals.length};});
        },heading);
        for(const b of binding)assert.deepEqual(b.active,[heading]);
        await render();await page.screenshot({path:path.join(out,`heading-${heading}.png`)});report.headings.push(binding);
    }
    await page.evaluate(()=>{const d=window.__ra2debug;for(const u of Object.values(window.sharedActors)){if(u.turretTrait)u.turretTrait.facing=0;d.renderableManager.getRenderableByGameObject(u).update(0);}});
    report.sameView=[];
    const cdp=await page.context().newCDPSession(page);
    for(const [width,height]of [[1920,1080],[3840,2160]]){
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});
        await render();await page.screenshot({path:path.join(out,`hd-${height}.png`)});
        report.sameView.push(await page.evaluate(()=>({width:innerWidth,height:innerHeight,camera:window.__ra2debug.worldScene.camera.position,hd:window.sharedActors.GTGCAN.id})));
    }
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await page.waitForFunction(()=>innerWidth===1920&&innerHeight===1080);
    report.owner=await page.evaluate(()=>{
        const d=window.__ra2debug,u=window.sharedActors.GTGCAN,enemy=d.game.getCombatants().find(p=>p!==d.localPlayer);
        const before=u.owner.color;d.game.changeObjectOwner(u,enemy);d.renderableManager.getRenderableByGameObject(u).update(0);return {before,after:u.owner.color};
    });
    await render();await page.screenshot({path:path.join(out,'owner-change.png')});
    const restart=async(enabled)=>{
        await page.evaluate(enabled=>{const d=window.__ra2debug;window.oldDemand=d.sovietUnitsHd;window.oldWorld=d.worldView;window.oldGame=d.game;d.generalOptions.graphics.hdEnabled.value=enabled;},enabled);
        await page.evaluate(async()=>{await window.r.reset;});
        await page.waitForFunction(()=>window.__ra2debug?.game?.status===1&&window.__ra2debug.game!==window.oldGame,undefined,{timeout:90000});
        const disposal=await page.evaluate(()=>({bytes:window.oldDemand.gpuBytes,unitsDisposed:window.oldWorld.sovietUnitsHd===undefined,buildings:Object.keys(window.oldWorld.sovietBuildingsHd).length}));
        assert.deepEqual(disposal,{bytes:0,unitsDisposed:true,buildings:0});return disposal;
    };
    report.disposal=await restart(false);report.off=await fixture('off');
    await page.evaluate(()=>window.__ra2debug.gameScreen.gameAnimationLoop.stop());await render();
    await page.screenshot({path:path.join(out,'original-1080.png')});
    const route=`**/local-hd/${selected.members[0].sha256}/manifest.json`;
    let rejected=0;await page.route(route,async request=>{rejected++;await request.fulfill({status:200,contentType:'application/json',body:'{"corrupt":true}'});});
    report.secondDisposal=await restart(true);report.fallback=await fixture('corrupt');
    report.injectedRequests=rejected;assert(rejected>0);
    report.failureReason=await page.evaluate(()=>window.__ra2debug.sovietUnitsHd.families.GAPILL);
    await page.screenshot({path:path.join(out,'whole-family-fallback.png')});
    await page.unroute(route);
    assert.deepEqual(report.errors,[]);report.status='PASS_SHARED_BEHAVIOR';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally{if(app)await app.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));}
console.log(report.status,report.failure??'');
