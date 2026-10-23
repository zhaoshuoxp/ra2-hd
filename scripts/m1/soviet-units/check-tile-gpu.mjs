import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
execFileSync('bun', ['build', 'scripts/m1/hd-tile-gpu.ts', '--target', 'browser', '--outdir', out]);
const fixtures = [];
for (const [member, revision, frame] of [
  ['sqd', 2, 249],
  ['sqdg', 2, 76],
  ['sqdg', 2, 0],
  ['yuripr', 1, 0],
  ['deso', 2, 299],
  ['trst', 3, 0],
  ['yuri', 1, 280],
  ['civan', 1, 0],
  ['ivan', 1, 0],
  ['shk', 1, 0],
  ['flakt', 1, 0],
  ['dron', 1, 0],
  ['dronp', 1, 0],
  ['engineer', 3, 0],
  ['dog', 1, 0],
  ['dogp', 1, 0],
]) {
  const root = path.resolve('.local/hd-packs', `soviet-${member}-authored`, String(revision));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const variant = manifest.variants.find((v) => v.density === 2);
  const entry = variant.frames.find((f) => f.nativeFrame === frame);
  const page = variant.pages.find((p) => p.id === entry.page);
  const fixture = { name: `${member}/${frame}`, density: 2, rect: entry.sampleRect };
  for (const role of ['base', 'data']) {
    fixture[role] =
      `data:image/png;base64,${(await fs.readFile(path.join(root, page[role]))).toString('base64')}`;
  }
  fixtures.push(fixture);
}
const bundle = await fs.readFile(path.join(out, 'hd-tile-gpu.js'), 'utf8');
const html =
  '<!doctype html><html><body><script>window.__tileFixtures=' +
  JSON.stringify(fixtures) +
  ';</script><script type="module">' +
  bundle.replaceAll('</script', '<\\/script') +
  '</script></body></html>';
await fs.writeFile(path.join(out, 'probe.html'), html);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage(),
    errors = [],
    unexpectedRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (/^(file|data|blob):/.test(route.request().url())) return route.continue();
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(pathToFileURL(path.join(out, 'probe.html')).href);
  await page.waitForFunction(() => window.__tileResult, { timeout: 180000 });
  const result = await page.evaluate(() => window.__tileResult);
  Object.assign(result, {
    errors,
    unexpectedRequests,
    fixtureCount: fixtures.length,
    serving: false,
  });
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: result.status,
      comparisons: result.rows?.length,
      errors,
      unexpectedRequests,
    }),
  );
  assert.equal(result.status, 'PASS_BYTE_EXACT_GPU_PARITY');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  assert.equal(result.remainingTextures, 2);
} finally {
  await browser.close();
}
