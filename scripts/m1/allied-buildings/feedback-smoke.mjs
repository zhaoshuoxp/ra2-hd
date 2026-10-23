// Two affected-family probes reuse the prior full combined and shared checks.
import { feedbackActions } from './feedback-actions.mjs';
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const folder = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const only = process.argv.find(a => a.startsWith('--case='))?.slice(7);
await fs.mkdir(output, { recursive: false });
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const cases = {
    'yr-temperate': ['GAPOWR','GAPOWR','GAPOWR','GAPOWR','GTGCAN','GAPILL','GAAIRC','AMRADR','GACSPH','GAWEAT'],
    'ra2-snow': ['GAPOWR','GAPOWR','GAPOWR','GAPOWR','GTGCAN','GAPILL','GAAIRC','GACSPH','GAWEAT'],
};
const report = { status: 'RUNNING', build: folder, cases: [], errors: [] };
try {
    for (const [key, families] of Object.entries(cases).filter(([k]) => !only || k === only)) {
        const [edition, theater] = key.split('-'), snow = theater === 'snow';
        const out = path.join(output,key); await fs.mkdir(out);
        const profile = path.join(out,'profile');
        const app = await electron.launch({ executablePath: path.join(folder,'Red Alert 2 HD Offline Trainer R1.app/Contents/MacOS/RA2 HD Editions'),
            cwd: '/private/tmp', args: [], env: { ...process.env, RA2_DESKTOP_USER_DATA:profile, RA2_DESKTOP_NO_DISCOVERY:'0' } });
        const check = { key, edition, theater, status:'RUNNING' }; report.cases.push(check);
        try {
            const page = await app.firstWindow();
            page.on('pageerror',error => report.errors.push({key,error:error.stack}));
            await page.locator(`[data-edition=${edition}]`).click({timeout:60000});
            await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor({timeout:90000});
            check.registration = JSON.parse(await fs.readFile(path.join(profile,'resource-registration.json'),'utf8'));
            assert.equal(check.registration.directory,path.join(folder,'RA2-HD-Editions-Resources'));
            await page.evaluate(({edition,snow}) => {
                const d=window.__ra2debug; d.generalOptions.graphics.hdEnabled.value=true;
                const map=snow?'MP26S6.map':'MP01T4.map';
                const prefs={_r_lastMap:edition==='yr'?'X'+map:map,_r_lastMode:'1',_r_lastCountry:'1',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
                    _r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])};
                for(const [k,v] of Object.entries(prefs))localStorage.setItem(`_edition:${edition}:${k}`,v);
            },{edition,snow});
            await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).click();
            await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
            await page.evaluate(()=>window.__ra2debug.skirmishLobby.startGame(1700000000000));
            await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
            assert.equal(await page.evaluate(()=>window.__ra2debug.theater.type),snow?4:1);
            await page.evaluate(()=>{
                const d=window.__ra2debug,g=d.game;
                for(const bot of g.botManager.bots.values())bot.onGameTick=()=>{};
                g.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAll();
                const mcv=d.localPlayer.getOwnedObjects().find(u=>u.name==='AMCV');
                d.actionsApi.orderUnits([mcv.id],10);
            });
            await page.waitForFunction(()=>window.__ra2debug.localPlayer.getOwnedObjects().some(u=>u.name==='GACNST'&&u.buildStatus===1),undefined,{timeout:30000});
            check.placements=await page.evaluate(families=>{
                const d=window.__ra2debug,g=d.game,p=d.localPlayer;
                const base=p.getOwnedObjects().find(u=>u.name==='GACNST'),worker=g.getConstructionWorker(p);
                const tiles=g.map.tiles.getAll().filter(t=>g.map.isWithinBounds(t)).sort((a,b)=>Math.hypot(a.rx-base.tile.rx,a.ry-base.tile.ry)-Math.hypot(b.rx-base.tile.rx,b.ry-base.tile.ry));
                window.__alliedFixtures=[{name:'GACNST',id:base.id}];
                for(const name of families){
                    const tile=tiles.find(t=>worker.canPlaceAt(name,t,{ignoreAdjacent:true,normalizedTile:true}));
                    if(!tile)throw Error(`No legal ${name} site`);
                    const unit=worker.placeAt(name,tile,true)[0];
                    window.__alliedFixtures.push({name,id:unit.id,tile:[tile.rx,tile.ry]});
                }
                for(const name of ['E2','TTNK']){
                    const rules=g.rules.getObject(name,name==='E2'?3:7);
                    const tile=tiles.find(t=>g.map.terrain.getPassableSpeed(t,rules.speedType,false,false)>0&&!g.map.getGroundObjectsOnTile(t).length);
                    const unit=g.createUnitForPlayer(rules,p);g.spawnObject(unit,tile);
                    (window.__controlUnits??=[]).push({name,id:unit.id});
                }
                d.worldInteraction.minimapHandler.panToTile(base.tile);
                return window.__alliedFixtures;
            },families);
            await page.waitForFunction(()=>window.__alliedFixtures.every(f=>{
                const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.id===f.id),r=d.renderableManager.getRenderableByGameObject(u);
                return u.buildStatus===1&&r?.mainObj?.builder.hdOverride&&(!r.turret||r.buildingTurretHd);
            })&&window.__ra2debug.sovietUnitsHd.families.TTNK?.status==='READY',undefined,{timeout:90000});
            check.bindings=await page.evaluate(()=>window.__alliedFixtures.map(f=>{
                const d=window.__ra2debug,u=d.localPlayer.getOwnedObjects().find(u=>u.id===f.id),r=d.renderableManager.getRenderableByGameObject(u);
                return {name:f.name,id:f.id,identity:r.mainObj.builder.hdOverride.identity,frame:r.mainObj.builder.getFrame(),
                    nativeShadow:r.mainObj.builder.hasShadow,owner:u.owner.color,foundation:u.art?.foundation,
                    turretParts:r.buildingTurretHd?.originals.length};
            }));
            check.allocation=await page.evaluate(()=>{
                const d=window.__ra2debug,w=d.worldView;
                const baseline=(w.conscriptHd?.report.gpuBytes??0)+(w.powerPlantHd?.report.gpuBytes??0)+(w.napowrHd?.report.gpuBytes??0)
                    +[...(w.rhinoHd?.parts.values()??[])].reduce((n,p)=>n+p.bitmap.width*p.bitmap.height*5+p.palette.image.data.byteLength,0);
                const buildings=Object.fromEntries(Object.entries(w.sovietBuildingsHd).map(([name,f])=>[name,f.report]));
                const demand=d.sovietUnitsHd;
                const eager=Object.entries(buildings).filter(([name])=>!demand.families[name]).reduce((n,[,f])=>n+f.gpuBytes,0);
                return {baseline,eager,demand,total:baseline+eager+demand.gpuBytes,limit:256*1024*1024,buildings,
                    controls:window.__controlUnits.map(f=>{const u=d.localPlayer.getOwnedObjects().find(u=>u.id===f.id),r=d.renderableManager.getRenderableByGameObject(u);return {name:f.name,keys:Object.keys(r),hd:!!(r.shpRenderable?.builder.hdOverride||r.conscriptHd||r.unitVxlHd||r.vxlHd),report:f.name==='E2'?d.conscriptHd:d.sovietUnitsHd.families[f.name]};})};
            });
            assert(check.allocation.total<=check.allocation.limit);
            assert.equal(check.allocation.demand.families.TTNK.status,'READY');
            await page.screenshot({path:path.join(out,'combined.png')});
            check.feedback=await feedbackActions(page,out,key==='yr-temperate');
            check.status='PASS';
        }finally{await app.close();}
        const trace=JSON.parse(await fs.readFile(path.join(profile,'last-session.json'),'utf8'));
        check.startup=trace.records.find(e=>e.type==='hd-startup-ready');
        assert(check.startup);assert.deepEqual(check.startup.missingFamilies,[]);
        check.unavailable=trace.records.filter(e=>e.type==='hd-unavailable').map(e=>e.family);
        assert.deepEqual(check.unavailable.sort(),['unit-sqd','unit-yuripr']);
        await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
        console.log(key,'PASS',check.allocation.total);
    }
    assert.deepEqual(report.errors,[]);report.status='PASS_PACKAGED_FEEDBACK_CASES';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
console.log(report.status,report.failure??'');
