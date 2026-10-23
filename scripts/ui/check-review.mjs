import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try {
 const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1});
 for(const revision of ['review-v1','review-v2']){
  await page.goto(pathToFileURL(path.resolve('.artifacts/menu-ui',revision,'review.html')).href);
  const images=await page.locator('img').evaluateAll(images=>images.map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})));
  assert(images.every(i=>i.loaded));results.push({revision,images:images.length,status:'PASS'});
  await page.screenshot({path:path.resolve('.artifacts/menu-ui',revision,'page-preview.png'),fullPage:revision==='review-v2'});
 }
 await fs.writeFile('.artifacts/menu-ui/review-check.json',JSON.stringify(results,null,2));
} finally{await browser.close();}
