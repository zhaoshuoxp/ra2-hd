// Validate the real launcher, then a small actual-HD sample from the extracted ZIP.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const folder=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
await fs.mkdir(out,{recursive:false});
const launcher=path.join(folder,'Launch Loading Optimized.command');
const resources=path.join(folder,'RA2-HD-Editions-Resources');
const appPath=path.join(folder,'RA2 HD Loading Optimized.app');
const boot=await electron.launch({executablePath:launcher,args:[],cwd:'/private/tmp',timeout:60000,
    env:{...process.env,RA2_DESKTOP_NO_DISCOVERY:'1'}});
try {
    const page=await boot.firstWindow();
    await page.locator('[data-edition=yr]').waitFor({timeout:90000});
    assert.equal(await boot.evaluate(({app})=>app.getPath('userData')),path.join(folder,'Trainer-Review-Profile'));
    const registration=JSON.parse(await fs.readFile(path.join(folder,'Trainer-Review-Profile/resource-registration.json'),'utf8'));
    assert.equal(registration.directory,resources);
    await fs.writeFile(path.join(out,'launcher.json'),JSON.stringify({status:'PASS_REAL_RELOCATED_LAUNCHER',registration},null,2)+'\n');
} finally {await boot.close();}
const receipt=path.join(out,'extracted-receipt.json');
await fs.writeFile(receipt,JSON.stringify({app:appPath,resources}));
const cases=[];
for(const [edition,density] of [['yr',4],['ra2',2]]) {
    const s=await startSession(receipt,path.join(out,edition),edition,false,async({page})=>{
        await page.evaluate(d=>window.__ra2debug.generalOptions.graphics.hdDensity.value=d,density);
    });let failure;
    try {
        await s.page.evaluate(()=>{
            const f=window.__allied;
            f.buildings=['GAAIRC','AMRADR','ATESLA'].map((name,i)=>f.building(name,{rx:f.center.rx+8+i*6,ry:f.center.ry+8}));
            for(let i=0;i<5;i++)f.building('GAPOWR');
            f.actor=f.spawn('E1',3,{rx:f.center.rx+20,ry:f.center.ry-10});
        });
        await s.page.waitForFunction(()=>{
            const f=window.__allied,d=window.__ra2debug;
            return f.sample(f.actor).shpHd&&f.buildings.every(u=>d.renderableManager.getRenderableByGameObject(u)?.mainObj.builder.hdOverride);
        },undefined,{timeout:90000});
        s.report.packageHdBindings=await s.page.evaluate(()=>{
            const f=window.__allied,d=window.__ra2debug;
            return {gi:d.renderableManager.getRenderableByGameObject(f.actor).shpRenderable.builder.hdOverride.identity,
                buildings:f.buildings.map(u=>{
                    const r=d.renderableManager.getRenderableByGameObject(u);
                    return {name:u.name,body:r.mainObj.builder.hdOverride.identity,
                        active:r.animObjects.get(2).map(o=>({visible:o.get3DObject().visible,hd:o.builder.hdOverride?.identity}))};
                })};
        });
        assert(s.report.packageHdBindings.gi.endsWith('/'+density));
        assert(s.report.packageHdBindings.buildings.every(u=>u.active.every(o=>o.hd&&o.hd.endsWith('/'+density))));
        await s.stage('extracted-zip-hd');
    }catch(error){failure=error;}
    await s.close(failure);if(failure)throw failure;
    assert.equal(s.report.status,'PASS_SELECTED_NATIVE_CASES');
    cases.push({edition,density,status:s.report.status,bindings:s.report.packageHdBindings});
}
const result={status:'PASS_COPIED_DESKTOP_ZIP_LAUNCHER_AND_ACTUAL_HD_BOTH_EDITIONS',folder,resources,cases};
await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
console.log(result.status);
