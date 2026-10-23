import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve('.artifacts/m1-7-yr');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--no-first-run']});
const report = {status:'RUNNING',errors:[],network:[]};
try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
    page.on('pageerror', e=>report.errors.push(e.message));
    page.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url());});
    await page.goto(pathToFileURL(path.join(root,'YR-Soviet-Units-Review-v2.html')).href);
    await page.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode())));
    report.images = await page.locator('img').count();
    report.samples = await page.locator('.sample').count();
    assert.equal(report.images,58); assert.equal(report.samples,24);
    assert.equal(await page.locator('section:visible').count(),5);
    await page.screenshot({path:path.join(root,'review-native-v2.png'),fullPage:true});
    await page.locator('[data-filter=infantry]').click();
    assert.equal(await page.locator('section:visible').count(),3);
    await page.locator('[data-filter=air]').click();
    assert.equal(await page.locator('section:visible').count(),2);
    await page.locator('#scale').selectOption('2');
    await page.screenshot({path:path.join(root,'review-air-2x-v2.png'),fullPage:true});
    await page.locator('#scale').selectOption('4');
    report.scale = await page.locator('#SCHP .sprite').first().evaluate(e=>({width:e.getBoundingClientRect().width,native:parseFloat(e.style.getPropertyValue('--w'))}));
    assert.equal(report.scale.width,report.scale.native*4);
    await page.locator('#SCHP summary').click();
    assert(await page.locator('#SCHP .boards').isVisible());
    assert.equal(report.errors.length,0);assert.equal(report.network.length,0);
    report.status='PASS_OFFLINE_EMBEDDED_REPRESENTATIVE_REVIEW';
} catch(error){report.status='FAIL';report.errors.push(error.stack);throw error;}
finally {await fs.writeFile(path.join(root,'review-check-v2.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(report.status,report.samples,report.images);
