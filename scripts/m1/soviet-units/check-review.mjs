import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.argv[2] ?? '.artifacts/m1-7/review-v8',
  reviewUrl = 'file://' + path.resolve(root, 'review.html'),
  browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--disable-background-networking'],
  });
const report = { status: 'FAIL', errors: [], external: [], cases: [] };
try {
  for (const width of [1440, 600]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
      offline: true,
    });
    await context.route('**/*', (r) => {
      const url = r.request().url();
      if (url !== reviewUrl && !url.startsWith('data:')) {
        report.external.push(url);
        return r.abort();
      }
      return r.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.stack));
    await page.goto(reviewUrl, {
      waitUntil: 'load',
      timeout: 60000,
    });
    const state = await page.evaluate(async () => {
      await Promise.all([...document.images].map((i) => i.decode()));
      return {
        images: document.images.length,
        units: document.querySelectorAll('article').length,
        stages: [...document.querySelectorAll('.stage')].map((x) => [
          x.clientWidth,
          x.clientHeight,
        ]),
      };
    });
    assert.equal(state.units, 24);
    assert.equal(await page.locator('select[data-unit="HARV"]').inputValue(), '1');
    assert.ok(state.stages.every((s) => s[0] === 360 && s[1] === 300));
    for (const select of await page.locator('select[data-unit]').all()) {
      const count = await select.locator('option').count();
      for (let i = 0; i < count; i++) {
        await select.selectOption(String(i));
        await page.evaluate(async () => {
          await Promise.all([...document.querySelectorAll('.stage img')].map((i) => i.decode()));
        });
      }
    }
    await page.locator('#background').selectOption('#e7e4db');
    await page.screenshot({ path: `${root}/review-${width}.png` });
    if (width === 1440)
      for (const id of ['YURIPR', 'HARV', 'APOC']) {
        await page.locator(`select[data-unit="${id}"]`).selectOption(id === 'HARV' ? '1' : '0');
        await page.evaluate(async () => {
          await Promise.all([...document.querySelectorAll('.stage img')].map((i) => i.decode()));
        });
        await page.locator(`#unit-${id}`).screenshot({ path: `${root}/panel-${id}.png` });
      }
    report.cases.push({ width, ...state, poseSwitches: 108 });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.external, []);
  report.status = 'PASS_REPRESENTATIVE_REVIEW_UI_ONLY';
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${root}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(report.status, report.failure ?? '');
