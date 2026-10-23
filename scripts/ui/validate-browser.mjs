import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const locale=JSON.parse(await fs.readFile('public/res/locale/zh-CN.json','utf8'));
const labels=Object.fromEntries(['campaign','skirmish','lan','movies','options','exit'].map(k=>[k,locale['hd:menu'+k]]));
labels.continue=locale['gui:continue'];
const output='.artifacts/menu-ui/browser-v1';await fs.mkdir(output,{recursive:true});
execFileSync('bun',['build','scripts/ui/home-fixture.tsx','--target','browser','--outfile',output+'/fixture.js']);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report={status:'RUNNING',errors:[],external:[]};
try {
 const page=await browser.newPage({viewport:{width:900,height:700},deviceScaleFactor:2});page.on('pageerror',e=>report.errors.push(e.stack));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url==='http://127.0.0.1:4188/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="ra2web-root" data-ui-hd style="position:relative;height:400px"></div><p id="alert"></p><script src="/fixture.js"></script>'});
  if(url==='http://127.0.0.1:4188/style.css')return route.fulfill({contentType:'text/css',body:await fs.readFile('public/css/main-legacy.css')});
  if(url==='http://127.0.0.1:4188/fixture.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(output+'/fixture.js')});
  report.external.push(url);return route.abort();
 });
 await page.goto('http://127.0.0.1:4188/');
 for(const name of [labels.campaign,labels.lan,labels.movies]) {
  const button=page.getByRole('button',{name,exact:true});assert(await button.isDisabled());
  const r=await button.boundingBox();await page.mouse.click(r.x+r.width/2,r.y+r.height/2);
  await button.evaluate(b=>{b.focus();b.click();b.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});
 }
 assert.deepEqual(await page.evaluate(()=>window.routeLog),[]);
 await page.getByRole('button',{name:labels.skirmish,exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),labels.options);
 await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),labels.exit);await page.keyboard.press('Enter');
 assert((await page.locator('#alert').textContent()).includes(locale['hd:menubrowserexit']));
 assert(!page.isClosed());await page.screenshot({path:output+'/browser-exit.png'});
 await page.getByRole('button',{name:labels.skirmish,exact:true}).focus();await page.keyboard.press('Space');assert.equal((await page.evaluate(()=>window.routeLog)).length,1);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.status='PASS_BROWSER_NATIVE_BUTTONS';
} catch(e){report.status='FAIL';report.failure=e.stack;throw e;}
finally {await fs.writeFile(output+'/result.json',JSON.stringify(report,null,2));await browser.close();}
