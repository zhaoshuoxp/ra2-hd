import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
    const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
    const external=[];page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});
    await page.goto('file://'+path.join(root,'Allied-Buildings-Final-Review.html'));
    const result=await page.evaluate(async()=>{
        for(const image of document.images)image.loading='eager';
        await Promise.all([...document.images].map(i=>i.decode()));
        return {images:document.images.length,articles:document.querySelectorAll('article').length,
            failed:[...document.images].filter(i=>!i.naturalWidth).length,overflow:document.documentElement.scrollWidth>innerWidth,
            overflowing:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,id:e.id,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})),
            comparisonWidths:[...document.querySelectorAll('article')].map(a=>({id:a.id,widths:[...a.querySelectorAll('.strip > figure > img')].slice(0,4).map(i=>i.getBoundingClientRect().width)}))};
    });
    await fs.writeFile(path.join(root,'html-layout-inspection.json'),JSON.stringify(result,null,2));
    assert.equal(result.articles,20);assert.equal(result.failed,0);assert.equal(result.overflow,false);assert.deepEqual(external,[]);
    for(const row of result.comparisonWidths)assert(row.widths.every(w=>w===row.widths[0]),row.id);
    await page.screenshot({path:path.join(root,'html-top.png')});
    await page.locator('#GACNST').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'html-conyard.png')});
    await page.locator('#GAYARD details').evaluate(e=>e.open=true);await page.locator('#GAYARD').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'html-shipyard.png')});
    await fs.writeFile(path.join(root,'html-check.json'),JSON.stringify({status:'PASS_OFFLINE_REVIEW',...result,external},null,2));
    console.log(JSON.stringify({status:'PASS',images:result.images,articles:result.articles}));
}finally{await browser.close();}
