// Fault injection uses disposable resource copies and one isolated batch profile.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sovietBatchRevisions } from '../../../desktop/hd-profile.mjs';

const artifact=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const output=path.resolve(process.env.SOVIET_RUN??`.artifacts/soviet-remaining/fallback-${Date.now()}`);
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
for(const familyPath of ['power-plant-authored/1','soviet-power-plant-authored/2',...Object.entries(sovietBatchRevisions).map(([n,v])=>`soviet-${n}-authored/${v}`)]) {
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
            g.hdEnabled.value = family !== 'all-disabled';
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
            assert.equal(loaded.density,family==='all-disabled'||id.toLowerCase()===family?expected:2);
            assert.equal(row.effective.counts[id]===0,loaded.density===1);
        }
        assert.equal(row.effective.conscript.density,family==='all-disabled'?1:4);assert.equal(row.effective.powerPlant.density,family==='all-disabled'?1:4);
        assert.equal(row.effective.napowr.density,family==='all-disabled'?1:4);if(family!=='all-disabled')assert.equal(row.effective.rhino.status,'READY');
        assert.equal(row.effective.gl,0);assert.deepEqual(row.errors,[]);
        row.status='PASS';
    } catch(error) {row.status='FAIL';row.reason=error.stack;report.status='FAIL';throw error;}
    finally {await app.close();await save();}
    console.log(name,row.status);
}
async function corrupt(family,density,callback) {
    const manifest=JSON.parse(await fs.readFile(path.join(root,`hd-packs/soviet-${family}-authored/${sovietBatchRevisions[family]}/family.json`),'utf8'));
    const member=manifest.members[0],dir=path.join(root,`hd-packs/${member.packId}/${member.revision}`);
    const pack=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
    const file=path.join(dir,pack.variants.find(v=>v.density===density).pages[0].data);
    await fs.rename(file,file+'.preserved');await fs.writeFile(file,'Corrupt disposable test page');
    try {await callback();}finally {await fs.unlink(file);await fs.rename(file+'.preserved',file);}
}
try {
    await run('one-global-HD-switch-disables-every-family','all-disabled',1);
    for(const [family,fileName,operation] of [['nalasr','turret/90.png','missing'],['naflak','turret/315.mask','corrupt']]) {
        const file=path.join(root,`hd-packs/soviet-${family}-authored/${sovietBatchRevisions[family]}/${fileName}`);
        await fs.rename(file,file+'.preserved');
        try {
            if(operation==='corrupt')await fs.writeFile(file,'Corrupt disposable turret mask');
            await run(`${family}-${operation}-turret-whole-family-Original`,family,1);
        } finally {
            if(operation==='corrupt')await fs.unlink(file);
            await fs.rename(file+'.preserved',file);
        }
    }
    await corrupt('namisl',2,()=>run('namisl-corrupt-atlas-whole-family-Original','namisl',1));
    await corrupt('nayard',2,()=>run('nayard-corrupt-atlas-whole-family-Original','nayard',1));
    report.status='PASS_GLOBAL_SWITCH_AND_INDEPENDENT_WHOLE_FAMILY_FALLBACK';await save();
} finally {console.log('OUTPUT',output);}
