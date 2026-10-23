// Retest only the unresolved injected-corruption case; preserve prior passes.
import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),previous=path.resolve(process.argv[4]);
await fs.mkdir(out,{recursive:false});
const old=JSON.parse(await fs.readFile(path.join(previous,'result.json'),'utf8'));
assert(old.on?.length===3&&old.off?.length===3&&old.sameView?.length===2&&old.headings?.length===8);
assert.deepEqual(old.disposal,{bytes:0,unitsDisposed:true,buildings:0});
assert.deepEqual(old.secondDisposal,old.disposal);
for(const file of await fs.readdir(previous))if(file.endsWith('.png'))await fs.copyFile(path.join(previous,file),path.join(out,file));
const {failure,...report}=old;report.status='RUNNING';report.reusedSharedEvidence=previous;report.priorUnresolvedFailure=failure;
const catalog=JSON.parse(await fs.readFile('desktop/allied-building-coverage.json','utf8'));
const family=JSON.parse(await fs.readFile(path.join(folder,'RA2-HD-Editions-Resources',catalog['gapill-temperate'].familyPath),'utf8'));
const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
let app,page;
try{
    app=await electron.launch({executablePath:path.join(folder,'Red Alert 2 HD Offline Trainer R1.app/Contents/MacOS/RA2 HD Editions'),cwd:'/private/tmp',args:[],
        env:{...process.env,RA2_DESKTOP_USER_DATA:path.join(out,'profile'),RA2_DESKTOP_NO_DISCOVERY:'0'}});
    page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.stack));
    await page.locator('[data-edition=ra2]').click({timeout:60000});
    await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor({timeout:90000});
    await page.evaluate(sha=>{
        const nativeFetch=window.fetch.bind(window);window.__injectedFetches=0;
        window.fetch=async(...args)=>{const url=typeof args[0]==='string'?args[0]:args[0].url;
            const response=await nativeFetch(...args);
            if(url===`/local-hd/${sha}/manifest.json`){window.__injectedFetches++;return new Response('{"corrupt":true}',{status:200,headers:{'Content-Type':'application/json'}});}
            return response;};
        window.__ra2debug.generalOptions.graphics.hdEnabled.value=true;
        for(const[k,v]of Object.entries({_r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:'1',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
            _r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])}))localStorage.setItem('_edition:ra2:'+k,v);
    },family.members[0].sha256);
    await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).click();await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
    await page.evaluate(()=>window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
    await page.evaluate(()=>{
        const d=window.__ra2debug,g=d.game,p=d.localPlayer,home=p.getOwnedObjects().find(u=>u.name==='AMCV').tile;
        for(const b of g.botManager.bots.values())b.onGameTick=()=>{};
        g.mapShroudTrait.getPlayerShroud(p).revealAll();window.sharedActors={};
        for(const[i,name]of ['GTGCAN','NASAM','GAPILL'].entries()){
            const u=g.createObject(2,name);g.changeObjectOwner(u,p);g.spawnObject(u,g.map.tiles.getByMapCoords(home.rx-7+i*4,home.ry-6));window.sharedActors[name]=u;
        }
        d.worldInteraction.minimapHandler.panToTile(home);
    });
    await page.waitForFunction(()=>['GTGCAN','NASAM','GAPILL'].every(name=>['READY','FAILED','BUDGET_FALLBACK'].includes(window.__ra2debug.sovietUnitsHd.families[name]?.status)),undefined,{timeout:90000});
    report.fallback=await page.evaluate(()=>Object.entries(window.sharedActors).map(([name,u])=>{const d=window.__ra2debug,r=d.renderableManager.getRenderableByGameObject(u);return{name,identity:r.mainObj.builder.hdOverride?.identity??null,turret:!!r.buildingTurretHd,status:d.sovietUnitsHd.families[name]};}));
    report.injectedRequests=await page.evaluate(()=>window.__injectedFetches);assert(report.injectedRequests>0);
    const bad=report.fallback.find(f=>f.name==='GAPILL');assert.equal(bad.identity,null);assert.equal(bad.status.status,'FAILED');assert.equal(bad.status.gpuBytes,0);
    for(const good of report.fallback.filter(f=>f.name!=='GAPILL')){assert(good.identity);assert.equal(good.status.status,'READY');}
    await page.waitForFunction(()=>['GTGCAN','NASAM'].every(name=>window.__ra2debug.renderableManager.getRenderableByGameObject(window.sharedActors[name]).buildingTurretHd));
    await page.screenshot({path:path.join(out,'whole-family-fallback.png')});
    report.failureReason=bad.status;report.injectionBoundary='One fetched manifest response replaced after native resource fetch; resource files remain unchanged.';
    assert.deepEqual(report.errors,[]);report.status='PASS_SHARED_BEHAVIOR';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;
    if(page)report.diagnostics=await page.evaluate(()=>({injected:window.__injectedFetches,demand:window.__ra2debug?.sovietUnitsHd})).catch(()=>null);
}finally{if(app)await app.close();await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));}
console.log(report.status,report.failure??'');
