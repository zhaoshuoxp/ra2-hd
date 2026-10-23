import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
const [buildArgument, outputArgument] = process.argv.slice(2);
const build = path.resolve(buildArgument), out = path.resolve(outputArgument);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', layouts: [], languages: [], errors: [], consoleErrors: [] };
try {
    for (const edition of ['ra2', 'yr']) {
        const profile = path.join(out, 'profile-' + edition); await fs.mkdir(profile);
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
        const app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: [build], cwd: '/private/tmp',
            env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_UI_RESOURCE_ROOT: path.resolve('.local') }, timeout: 60000 });
        try {
            const page = await app.firstWindow();
            page.on('pageerror', e => report.errors.push(e.stack));
            page.on('console', e => { if (e.type() === 'error') report.consoleErrors.push(e.text()); });
            await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
            await page.waitForSelector('.hd-menu-scene', { timeout: 90000 });
            const cdp = await page.context().newCDPSession(page);
            for (const [width, height] of [[1024,768],[1280,720],[1280,800],[1512,982],[2560,1080],[900,1200]]) {
                await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
                await page.waitForTimeout(450);
                await page.waitForSelector('.hd-menu-scene');
                const measure = async selector => page.evaluate(selector => {
                    const main = window.__ra2debug.mainMenu;
                    const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
                    const root = rect(document.getElementById('ra2web-root'));
                    const scene = rect(document.querySelector(selector));
                    const sidebar = rect(main.sidebarContainer.getHtmlContainer().getElement());
                    const status = main.statusBar.getHtmlContainer().getElement();
                    return { root, scene, sidebar, statusPosition: rect(status), menuScale: main.menuScale,
                        logical: main.viewport, canvas: [window.innerWidth,window.innerHeight],
                        table: document.querySelector('.score-wrapper') && rect(document.querySelector('.score-wrapper')) };
                }, selector);
                const home = await measure('.hd-menu-scene');
                assert(Math.abs(home.scene.right - home.sidebar.x) <= 2, 'Home background must meet sidebar');
                assert(Math.abs(home.scene.bottom - home.statusPosition.y) <= 2, 'Home background must meet bottom bar');
                assert(Math.abs(home.scene.x - home.root.x) <= 2 && Math.abs(home.scene.y-home.root.y)<=2, 'No left or top gap');
                const animation = await page.evaluate(() => getComputedStyle(document.querySelector('.hd-menu-sweep')).transform);
                await page.waitForTimeout(120);
                assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.hd-menu-sweep')).transform), animation, 'HD loop must advance');
                await page.screenshot({ path: path.join(out, `${edition}-home-${width}x${height}.png`) });
                for (const side of edition === 'ra2' ? [0,1] : [0,1,4]) {
                    await page.evaluate(async side => {
                        const players = Array.from({ length:8 }, (_,i) => ({ name:'Player '+(i+1), color:i?'#77c9ff':'#ffee55', score:100-i,
                            isObserver:false, defeated:!!i, isAi:false, country:{ name:side===0?'Americans':side===1?'Russians':'YuriCountry',side }, getUnitsKilled:()=>8, getUnitsLost:()=>2 }));
                        const game = { id:'layout', currentTime: 314000, gameOpts:{ mapTitle:'Responsive result layout' }, getNonNeutralPlayers:()=>players };
                        await window.__ra2debug.mainMenuController.goToScreenBlocking(12,{ game,localPlayer:players[0],singlePlayer:true,tournament:false,returnTo:{screenType:0,params:{}} });
                    }, side);
                    await page.waitForSelector('.score-scene');
                    const score = await measure('.score-scene');
                    assert(Math.abs(score.scene.right-score.sidebar.x)<=2, 'Result background must meet sidebar');
                    assert(Math.abs(score.scene.bottom-score.statusPosition.y)<=2, 'Result background must meet status bar');
                    assert(score.table.x>=score.scene.x && score.table.right<=score.scene.right, 'Result table must stay inside its background');
                    assert(score.table.bottom<=score.scene.bottom, 'Eight-player results must fit vertically');
                    const theme = await page.locator('.score-scene').getAttribute('data-score-theme');
                    report.layouts.push({edition,width,height,side,theme,home,score});
                    if (width===1280) await page.screenshot({path:path.join(out,`${theme}-${width}x${height}.png`)});
                }
                await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(0));
            }
            // Exercise the actual settings controls and verify persistence through reload.
            await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
            for (const language of ['en-US','zh-CN']) {
                await page.evaluate(() => window.__ra2debug.mainMenuController.goToScreenBlocking(16));
                await page.locator('[data-language-options] .select-value').click();
                await page.getByText(language==='en-US'?'English':'Chinese (Simplified)',{exact:true}).click();
                await page.waitForFunction(language=>document.documentElement.lang===language,language,{timeout:90000});
                await page.waitForFunction(()=>window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'),undefined,{timeout:90000});
                await page.getByRole('button', {name:language==='en-US'?'Skirmish':'遭遇战',exact:true}).waitFor({timeout:15000});
                const labels=await page.evaluate(()=>({lang:document.documentElement.lang,text:document.body.innerText,storage:localStorage.getItem('ra2hd.interfaceLanguage')}));
                assert.equal(labels.storage,language);assert.equal(labels.lang,language);
                if(language==='en-US')assert(labels.text.includes('Skirmish')&&labels.text.includes('Options'));
                report.languages.push({edition,language,status:'PASS_SETTINGS_RELOAD_AND_PERSISTENCE'});
                await page.screenshot({path:path.join(out,`${edition}-language-${language}.png`)});
            }
        } finally { await app.close(); }
    }
    assert.deepEqual(report.errors,[]);
    report.status='PASS_RESPONSIVE_HOME_FIVE_RESULT_THEMES_AND_LANGUAGE_SETTINGS';
} catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error);}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,layouts:report.layouts.length,languages:report.languages.length}));
