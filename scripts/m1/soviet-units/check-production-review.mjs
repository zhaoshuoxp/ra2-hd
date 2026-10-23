import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.argv[2];
assert.ok(root && path.resolve(root).startsWith(path.resolve('.artifacts/m1-7') + path.sep));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-background-networking'],
});
const report = { status: 'FAIL', errors: [], cases: [], nativeGameplay: 'NOT RUN' };
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  await context.route('**/*', (r) =>
    /^(file|data):/.test(r.request().url()) ? r.continue() : r.abort(),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.stack));
  await page.goto('file://' + path.resolve(root, 'review.html'));
  await page.waitForFunction(() => window.__motionReady);
  await page.locator('#pause').click();
  const seen = new Set();
  for (const action of await page.locator('#action option').allTextContents()) {
    await page.locator('#action').selectOption(action);
    for (const facing of await page.locator('#facing option').allTextContents()) {
      await page.locator('#facing').selectOption(facing);
      const phases = Number(await page.locator('#phase').getAttribute('max')) + 1;
      for (let phase = 0; phase < phases; phase++) {
        await page.locator('#phase').evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event('input'));
        }, phase);
        const state = await page.evaluate(() => {
          const counts = [...document.querySelectorAll('canvas')].map((canvas) => {
            const data = canvas.getContext('2d').getImageData(0, 0, 360, 300).data;
            return data.filter((value, i) => i % 4 === 3 && value > 32).length;
          });
          return { frame: document.querySelector('#frame').textContent, counts };
        });
        assert.ok(state.counts.every((n) => n > 20 && n < 5000));
        report.cases.push({ action, facing, phase, ...state });
        seen.add(Number(state.frame.replace('Frame ', '')));
      }
    }
  }
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    manifest.frames.map((frame) => frame.frame),
  );
  report.uniqueFrames = seen.size;
  await page.screenshot({ path: `${root}/browser-check.png` });
  assert.deepEqual(report.errors, []);
  report.status = 'PASS_CANDIDATE_PLAYER_ONLY';
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  await fs.writeFile(`${root}/browser-check.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(report.status, report.failure ?? '');
