// Open only the generated offline artifact in a fresh headless review browser.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const folder=path.resolve(process.argv[2]);
const feedback=process.argv.includes('--feedback'),count=feedback?32:30;
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],external=[];
try {
    const page=await browser.newPage({viewport:{width:1500,height:1050}});
    page.on('pageerror',e=>errors.push(e.stack));
    page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
    await page.goto(pathToFileURL(path.join(folder,'Allied-Corrections-Review.html')).href,{timeout:120000,waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#frame').textContent.includes('Frame'),undefined,{timeout:60000});
    await page.locator('#play').click();
    assert.equal(await page.locator('#group option').count(),count);
    for(const [index,name] of (feedback?[[0,'prism'],[8,'prism-snow'],[20,'gi']]:[[2,'hq'],[12,'prism'],[27,'gi']])){
        await page.locator('#group').selectOption(String(index));
        await page.waitForFunction(()=>document.querySelector('#frame').textContent==='Frame 1 / 8');
        await page.locator('#step').click();
        assert.equal(await page.locator('#frame').textContent(),'Frame 2 / 8');
        await page.screenshot({path:path.join(folder,'review-'+name+'.png')});
    }
    await page.locator('#group').selectOption(feedback?'1':'13');
    await page.waitForFunction(()=>document.querySelector('#frame').textContent==='Frame 1 / 10');
    const selectedClip=feedback?page.locator('#clips details').filter({hasText:'feedback-yr-4x / ATESLA-native-cycle.webm'}).first():page.locator('#clips details').first();
    await selectedClip.locator('summary').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.src.startsWith('data:video/')));
    const playback=await selectedClip.locator('video').evaluate(async video=>{
        await video.play();await new Promise(resolve=>setTimeout(resolve,500));video.pause();
        return {time:video.currentTime,width:video.videoWidth,height:video.videoHeight,error:video.error?.message};
    });
    assert(playback.time>0&&!playback.error);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    const result={status:'PASS_OFFLINE_REVIEW',groups:count,playback,errors,external,overflow:false};
    await fs.writeFile(path.join(folder,'visual-qa.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
} catch(error) {
    await fs.writeFile(path.join(folder,'visual-qa-failure.json'),JSON.stringify({status:'FAIL_OFFLINE_REVIEW',error:error.stack,errors,external},null,2)+'\n');
    throw error;
} finally {await browser.close();}
