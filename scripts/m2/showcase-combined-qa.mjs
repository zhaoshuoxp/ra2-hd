import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [reviewRoot, deliveredFile, outputRoot] = process.argv.slice(2).map(value => path.resolve(value));
await fs.mkdir(outputRoot, { recursive: false });
const receipt = JSON.parse(await fs.readFile(path.join(reviewRoot, 'review.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(await fs.readFile(deliveredFile)), receipt.reviewSha256);
const allowed = new Set(receipt.media.map(row => row.sha256));
const result = { status: 'RUNNING', errors: [], network: [], images: [], clips: [] };
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), deliveredFile,
        `--review-profile=${path.join(outputRoot, 'profile')}`], cwd: '/private/tmp', timeout: 60000,
});
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => result.errors.push(error.stack));
    page.on('request', request => { if (/^(https?|wss?):/.test(request.url())) result.network.push(request.url()); });
    // The large embedded file may still be navigating when firstWindow resolves.
    await page.waitForFunction(() => window.__reviewManifest, null, { timeout: 120000 });
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__reviewManifest);
    result.counts = await page.evaluate(() => window.__reviewManifest);
    const seen = new Set();
    const checkImage = async selector => {
        const data = await page.locator(selector).evaluate(async image => {
            await image.decode();
            return { src: image.src, width: image.naturalWidth, height: image.naturalHeight,
                displayed: image.getBoundingClientRect().width };
        });
        const hash = sha(Buffer.from(data.src.split(',')[1], 'base64'));
        assert(allowed.has(hash)); seen.add(hash);
        result.images.push({ sha256: hash, width: data.width, height: data.height, displayed: data.displayed });
        return data;
    };
    for (let index = 0; index < result.counts.scenes; index++) {
        await page.selectOption('#scene', String(index));
        for (const mode of ['original', 'baseline', '2', '4']) {
            await page.locator(`[data-mode="${mode}"]`).click();
            const image = await checkImage('#sceneImage');
            assert.deepEqual([image.width, image.height], [1489, 1080]);
            assert(Math.abs(image.displayed - 1241.3793103448277) < 1);
            const cropExact = await page.evaluate(() => {
                const expected = document.createElement('canvas');
                expected.width = 480; expected.height = 400;
                const context = expected.getContext('2d');
                context.drawImage(document.getElementById('sceneImage'), 420, 220, 480, 400, 0, 0, 480, 400);
                const pixels = context.getImageData(0, 0, 480, 400).data;
                const actual = document.getElementById('detail').getContext('2d').getImageData(0, 0, 480, 400).data;
                return pixels.every((value, index) => value === actual[index]);
            });
            assert(cropExact, 'The visible center crop must contain exact current framebuffer pixels');
        }
    }
    await page.locator('#fit').click();
    const fit = await checkImage('#sceneImage');
    assert(fit.displayed <= 1489); await page.locator('#fit').click();
    for (let index = 0; index < result.counts.families; index++) {
        await page.selectOption('#family', String(index));
        let logical;
        for (const density of ['1', '2', '4']) {
            await page.selectOption('#familyDensity', density);
            const image = await checkImage('#familyImage');
            logical ??= image.width;
            assert.equal(image.width, logical * Number(density));
            assert(Math.abs(image.displayed - logical) < 1);
        }
    }
    await page.selectOption('#inspect', '4');
    const family = await checkImage('#familyImage');
    assert.equal(family.displayed, family.width); await page.selectOption('#inspect', '1');
    for (const detail of await page.locator('#states details').all()) {
        await detail.evaluate(element => { element.open = true; });
        await checkImage('details[open] img.state');
        await detail.evaluate(element => { element.open = false; });
    }
    for (const detail of await page.locator('#clips details').all()) {
        await detail.evaluate(element => { element.open = true; });
        const video = detail.locator('video');
        const metadata = await video.evaluate(element => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Embedded clip metadata timed out')), 20000);
            element.onloadedmetadata = () => { clearTimeout(timer); resolve({ width: element.videoWidth, height: element.videoHeight }); };
            element.onerror = () => reject(Error('Embedded clip metadata failed'));
            if (element.readyState >= 1) element.onloadedmetadata();
            else { element.preload = 'metadata'; element.load(); }
        }));
        assert.deepEqual([metadata.width, metadata.height], [1489, 1080]);
        const src = await video.getAttribute('src');
        const hash = sha(Buffer.from(src.split(',')[1], 'base64')); assert(allowed.has(hash)); seen.add(hash);
        await video.evaluate(async element => { element.currentTime = 0; await element.play(); });
        await page.waitForTimeout(400);
        assert(await video.evaluate(element => element.currentTime > 0));
        result.clips.push({ sha256: hash, ...metadata, playback: true });
        await detail.evaluate(element => { element.open = false; });
    }
    assert.equal(seen.size, allowed.size);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.network, []);
    await page.selectOption('#scene', '1'); await page.locator('[data-mode="4"]').click();
    await page.screenshot({ path: path.join(outputRoot, 'combined-review.png') });
    result.status = 'PASS_SINGLE_FILE_OFFLINE_NATIVE_SCENES_EXPORTS_AND_CLIPS';
} catch (error) { result.status = 'FAIL'; result.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(outputRoot, 'qa.json'), JSON.stringify(result, null, 2) + '\n'); await app.close(); }
