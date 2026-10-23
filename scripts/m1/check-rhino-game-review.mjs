import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const root='.artifacts/m1-3f/review-v1';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(`${root}/review.html`)).href);
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
    const images=await page.locator('img').evaluateAll(images=>images.map(i=>({file:i.getAttribute('src'),
        width:i.width,height:i.height,native:[i.naturalWidth,i.naturalHeight]})));
    assert.equal(images.length,48);assert(images.every(i=>i.width===i.native[0]&&i.height===i.native[1]));
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
    const duration=await page.locator('video').evaluate(v=>v.duration);
    // Decode a same-origin Blob to inspect source video pixels without native
    // player controls or the browser's temporary seek/buffering indicator.
    await page.locator('video').evaluate(async(v,data)=>{
        const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
        v.src=URL.createObjectURL(new Blob([bytes],{type:'video/webm'}));
        await new Promise(resolve=>v.addEventListener('loadeddata',resolve,{once:true}));
    },(await fs.readFile(`${root}/combat.webm`)).toString('base64'));
    for(const t of [1,2,4]) {
        await page.locator('video').evaluate((v,t)=>new Promise(resolve=>{
            v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;
        }),t);
        const png=await page.locator('video').evaluate(v=>{
            const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
            canvas.getContext('2d').drawImage(v,0,0);return canvas.toDataURL();
        });
        await fs.writeFile(`${root}/combat-${t}s.png`,Buffer.from(png.split(',')[1],'base64'));
    }
    await page.screenshot({path:`${root}/review-screen.png`});
    assert.deepEqual(errors,[]);
    await fs.writeFile(`${root}/review-check.json`,JSON.stringify({status:'PASS',nativeImages:images.length,duration,errors},null,2)+'\n');
} finally {await browser.close();}
