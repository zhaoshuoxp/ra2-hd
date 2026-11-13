import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
await fs.mkdir(out,{recursive:false});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'ra2-feedback-review-only-'));
const copy=path.join(temporary,'review.html');await fs.copyFile(file,copy);
const report={status:'RUNNING',errors:[],external:[],views:[],scope:'Only a copied self-contained HTML artifact in an isolated headless browser; no game or real profile access.'};
let browser;
try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',error=>report.errors.push(error.stack));
    page.on('request',request=>{if(/^https?:/.test(request.url()))report.external.push(request.url());});
    await page.goto(pathToFileURL(copy).href,{timeout:120000,waitUntil:'load'});
    await page.locator('img').evaluateAll(images=>images.forEach(img=>img.loading='eager'));
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),undefined,{timeout:90000});
    report.decodedFrames=await page.evaluate(async()=>{let count=0;for(const sequence of sequences)for(const frame of sequence.frames){const img=new Image();img.src=frame.src;await img.decode();count++;}return count;});
    const comparisons=page.locator('[data-comparison]');
    for(let i=0;i<await comparisons.count();i++){
        const section=comparisons.nth(i),slider=section.locator('[data-split]');
        for(const value of['0','100']){
            await slider.fill(value);
            assert((await section.locator('[data-split-label]').innerText()).startsWith(value+'% old / '));
            assert.equal(await section.locator('.stack').evaluate(el=>el.style.getPropertyValue('--split')),value+'%');
        }
        await slider.fill('50');
        await section.getByRole('button',{name:'Actual pixels',exact:true}).click();
        const size=await section.locator('.stack').evaluate(el=>({width:el.getBoundingClientRect().width,
            expected:el.querySelector('img').naturalWidth}));
        assert.equal(size.width,size.expected);
        await section.getByRole('button',{name:'Fit to page',exact:true}).click();
    }
    report.comparisons=await comparisons.count();
    const groups=page.locator('[data-sequence]');
    for(let i=0;i<await groups.count();i++){
        const section=groups.nth(i),slider=section.locator('[data-slider]'),max=await slider.getAttribute('max');
        await slider.fill(max);await section.locator('[data-image]').evaluate(img=>img.decode());
        assert((await section.locator('output').innerText()).startsWith(String(Number(max)+1)+' / '));
        await section.getByRole('button',{name:'Play frames',exact:true}).click();await page.waitForTimeout(330);
        await section.getByRole('button',{name:'Pause frames',exact:true}).click();
        await slider.fill('0');
    }
    for(const width of[1440,768]){
        await page.setViewportSize({width,height:1000});
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
        assert(!overflow);report.views.push({width,overflow:false});
        await page.screenshot({path:path.join(out,`native-review-${width}.png`)});
    }
    assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
    report.images=await page.evaluate(()=>window.__reviewImageCount);
    report.status='PASS_ISOLATED_OFFLINE_NATIVE_REVIEW_ALL_EMBEDDED_FRAMES_CONTROLS_AND_TWO_VIEWPORTS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{await browser?.close();await fs.rm(temporary,{recursive:true,force:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
