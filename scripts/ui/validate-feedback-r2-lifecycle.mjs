import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2), out = path.resolve(output);
const scanSteps = process.argv.includes('--capture-radar') ? 42 : 6;
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', cases: [], disclosure: 'Real skirmish startup, native Abort and normal victory processing and root reconstruction; viewport shapes are native-app CDP emulations.' };
const geometry = page => page.evaluate(() => {
    const d=window.__ra2debug,m=d.mainMenu;
    const width=m.viewport.width-m.getImage('sdtp.shp').width;
    const height=m.viewport.height-m.getImage('lwscrnl.shp').height;
    const a=m.mainBackground.get3DObject().scale,b=m.statusBackground.get3DObject().scale;
    const scene=document.querySelector('.hd-menu-scene,.score-scene');
    return { width,height,mainScale:[a.x,a.y],statusScale:b.x,
        expectedMain:[width/m.getImage('mnscrnl.shp').width,height/m.getImage('mnscrnl.shp').height],
        expectedStatus:width/m.getImage('lwscrnl.shp').width,
        scene:scene?{width:scene.getBoundingClientRect().width,height:scene.getBoundingClientRect().height}:undefined };
});
const check = value => {
    assert(Math.abs(value.mainScale[0]-value.expectedMain[0])<1e-6,'Main decorative mesh must retain its full width');
    assert(Math.abs(value.mainScale[1]-value.expectedMain[1])<1e-6,'Main decorative mesh must retain its full height');
    assert(Math.abs(value.statusScale-value.expectedStatus)<1e-6,'Bottom decorative mesh must meet the sidebar');
};
try {
    for (const [edition,density,finish] of [['ra2',2,'abort'],['yr',4,'native-victory']]) {
        const row={edition,density,finish,measurements:[],errors:[]};report.cases.push(row);
        const s=await startSession(receipt,path.join(out,edition),edition,false,async({page})=>{
            await page.evaluate(density=>{const g=window.__ra2debug.generalOptions.graphics;g.hdEnabled.value=true;g.hdDensity.value=density;},density);
            await page.getByRole('button',{name:/Skirmish|遭遇战/,exact:true}).waitFor({timeout:15000});
            const before=await geometry(page);check(before);row.measurements.push({stage:'fresh-home',...before});
            await page.screenshot({path:path.join(out,edition+'-fresh-home.png')});
            if(edition==='ra2'){
                row.motion=await page.locator('.hd-menu-sweep').evaluate(el=>({duration:getComputedStyle(el).animationDuration,state:getComputedStyle(el).animationPlayState,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
                assert.equal(row.motion.state,'running');
                const duration=parseFloat(row.motion.duration)*1000;
                const start=Date.now();row.scanFrames=[];
                for(let phase=0;phase<=scanSteps;phase++){
                    await page.waitForTimeout(Math.max(0,start+duration*phase/scanSteps-Date.now()));
                    const file=edition+`-scan-${phase}.png`;
                    await page.screenshot({path:path.join(out,file)});
                    row.scanFrames.push({file,elapsedMs:Date.now()-start,transform:await page.locator('.hd-menu-sweep').evaluate(el=>getComputedStyle(el).transform)});
                }
                assert.notEqual(row.scanFrames[0].transform,row.scanFrames[2].transform);
                await page.emulateMedia({reducedMotion:'reduce'});
                const first=await page.locator('.hd-menu-sweep').evaluate(el=>getComputedStyle(el).transform);
                await page.waitForTimeout(400);
                assert.notEqual(await page.locator('.hd-menu-sweep').evaluate(el=>getComputedStyle(el).transform),first);
                await page.emulateMedia({reducedMotion:null});
            }
            await page.getByRole('button',{name:/Options|设置/,exact:true}).click();
            await page.locator('[data-language-options]').waitFor();
            check(await geometry(page));await page.screenshot({path:path.join(out,edition+'-fresh-settings.png')});
            await page.evaluate(()=>window.__ra2debug.mainMenuController.goToScreenBlocking(0));
        },undefined,(edition==='yr'?'X':'')+'MP03T4.map',3);
        try{
            row.initial=await s.page.evaluate(()=>({tick:window.__ra2debug.game.currentTick,status:window.__ra2debug.game.status}));
            await s.page.waitForFunction(tick=>window.__ra2debug.game.currentTick>tick+20,row.initial.tick);
            if(finish==='abort'){
                const labels=await s.page.evaluate(()=>{const s=window.__ra2debug.gameScreen;s.menu.open();return{abort:s.strings.get('GUI:AbortMission'),quit:s.strings.get('GUI:Quit')};});
                await s.page.getByRole('button',{name:labels.abort,exact:true}).click();
                await s.page.getByRole('button',{name:labels.quit,exact:true}).click();
            }else{
                row.finishFixture=await s.page.evaluate(()=>{
                    const d=window.__ra2debug;
                    for(const bot of d.game.botManager.bots.values())bot.onGameTick=()=>{};
                    const enemies=d.game.getCombatants().filter(p=>p!==d.localPlayer);
                    for(const enemy of enemies)d.game.removeAllPlayerAssets(enemy);
                    return {nativeVictoryConditions:true,removedEnemyStartingAssets:enemies.map(p=>p.name)};
                });
            }
            await s.page.locator('.score-scene').waitFor({timeout:45000});
            const caption=await s.page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Continue'));
            await s.page.getByRole('button',{name:caption,exact:true}).waitFor({timeout:15000});
            const after=await geometry(s.page);check(after);row.measurements.push({stage:'real-post-match-score',...after});
            await s.page.screenshot({path:path.join(out,edition+'-post-match-score.png')});
            await s.page.getByRole('button',{name:caption,exact:true}).click();
            await s.page.waitForFunction(()=>window.__ra2debug.mainMenuController.getCurrentScreenType()===1);
            const back=await s.page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
            await s.page.getByRole('button',{name:back,exact:true}).click();
            await s.page.getByRole('button',{name:/Skirmish|遭遇战/,exact:true}).waitFor({timeout:15000});
            row.measurements.push({stage:'post-match-home',...await geometry(s.page)});check(row.measurements.at(-1));
            await s.page.getByRole('button',{name:/Options|设置/,exact:true}).click();
            await s.page.locator('[data-language-options]').waitFor();
            row.measurements.push({stage:'post-match-settings',...await geometry(s.page)});check(row.measurements.at(-1));
            await s.page.screenshot({path:path.join(out,edition+'-post-match-settings.png')});
            const cdp=await s.page.context().newCDPSession(s.page);
            for(const [width,height] of [[1024,768],[1280,720],[1280,800],[1512,982],[2560,1080],[900,1200]]){
                await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
                await s.page.waitForTimeout(350);
                const bounds=await geometry(s.page);check(bounds);
                row.measurements.push({stage:'post-match-settings-resized',viewport:[width,height],...bounds});
            }
            assert.deepEqual(s.report.errors,[]);row.errors=s.report.errors;row.consoleErrors=s.report.consoleErrors;
            assert.deepEqual(row.consoleErrors,[]);row.status='PASS_REAL_POST_MATCH_HOME_SCORE_SETTINGS_AND_DECORATIVE_MESH_BOUNDS';
        }finally{
            await s.app.close();
        }
        await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify({edition,finish,status:row.status}));
    }
    report.status='PASS_BOTH_NATIVE_END_PATHS_AND_POST_MATCH_LAYOUTS';
}catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report.status);
