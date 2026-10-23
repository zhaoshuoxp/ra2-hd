import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const build = path.resolve(process.argv[2] ?? '.artifacts/menu-ui/build-v1');
const output = path.resolve(process.argv[3] ?? `.artifacts/menu-ui/run-${Date.now()}`);
await fs.mkdir(output,{recursive:true});
const profile=path.join(output,'profile'); await fs.mkdir(profile,{recursive:true});
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:path.resolve('.local')}));
const app=await electron.launch({executablePath:process.env.UI_EXECUTABLE ?? await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),cwd:'/private/tmp',args:process.env.UI_EXECUTABLE ? [] : [build],env:{...process.env,RA2_UI_REVIEW:'1',RA2_DESKTOP_USER_DATA:profile,RA2_DESKTOP_NO_DISCOVERY:'1'},timeout:60000});
try {
 const page=await app.firstWindow();const errors=[];page.on('console',m=>{if(m.type()==='error') console.log(m.text());});page.on('pageerror',e=>errors.push(e.stack));
 await page.waitForFunction(()=>document.querySelectorAll('button.menu-button').length===6,undefined,{timeout:90000});
 await page.waitForTimeout(3000);
 await page.screenshot({path:path.join(output,'menu.png')});
 console.log(JSON.stringify(await page.evaluate(()=>({buttons:[...document.querySelectorAll('button.menu-button')].map(b=>({text:b.textContent,disabled:b.disabled,rect:b.getBoundingClientRect().toJSON()})),ui:window.__ra2debug?.uiArt?.metrics(),debugKeys:Object.keys(window.__ra2debug??{}),root:document.querySelector('#ra2web-root')?.getBoundingClientRect().toJSON()})),null,2));
 console.log('errors',errors);
 await fs.writeFile(path.join(output,'errors.json'),JSON.stringify(errors));
} finally {await app.close();}
console.log(output);
