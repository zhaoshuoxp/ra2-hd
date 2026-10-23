import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2]);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--disable-background-networking', '--no-first-run'] });
const errors = [], external = [];
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, deviceScaleFactor: 2, offline: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.goto(pathToFileURL(path.join(root, 'Native-Slot-Review.html')).href);
  const result = await page.evaluate(async () => {
    playing = false;
    for (const pair of data.frames) for (const encoded of pair) {
      const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
    }
    const groups = Object.keys(data.sequences);
    for (const key of groups) {
      action.value = key; cursor = 0; draw();
      if (!document.querySelector('#frame').textContent.includes(String(data.sequences[key][0]))) throw Error(key);
    }
    action.value = groups.find(key => key.startsWith('Deployed /')) ?? groups[0]; cursor = 0; draw();
    await Promise.all([...document.images].map(image => image.decode()));
    const authored = document.querySelector('#authored');
    if (authored.naturalWidth !== authored.width * 2) throw Error('Native-size density mismatch');
    return { frames: data.frames.length, groups: groups.length, nativeSize: true };
  });
  await page.screenshot({ path: path.join(root, 'native-review.png') });
  await page.locator('#scale').selectOption('2');
  await page.screenshot({ path: path.join(root, 'inspection-review.png') });
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile(path.join(root, 'html-check.json'), JSON.stringify({ status: 'PASS_OFFLINE_SLOT_REVIEW_UI',
    ...result, errors, external, runtimeVerified: false }, null, 2) + '\n', { flag: 'wx' });
  console.log(result);
} finally { await browser.close(); }
