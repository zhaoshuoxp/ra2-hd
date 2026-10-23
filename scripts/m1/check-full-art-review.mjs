import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(process.argv[2] ?? '.artifacts/m1-1/full-art-review-v1');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'candidate-review.json'), 'utf8'));
assert.equal(manifest.activationAllowed, false);
assert.equal(manifest.artAcceptance, 'FAIL_NEEDS_CORRECTION');
assert.deepEqual(manifest.frames.map(f => f.nativeFrame), Array.from({ length: 301 }, (_, i) => i));
const result = { status: 'FAIL', frames: 301, densityCases: [], sequences: 0, errors: [], external: [] };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
try {
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    await page.route('**/*', route => {
      if (!route.request().url().startsWith('file://')) {
        result.external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(pathToFileURL(path.join(root, 'review.html')).href);
    const waitFrame = fid => page.waitForFunction(id => document.body.dataset.renderedFrame === String(id), fid);
    await waitFrame(0);
    for (const density of ['2x', '4x', 'detail']) {
      await page.selectOption('#density', density);
      await page.waitForFunction(value => document.body.dataset.renderedDensity === value, density);
      const actual = await page.locator('#candidate').evaluate(el => ({
        natural: [el.naturalWidth, el.naturalHeight],
        display: [el.getBoundingClientRect().width, el.getBoundingClientRect().height],
        notice: document.querySelector('#notice').textContent,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      const variant = manifest.frames[0].variants[density];
      assert.deepEqual(actual.natural, variant.size);
      assert.deepEqual(actual.display, variant.size.map(v => v / variant.density * 4));
      assert.equal(actual.overflow, false);
      assert.equal(actual.notice.includes('Sufficient'), variant.density >= 4 * dpr);
      result.densityCases.push({ dpr, density, ...actual });
    }
    // Traverse every archived sequence/facing through actual controls.
    if (dpr === 1) {
      const actions = await page.locator('#action option').evaluateAll(elements => elements.map(e => e.value).filter(v => v !== 'all'));
      for (const action of actions) {
        const [start, count, stride] = manifest.sequences[action].split(',').map(Number);
        await page.selectOption('#action', action);
        for (let facing = 0; facing < (stride ? 8 : 1); facing++) {
          if (stride) await page.selectOption('#facing', String(facing));
          await waitFrame(start + facing * stride);
          await page.locator('#phase').evaluate((el, value) => {
            el.value = String(value); el.dispatchEvent(new Event('input'));
          }, count - 1);
          await waitFrame(start + facing * stride + count - 1);
          result.sequences++;
        }
      }
      // All generated base/data/blue/original images must decode at their declared physical size.
      const decoded = await page.evaluate(async records => {
        let count = 0;
        for (const f of records) {
          const files = [{ file: f.original.file, size: f.nativeSize }];
          for (const v of Object.values(f.variants)) {
            for (const info of Object.values(v.files)) files.push({ file: info.file, size: v.size });
          }
          await Promise.all(files.map(async item => {
            const image = new Image(); image.src = item.file; await image.decode();
            if (image.naturalWidth !== item.size[0] || image.naturalHeight !== item.size[1]) throw Error(item.file);
            count++;
          }));
        }
        return count;
      }, manifest.frames);
      assert.equal(decoded, 3010); result.decodedImages = decoded;
    }
    for (const fid of [8, 85, 116, 163, 167, 211, 259, 275, 300]) {
      await page.fill('#raw', String(fid)); await page.click('#jump'); await waitFrame(fid);
      if (dpr === 2 && [8, 116].includes(fid)) {
        await page.screenshot({ path: path.join(root, `review-frame-${fid}-retina.png`), fullPage: true });
      }
    }
    await page.selectOption('#action', 'Walk'); await page.selectOption('#facing', '0'); await waitFrame(8);
    await page.click('#play');
    await page.waitForFunction(() => Number(document.body.dataset.renderedFrame) > 8);
    await page.click('#play'); assert.equal(await page.locator('#play').textContent(), 'Play');
    await page.selectOption('#zoom', '1');
    await page.selectOption('#sampling', 'pixelated');
    assert.equal(await page.locator('#candidate').evaluate(el => getComputedStyle(el).imageRendering), 'pixelated');
    await page.selectOption('#team', 'blue');
    await page.waitForFunction(() => document.querySelector('#candidate').src.endsWith('-blue.png'));
    await context.close();
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.external, []);
  result.status = 'PASS_REVIEW_UI_ONLY';
} finally {
  await fs.writeFile(path.join(root, 'browser-check.json'), JSON.stringify(result, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(result));
