import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const folder=path.resolve('.artifacts/allied-buildings/feedback-review-v1');
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={status:'RUNNING',errors:[],externalRequests:[]};
try {
    const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:2});
    page.on('pageerror',e=>report.errors.push(e.stack));
    page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
    await page.goto(pathToFileURL(path.join(folder,'Allied-Buildings-Corrections.html')).href);
    report.animations=await page.evaluate(()=>window.reviewReady);
    assert.equal(report.animations.length,20);
    assert(report.animations.every(a=>a.density===2&&a.columns===3));
    await page.evaluate(()=>document.querySelectorAll('button.play').forEach(b=>b.click()));
    report.layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.equal(report.layout.scroll,report.layout.viewport);
    await page.screenshot({path:path.join(folder,'review-top.png')});
    for(const name of ['GAPILL','GAAIRC','GAWEAT']) {
        const section=page.locator(`#${name} .animation`).first();
        const slider=section.locator('input');
        await slider.fill(name==='GAAIRC'?'4':'3');
        const selected=await section.locator('output').textContent();
        assert(selected.startsWith(name==='GAAIRC'?'4':'3'));
        await section.locator('select').selectOption('2');
        await section.scrollIntoViewIfNeeded();
        await section.screenshot({path:path.join(folder,`${name}-inspection.png`)});
    }
    report.images=await page.evaluate(async()=>Promise.all([...document.querySelectorAll('img')].map(async im=>{await im.decode();return im.naturalWidth>0;})));
    assert(report.images.every(Boolean));
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
    report.status='PASS_OFFLINE_DENSITY_AND_CONTROLS';
} catch(error) {report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally {await browser.close();await fs.writeFile(path.join(folder,'html-check.json'),JSON.stringify(report,null,2));}
console.log(report.status,report.failure??'');
