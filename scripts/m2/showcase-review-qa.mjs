import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const root = path.resolve(process.argv[2]);
const reviewFile = path.resolve(process.argv[3] ?? path.join(root, 'index.html'));
const outputRoot = path.resolve(process.argv[4] ?? root);
if (outputRoot !== root) await fs.mkdir(outputRoot, { recursive: false });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'review.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(await fs.readFile(reviewFile)), manifest.reviewSha256);
const allowed = new Map();
for (const entry of manifest.media) allowed.set(entry.sha256, entry.file);
for (const pilot of manifest.pilots.filter(pilot => pilot.outputs['2'])) {
    for (const name of [pilot.nativePreview, ...Object.values(pilot.outputs).map(output => output.file)]) {
        const file = path.join(root, name); allowed.set(sha(await fs.readFile(file)), file);
    }
}
const errors = [], networkRequests = [];
const result = { schema: 'm2-2-offline-direction-qa-v1', errors, networkRequests, reviewFile };
const env = { ...process.env };
for (const name of ['RA2_DESKTOP_USER_DATA', 'RA2_DESKTOP_NO_DISCOVERY', 'RA2_UI_RESOURCE_ROOT']) delete env[name];
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), reviewFile,
        `--review-profile=${path.join(outputRoot, 'M2.2-Direction-Review-Profile')}`],
    cwd: '/private/tmp', env, timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.stack));
    page.on('request', request => {
        if (/^(https?|wss?):/i.test(request.url())) networkRequests.push(request.url());
    });
    await page.waitForFunction(() => document.readyState === 'complete'
        && document.querySelectorAll('img').length > 0
        && [...document.images].every(image => image.complete && image.naturalWidth > 0));
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    result.offlineMode = true;
    if (manifest.waterPanelSelection) {
        await page.waitForFunction(() => window.__m2WaterPanelReport);
        result.waterPanels = await page.evaluate(() => window.__m2WaterPanelReport);
        assert.equal(result.waterPanels.protectedPanelsExact, true);
        assert(result.waterPanels.changedPixels[1] > 0 && result.waterPanels.changedPixels[2] > 0);
    }
    await page.waitForLoadState('domcontentloaded');
    result.images = await page.locator('img').evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.map(image => ({ src: image.src, width: image.naturalWidth, height: image.naturalHeight }));
    });
    const seen = new Set();
    result.images = result.images.map(image => {
        assert(image.src.startsWith('data:image/png;base64,'));
        const hash = sha(Buffer.from(image.src.split(',')[1], 'base64'));
        assert(allowed.has(hash), `Unknown embedded media ${hash}`); seen.add(hash);
        assert(image.width > 0 && image.height > 0);
        return { file: allowed.get(hash), sha256: hash, width: image.width, height: image.height };
    });
    assert.equal(seen.size, allowed.size);
    result.sections = await page.locator('section').evaluateAll(sections => sections.map(section => section.id));
    assert.equal(result.sections.length, 6);
    for (const name of result.sections.slice(0, 5)) {
        await page.locator(`#${name}`).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(outputRoot, `qa-${name}.png`) });
    }
    await page.selectOption('#background', '#ddd8cd');
    assert.equal(await page.locator('.board').first().evaluate(image => image.style.background), 'rgb(221, 216, 205)');
    await page.locator('details').first().evaluate(detail => { detail.open = true; });
    await page.selectOption('#scale', '4');
    result.samples = await page.locator('.sample').evaluateAll(images => images.map(image => ({
        logical: [Number(image.getAttribute('width')), Number(image.getAttribute('height'))],
        inspected: [parseFloat(image.style.width), parseFloat(image.style.height)],
    })));
    assert(result.samples.length > 0);
    for (const sample of result.samples) assert.deepEqual(sample.inspected, sample.logical.map(value => value * 4));
    await page.selectOption('#scale', '1'); await page.selectOption('#background', '#435346');
    await page.locator('#ground-water').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outputRoot, 'qa-pilots.png') });
    assert.equal(errors.length, 0);
    assert.equal(networkRequests.length, 0);
    result.status = 'PASS_OFFLINE_DIRECTION_REVIEW';
    result.boundary = 'Static direction/export preview only. No new in-game family or dynamic-state acceptance.';
} catch (error) { result.status = 'FAIL'; result.failure = error.stack; throw error; }
finally {
    await fs.writeFile(path.join(outputRoot, 'qa.json'), JSON.stringify(result, null, 2) + '\n');
    await app.close();
}
