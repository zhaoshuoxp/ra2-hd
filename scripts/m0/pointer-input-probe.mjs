import { chromium } from '@playwright/test';
import fs from 'node:fs';
const output='.artifacts/m0-2a/automated-input';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false});
const result={browser:browser.version(),physicalInput:false,cases:[]};
try {
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:4001/?mode=automation');
 await page.click('#capture');await page.waitForTimeout(500);
 result.cases.push({factor:'default Playwright launch',data:await page.evaluate(()=>window.manualInputResult)});
 await page.keyboard.press('Escape');
 await page.bringToFront();
 await page.click('#capture');await page.waitForTimeout(500);
 result.cases.push({factor:'only added page.bringToFront()',data:await page.evaluate(()=>window.manualInputResult)});
} finally {fs.writeFileSync(`${output}/result.json`,JSON.stringify(result,null,2));await browser.close();}
