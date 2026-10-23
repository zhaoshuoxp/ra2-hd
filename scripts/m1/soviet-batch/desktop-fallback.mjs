// Fault injection uses disposable resource copies and one isolated batch profile.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const artifact=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const output=path.resolve(process.env.M16B_OUTPUT??`.artifacts/m1-6b/fallback-${Date.now()}`);
await fs.mkdir(output,{recursive:false});
const root=path.join(output,'external data é'),profile=path.join(output,'profile');
await fs.mkdir(profile);await fs.mkdir(root);
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:root}));
for(const relative of ['ra2-core-manifest.json','assets/ra2/ra2.mix','assets/ra2/language.mix','assets/ra2/multi.mix',
    'upstream-support/manifest.json','upstream-support/general.csf','upstream-support/ra2cd.mix']) {
    await fs.mkdir(path.dirname(path.join(root,relative)),{recursive:true});
    await fs.copyFile(path.resolve('.local',relative),path.join(root,relative),constants.COPYFILE_FICLONE);
}
const dirs=new Set(['conscript-authored/1','rhino-authored/1']);
for(const familyPath of ['power-plant-authored/1','soviet-power-plant-authored/2',...['nahand','narefn','naweap','nacnst'].map(n=>`soviet-${n}-authored/2`)]) {
    dirs.add(familyPath);
    const family=JSON.parse(await fs.readFile(path.resolve('.local/hd-packs',familyPath,'family.json'),'utf8'));
    for(const m of family.members)dirs.add(`${m.packId}/${m.revision}`);
}
for(const dir of dirs)await fs.cp(path.resolve('.local/hd-packs',dir),path.join(root,'hd-packs',dir),{recursive:true});
const report={status:'RUNNING',profile,resourceRoot:root,cases:[]};
const save=()=>fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
async function run(name,family,expected,solo=false) {
    const row={name,family,expected,errors:[]};report.cases.push(row);
    const app=await electron.launch({executablePath:artifact.executable,cwd:'/private/tmp',
        env:{...process.env,RA2_DESKTOP_USER_DATA:profile,RA2_DESKTOP_NO_DISCOVERY:'1'},timeout:60000});
    try {
        const page=await app.firstWindow();page.on('pageerror',e=>row.errors.push(e.stack));
        await page.getByText('Offline Skirmish',{exact:true}).waitFor({timeout:90000});
        await page.evaluate(({family,solo})=>{
            const g=window.__ra2debug.generalOptions.graphics;
            for(const key of ['conscript','powerPlant','napowr','rhino'])g[`${key}Hd`].value=true;
            for(const key of ['nahand','narefn','naweap','nacnst'])g[`${key}Hd`].value=!solo||key===family;
            Object.entries({_r_lastMap:'MP01T4.map',_r_lastMode:'1',_r_lastCountry:'5',_r_lastColor:'1',_r_lastStartPos:'0',_r_lastTeam:'0',
                _r_hostOpts:'6;10000;0;1;1;0;1;0;;0;1;0;0',_r_lastBots:JSON.stringify([null,null,null,{d:4,c:5,co:2,s:3,t:1},null,null,null,null])})
                .forEach(([k,v])=>localStorage.setItem(k,v));
        },{family,solo});
        await page.getByText('Offline Skirmish',{exact:true}).click();
        await page.waitForFunction(()=>window.__ra2debug?.skirmishLobby);
        await page.evaluate(()=>window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(()=>window.__ra2debug?.game?.status===1,undefined,{timeout:90000});
        row.effective=await page.evaluate(()=>{
            const d=window.__ra2debug;return {families:d.sovietBuildingsHd,conscript:d.conscriptHd,powerPlant:d.powerPlantHd,
                napowr:d.napowrHd,rhino:d.rhinoHd,gl:d.renderer.renderer.getContext().getError(),
                counts:Object.fromEntries(Object.entries(d.worldView.sovietBuildingsHd).map(([name,f])=>[name,f.overrides.size]))};
        });
        for(const [id,loaded] of Object.entries(row.effective.families)) {
            assert.equal(loaded.density,id.toLowerCase()===family?expected:2);
            assert.equal(row.effective.counts[id],loaded.density===1?0:({NAHAND:2,NAREFN:8,NAWEAP:8,NACNST:5})[id]);
        }
        assert.equal(row.effective.conscript.density,4);assert.equal(row.effective.powerPlant.density,4);
        assert.equal(row.effective.napowr.density,4);assert.equal(row.effective.rhino.status,'READY');
        assert.equal(row.effective.gl,0);assert.deepEqual(row.errors,[]);
        row.status='PASS';
    } catch(error) {row.status='FAIL';row.reason=error.stack;report.status='FAIL';throw error;}
    finally {await app.close();await save();}
    console.log(name,row.status);
}
async function corrupt(family,density,callback) {
    const manifest=JSON.parse(await fs.readFile(path.join(root,`hd-packs/soviet-${family}-authored/2/family.json`),'utf8'));
    const member=manifest.members[0],dir=path.join(root,`hd-packs/${member.packId}/${member.revision}`);
    const pack=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
    const file=path.join(dir,pack.variants.find(v=>v.density===density).pages[0].data);
    await fs.rename(file,file+'.preserved');await fs.writeFile(file,'Corrupt disposable test page');
    try {await callback();}finally {await fs.unlink(file);await fs.rename(file+'.preserved',file);}
}
try {
    await run('nahand-solo-4x','nahand',4,true);
    await corrupt('nahand',4,()=>run('nahand-corrupt-4x-falls-to-2x','nahand',2,true));
    for(const name of ['nahand','narefn','naweap','nacnst']) {
        const file=path.join(root,`hd-packs/soviet-${name}-authored/2/family.json`);
        await fs.rename(file,file+'.preserved');
        try {await run(`${name}-missing-family`,name,1);}finally {await fs.rename(file+'.preserved',file);}
        await corrupt(name,2,()=>run(`${name}-corrupt-2x`,name,1));
    }
    report.status='PASS_INDEPENDENT_BATCH_FALLBACK';await save();
} finally {console.log('OUTPUT',output);}
