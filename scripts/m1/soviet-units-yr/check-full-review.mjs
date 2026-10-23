import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve('.artifacts/m1-7-yr');
const report={status:'RUNNING',errors:[],network:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--no-first-run']});
try {
    const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
    page.on('pageerror',error=>report.errors.push(error.stack));
    page.on('request',request=>{if(/^https?:/.test(request.url()))report.network.push(request.url());});
    await page.goto(pathToFileURL(path.join(root,'YR-Soviet-Units-Full-Review-v1.html')).href,{timeout:90000});
    await page.waitForFunction(()=>window.__motionReady);
    await page.locator('#play').click();
    report.summary=await page.evaluate(()=>window.__reviewSummary);
    assert.equal(report.summary.slots,1072);assert.equal(report.summary.owners,2);
    report.decoded=await page.evaluate(async()=>{
        let patches=0,frames=0;
        for(const unit of Object.values(data))for(const owner of ['0','1']) {
            await loadImage(unit.backgrounds[owner]);
            for(const pair of Object.values(unit.images[owner]))for(const row of Object.values(pair)) {
                if(row.src){await loadImage(row.src);patches++;}frames++;
            }
        }
        await Promise.all([...document.images].map(im=>im.decode()));
        return {patches,frames,contacts:document.images.length};
    });
    assert.equal(report.decoded.frames,4288);assert.equal(report.decoded.contacts,3);
    report.controls=[];
    for(const unit of report.summary.units) {
        await page.locator('#unit').selectOption(unit);
        for(const owner of ['0','1']) {
            await page.locator('#owner').selectOption(owner);
            const checks=await page.evaluate(async()=>{
                let directions=0,actions=0;
                for(const action of Object.keys(data[$('unit').value].sequences)) {
                    $('action').value=action;facings();actions++;
                    for(const facing of Object.keys(data[$('unit').value].sequences[action])) {
                        $('facing').value=facing;phase=frames().length-1;await draw();directions++;
                    }
                }
                return {actions,directions};
            });
            report.controls.push({unit,owner,...checks});
        }
        await page.locator('#action').selectOption('Ready');
        await page.locator('#owner').selectOption('0');
        await page.locator('#scale').selectOption('1');
        await page.waitForFunction(()=>window.__drawnFrame.scale===1);
        assert.equal(await page.locator('#hd').evaluate(c=>c.getBoundingClientRect().width),180);
        await page.screenshot({path:path.join(root,`full-review-${unit.toLowerCase()}-native.png`)});
    }
    await page.locator('#scale').selectOption('4');
    await page.waitForFunction(()=>window.__drawnFrame.scale===4);
    assert.equal(await page.locator('#hd').evaluate(c=>c.getBoundingClientRect().width),720);
    report.videos=await page.evaluate(async()=>{
        const results=[];
        for(const video of document.querySelectorAll('video')) {
            video.closest('details').open=true;
            await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error(video.error?.message));video.load();});
            results.push({width:video.videoWidth,height:video.videoHeight,readyState:video.readyState});
        }
        return results;
    });
    assert.equal(report.videos.length,4);assert(report.videos.every(v=>v.width>0&&v.height===1080));
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.network,[]);
    report.status='PASS_OFFLINE_COMPLETE_FAMILY_EMBEDDED_REVIEW';
} catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;}
finally {await fs.writeFile(path.join(root,'full-review-check-v1.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(report.status);
