import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]??'.artifacts/soviet-remaining/review-v3'),report={status:'RUNNING',errors:[],families:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050},deviceScaleFactor:2});page.on('pageerror',e=>report.errors.push(e.stack));
 await page.goto(pathToFileURL(path.join(root,'review.html')).href,{timeout:90000});await page.waitForFunction(()=>window.__review?.players.length===13);
 assert.equal(await page.locator('.card').count(),13);
 await page.locator('#pause').click();
 await page.locator('#motions').click();
 for(const family of await page.evaluate(()=>window.__review.data.map(f=>f.id))){
  const card=page.locator(`[data-family="${family}"]`);await card.locator('.next').click();
  const state=await card.evaluate(card=>({label:card.querySelector('.frame').textContent,src:card.querySelector('.hd').getAttribute('src').slice(0,22),width:card.querySelector('.hd').getBoundingClientRect().width}));
  assert(state.label.startsWith('2/'));assert.equal(state.src,'data:image/png;base64,');report.families.push({family,...state});
 }
 await page.locator('#materials').click();await page.locator('#scale').selectOption('1');
 assert(await page.evaluate(()=>window.__review.players.every(p=>p.card.querySelector('.hd').getBoundingClientRect().width===p.f.size[0])));
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(root,'browser-native.png')});
 await page.locator('#motions').click();await page.locator('#scale').selectOption('2');await page.locator('#background').selectOption('#c9c6b8');
 assert(await page.evaluate(()=>window.__review.players.every(p=>p.card.querySelector('.hd').getBoundingClientRect().width===p.f.size[0]*2)));
 assert(await page.evaluate(()=>[...document.querySelectorAll('.pair')].every(p=>p.scrollWidth<=p.clientWidth)));
 await page.locator('[data-family="NAMISL"]').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(root,'browser-motion-detail.png')});
 await page.locator('#scale').selectOption('1');await page.locator('#pause').click();await page.locator('#speed').selectOption('6');
 // Global Play resumes cards paused by manual stepping.
 assert(await page.evaluate(()=>window.__review.players.every(p=>p.playing)));
 const before=await page.evaluate(()=>window.__review.players.map(p=>p.index));await page.waitForTimeout(900);
 const after=await page.evaluate(()=>window.__review.players.map(p=>p.index));assert(after.some((n,i)=>n!==before[i]));
 assert.deepEqual(report.errors,[]);report.status='PASS_13_FAMILY_DASHBOARD';
}catch(e){report.status='FAIL';report.failure=e.stack;process.exitCode=1}finally{await fs.writeFile(path.join(root,'browser-check.json'),JSON.stringify(report,null,2));await browser.close();}
