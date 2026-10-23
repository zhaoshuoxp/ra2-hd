// Browser regression: real synthetic media decoding and object-URL disposal.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const output=process.env.M02A_OUTPUT??'.artifacts/m0-2a/menu-lifecycle';
fs.mkdirSync(output,{recursive:true});
execFileSync('bun',['build','scripts/m0/menu-fixture.tsx','--target','browser','--outfile',`${output}/fixture.js`]);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const result={browser:browser.version(),cases:[],errors:[],external:[]};
try {
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const url=route.request().url();
  if(url==='http://127.0.0.1:4000/__m02a-menu.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(`${output}/fixture.js`)});
  if(url==='http://127.0.0.1:4000/__m02a-menu')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="root"></div><script src="/__m02a-menu.js"></script>'});
  if(/^(blob|data):/.test(url))return route.continue();
  result.external.push(url);return route.abort();
 });
 await context.addInitScript(()=>{
  window.mediaEvents=[];window.urls=[];
  document.addEventListener('error',e=>{if(e.target?.matches?.('source,video'))window.mediaEvents.push({type:e.type,tag:e.target.tagName,src:e.target.src});},true);
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);window.urls.push({action:'create',url});return url;};
  URL.revokeObjectURL=url=>{window.urls.push({action:'revoke',url});return revoke(url);};
 });
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4000/__m02a-menu');
 await page.waitForFunction(()=>window.setMenu);
 for(const kind of ['none','empty-string','whitespace','empty-file']){
  await page.evaluate(kind=>window.setMenu(kind),kind);await page.waitForTimeout(100);
  const count=await page.locator('video,source').count();assert.equal(count,0);result.cases.push({kind,mediaElements:count});
 }
 result.syntheticBytes=await page.evaluate(()=>window.makeClip());assert.ok(result.syntheticBytes>0);
 await page.evaluate(()=>window.makeExternalUrl());
 for(const kind of ['file','url','file','unmount','file']){
  await page.evaluate(kind=>window.setMenu(kind),kind);
  if(kind==='unmount'){assert.equal(await page.locator('video').count(),0);continue;}
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,undefined,{timeout:10000});
  const initial=await page.evaluate(()=>document.querySelector('video').currentTime);
  await page.waitForTimeout(200);
  const state=await page.evaluate(()=>{const v=document.querySelector('video');return {readyState:v.readyState,time:v.currentTime,paused:v.paused,src:v.currentSrc,source:v.querySelector('source')?.getAttribute('src')};});
  assert.ok(!state.paused&&state.time!==initial&&state.source);result.cases.push({kind,...state});
 }
 await page.evaluate(()=>{window.setMenu('unmount');window.releaseExternalUrl();});
 result.mediaEvents=await page.evaluate(()=>window.mediaEvents);
 result.urls=await page.evaluate(()=>window.urls);
 const created=result.urls.filter(e=>e.action==='create').map(e=>e.url).sort(),revoked=result.urls.filter(e=>e.action==='revoke').map(e=>e.url).sort();
 assert.deepEqual(created,revoked);assert.deepEqual(result.mediaEvents,[]);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);
 result.status='PASS';
} catch(e){result.status='FAIL';result.failure=e.stack;throw e;}
finally {fs.writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2));await browser.close();}
