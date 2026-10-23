import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const output=process.env.M02A_OUTPUT ?? '.artifacts/m0-2a/menu-before';
fs.mkdirSync(output,{recursive:true});
const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),requests:[],external:[],pageErrors:[],console:[],snapshots:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
result.browser=browser.version();
try {
 const context=await browser.newContext({viewport:{width:1280,height:960},serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const request=route.request(),url=request.url();result.requests.push({url,type:request.resourceType()});
  if(!url.startsWith('http://127.0.0.1:4000/')&&!/^(blob|data):/.test(url)){result.external.push(url);return route.abort();}
  return route.continue();
 });
 await context.addInitScript(()=>{
  window.mediaTrace=[];
  const inspect=(kind,node)=>{if(!node?.matches?.('source,video'))return;
   window.mediaTrace.push({kind,now:performance.now(),tag:node.tagName,src:node.getAttribute('src'),resolved:node.src,currentSrc:node.currentSrc,outer:node.outerHTML});};
  document.addEventListener('error',e=>inspect('error',e.target),true);
  new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')inspect('attribute',r.target);
   for(const n of r.addedNodes){inspect('inserted',n);n.querySelectorAll?.('video,source').forEach(n=>inspect('inserted-descendant',n));}}})
   .observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['src','type']});
 });
 const page=await context.newPage();
 page.on('pageerror',e=>result.pageErrors.push(e.stack));
 page.on('console',m=>{if(m.type()==='error'||/Video source:|MenuVideo|No playable video/.test(m.text()))result.console.push({type:m.type(),text:m.text()});});
 for(let i=0;i<2;i++){
  await page.goto('http://127.0.0.1:4000/');
  await page.getByText('Offline Skirmish',{exact:true}).waitFor({timeout:45000});
  await page.waitForTimeout(1500);
  result.snapshots.push(await page.evaluate(()=>({trace:window.mediaTrace,media:[...document.querySelectorAll('video,source')].map(n=>({tag:n.tagName,src:n.getAttribute('src'),outer:n.outerHTML})),attempts:window.__offlineAttempts})));
 }
} catch(e){result.harnessError=e.stack;throw e;}
finally {fs.writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2));await browser.close();}
