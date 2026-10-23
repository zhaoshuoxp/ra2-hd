import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const build=path.resolve(process.argv[2]??'.artifacts/menu-ui/build-v5');
const selectedRevision=process.argv.find(a=>a.startsWith('--selected-pack='))?.split('=')[1];
const output=path.resolve(process.argv[3]??`.artifacts/menu-ui/display-${Date.now()}`);await fs.mkdir(output,{recursive:false});
const profile=path.join(output,'profile');await fs.mkdir(profile,{recursive:true});
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:path.resolve('.local')}));
const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
const report={status:'RUNNING',errors:[]};let app,page;
async function launch(){app=await electron.launch({executablePath:await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),cwd:'/private/tmp',args:[build],env:{...process.env,RA2_UI_REVIEW:selectedRevision?'0':'1',RA2_DESKTOP_USER_DATA:profile,RA2_DESKTOP_NO_DISCOVERY:'1'}});page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.stack));await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor({timeout:90000});
 if(selectedRevision){await page.waitForFunction(revision=>window.__ra2debug.uiArt.revision===revision,selectedRevision);report.selectedRevision=selectedRevision;}
}
try {
 await launch();await page.getByRole('button',{name:locale['hd:menuoptions'],exact:true}).click();
 await page.getByRole('combobox',{name:'Display resolution'}).selectOption('fullscreen');await page.waitForTimeout(1200);
 report.fullscreen=await page.evaluate(()=>window.desktopDisplay.get());assert.equal(report.fullscreen.id,'fullscreen');
 await page.evaluate(()=>{window.__uiOptions=window.__ra2debug.mainMenuController.getCurrentScreen();for(let i=0;i<30;i++)window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(300);
 assert(await page.evaluate(()=>window.__uiOptions===window.__ra2debug.mainMenuController.getCurrentScreen()));
 await page.screenshot({path:path.join(output,'fullscreen-options.png')});
 await page.locator('[data-hd-family="all"] .select-value').click();await page.getByText('Off',{exact:true}).click();
 const back=await page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
 await page.getByText(back,{exact:true}).click();await page.getByRole('button',{name:locale['hd:menuskirmish'],exact:true}).waitFor();
 await app.close();app=undefined;await launch();
 report.persisted=await page.evaluate(()=>({hd:window.__ra2debug.generalOptions.graphics.hdEnabled.value,display:window.desktopDisplay.get()}));assert.equal(report.persisted.hd,false);
 report.status='PASS_NATIVE_FULLSCREEN_AND_HD_PERSISTENCE';
} catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1;console.error(e);}
finally {await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));if(app)await app.close();}
