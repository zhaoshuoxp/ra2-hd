import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2] ?? '.artifacts/allied-units/review-v1');
const receipt = JSON.parse(await fs.readFile(path.join(root, 'receipt.json'), 'utf8'));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--disable-background-networking','--no-first-run'] });
const errors = [], external = [];
try {
  const context = await browser.newContext({ viewport: {width:1440,height:1050}, deviceScaleFactor:2, offline:true });
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if (/^https?:/.test(r.url())) external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'Allied-Units-Representative-Review.html')).href, {waitUntil:'load'});
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  const native = await page.evaluate(()=>({
    failed:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length,
    images:document.images.length, articles:document.querySelectorAll('article').length,
    comparisons:document.querySelectorAll('.sample').length,
    overflow:document.documentElement.scrollWidth>innerWidth,
    density:[...document.querySelectorAll('.image')].map(i=>({buffer:i.naturalWidth,display:i.getBoundingClientRect().width})),
  }));
  assert.equal(native.failed,0); assert.equal(native.articles,receipt.entries.length); assert.equal(native.comparisons,receipt.entries.reduce((n,e)=>n+e.samples.length,0));
  assert.equal(native.overflow,false); assert(native.density.every(x=>x.buffer===x.display*2));
  await page.screenshot({path:path.join(root,'qa-top.png')});
  await page.locator('#ground').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'qa-ground.png')});
  await page.locator('#airnaval').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'qa-air-naval.png')});
  await page.locator('#scale').click();
  const inspect = await page.evaluate(()=>[...document.querySelectorAll('.image')].map(i=>({buffer:i.naturalWidth,display:i.getBoundingClientRect().width})));
  assert(inspect.every(x=>x.buffer===x.display));
  await page.locator('#scale').click();
  assert.deepEqual(errors,[]); assert.deepEqual(external,[]);
  await fs.writeFile(path.join(root,'html-check.json'),JSON.stringify({status:'PASS_OFFLINE_REPRESENTATIVE_REVIEW',...native,
    density:undefined,fullDensityBuffers:true,inspectionToggle:true,external,errors},null,2)+'\n',{flag:'wx'});
  console.log('PASS',native.articles,'boards',native.comparisons,'comparisons',native.images,'embedded images');
} finally { await browser.close(); }
