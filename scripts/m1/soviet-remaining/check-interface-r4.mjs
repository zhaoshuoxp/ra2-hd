import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve('.artifacts/soviet-remaining/complete-review-r4');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,
    args:['--disable-background-networking','--disable-component-update','--no-first-run']});
const report={status:'RUNNING',errors:[],cursorFamilies:0,images:0};
try {
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
 page.on('pageerror',e=>report.errors.push(e.stack));
 await page.goto(pathToFileURL(path.join(root,'Target-Cursors-Review.html')).href);
 for(const section of await page.locator('section').all()) {
    await section.locator('img.hd').evaluate(i=>i.decode());
    assert.deepEqual(await section.locator('img.hd').evaluate(i=>[i.width,i.height]),[55,43]);
    const before=await section.locator('img.hd').getAttribute('src');await section.locator('.step').click();
    assert.notEqual(await section.locator('img.hd').getAttribute('src'),before);
    await section.locator('.play').click();await page.waitForTimeout(110);assert.equal(await section.locator('.play').textContent(),'Pause');await section.locator('.play').click();
    report.cursorFamilies++;
 }
 await page.locator('#zoom').click();assert.equal(await page.locator('img.hd').first().evaluate(i=>i.width),220);
 const frames=JSON.parse(await fs.readFile(path.join(root,'cursors/result.json'),'utf8')).frames;
 for(const row of frames)for(const v of row.variants){await page.evaluate(async file=>{const i=new Image();i.src='cursors/'+file;await i.decode()},v.file);report.images++}
 await page.goto(pathToFileURL(path.join(root,'Range-Markers-Review.html')).href);
 for(const i of await page.locator('img').all()){await i.evaluate(i=>i.decode());report.images++}
 await page.setViewportSize({width:390,height:844});await page.locator('button').click();
 assert.deepEqual(report.errors,[]);report.status='PASS_NATIVE_CURSOR_CONTROLS_AND_RANGE_MEDIA';
} finally {await fs.writeFile(path.join(root,'interface-browser-check.json'),JSON.stringify(report,null,2)+'\n');await browser.close()}
console.log(report);
