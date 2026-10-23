import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const out='.artifacts/m1-3f/options';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto('http://127.0.0.1:4070/');
    await page.getByText('Options',{exact:true}).click({timeout:45000});
    const field=page.locator('.general-opts .item').filter({hasText:'Rhino HD (local pack)'});
    assert.equal(await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.rhinoHd.value),false);
    await field.locator('.select-value').click();await field.getByText('HD',{exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.rhinoHd.value),true);
    await page.screenshot({path:`${out}/enabled.png`});
    const back=await page.evaluate(()=>window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
    await page.getByText(back,{exact:true}).click();await page.reload();
    await page.getByText('Offline Skirmish',{exact:true}).waitFor({timeout:45000});
    assert.equal(await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.rhinoHd.value),true);
    await page.getByText('Options',{exact:true}).click();
    await field.locator('.select-value').click();await field.getByText('Original',{exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.rhinoHd.value),false);
    await fs.writeFile(`${out}/result.json`,JSON.stringify({status:'PASS',defaultOriginal:true,uiSelection:true,persistedReload:true,uiRestoration:true})+'\n');
} finally {await browser.close();}
