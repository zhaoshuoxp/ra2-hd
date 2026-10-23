import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const file=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},offline:true});
    const errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
    await page.goto(pathToFileURL(file).href,{timeout:90000});
    assert.equal(await page.locator('article').count(),4);
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    const clips=[];
    for(const button of await page.locator('nav button').all()) {
        const label=await button.textContent();await button.click();
        await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,undefined,{timeout:30000});
        const meta=await page.evaluate(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};});
        assert.equal(meta.width,3840);assert.equal(meta.height,2160);assert(meta.duration>0);clips.push({label,...meta});
    }
    assert.equal(clips.length,9);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:output.replace(/\.json$/,'.png')});
    await fs.writeFile(output,JSON.stringify({status:'PASS_OFFLINE_FEEDBACK_REVIEW',clips,images:await page.locator('img').count(),errors,external},null,2)+'\n',{flag:'wx'});
    console.log('PASS',clips.length,'4K clips');
} finally {await browser.close();}
