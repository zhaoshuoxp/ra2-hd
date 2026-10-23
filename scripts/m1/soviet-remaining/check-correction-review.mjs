import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve('.artifacts/soviet-remaining/proportion-review-v2');
const report={status:'RUNNING',errors:[],families:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking','--disable-component-update','--no-first-run']});
try {
    const page=await browser.newPage({viewport:{width:1500,height:1050},deviceScaleFactor:2});
    page.on('pageerror',e=>report.errors.push(e.stack));
    await page.goto(pathToFileURL(path.join(root,'review.html')).href,{timeout:90000});
    await page.waitForFunction(()=>window.__corrections?.players.length===5);
    assert.equal(await page.locator('.card').count(),5);
    assert(await page.evaluate(()=>window.__corrections.players.every(p=>p.card.querySelector('.cell img').getBoundingClientRect().width===p.f.size[0])));
    await page.locator('[data-family="NANRCT"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'native-reactor.png')});
    await page.locator('#motion').click();
    for(const family of await page.evaluate(()=>window.__corrections.data.map(f=>f.id))) {
        const card=page.locator(`[data-family="${family}"]`);
        await card.locator('.next').click();
        const label=await card.locator('.frame').textContent();assert(label.startsWith('2/'));
        report.families.push({family,label});
    }
    await page.locator('#scale').selectOption('2');
    assert(await page.evaluate(()=>window.__corrections.players.every(p=>p.card.querySelector('.cell img').getBoundingClientRect().width===2*p.f.size[0])));
    assert(await page.evaluate(()=>[...document.querySelectorAll('.images')].every(p=>p.scrollWidth<=p.clientWidth)));
    await page.locator('[data-family="TESLA"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'detail-tesla.png')});
    await page.locator('#play').click();
    const before=await page.evaluate(()=>window.__corrections.players.map(p=>p.index));
    await page.waitForTimeout(900);
    const after=await page.evaluate(()=>window.__corrections.players.map(p=>p.index));
    assert(after.some((n,i)=>n!==before[i]));assert.deepEqual(report.errors,[]);
    await page.setViewportSize({width:650,height:1000});await page.locator('#scale').selectOption('1');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    report.status='PASS_FIVE_CORRECTION_REVIEW';
} catch(e) {report.status='FAIL';report.failure=e.stack;process.exitCode=1;}
finally {await fs.writeFile(path.join(root,'browser-check.json'),JSON.stringify(report,null,2));await browser.close();}
