import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [root, delivered, output] = process.argv.slice(2).map(p => path.resolve(p));
await fs.mkdir(output, { recursive: false });
const receipt = JSON.parse(await fs.readFile(path.join(root, 'review.json')));
const sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(sha(await fs.readFile(delivered)), receipt.reviewSha256);
const allowed = new Set(receipt.media.map(m => m.sha256)), seen = new Set();
const result = { status: 'RUNNING', errors: [], network: [], images: [], clips: [] };
const app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), delivered, `--review-profile=${path.join(output, 'profile')}`], cwd: '/private/tmp' });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('request', r => { if (/^(https?|wss?):/.test(r.url())) result.network.push(r.url()); });
    await page.waitForFunction(() => window.__reviewManifest, null, { timeout: 120000 });
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__reviewManifest);
    const check = async locator => {
        const data = await locator.evaluate(async i => { await i.decode(); return { src: i.src, width: i.naturalWidth, height: i.naturalHeight }; });
        const hash = sha(Buffer.from(data.src.split(',')[1], 'base64'));
        assert(allowed.has(hash)); seen.add(hash); result.images.push({ sha256: hash, width: data.width, height: data.height });
    };
    for (let i = 0; i < receipt.counts.scenes; i++) for (const mode of ['original', 'baseline', 'two', 'four']) {
        await page.selectOption('#scene', String(i)); await page.locator(`[data-mode="${mode}"]`).click();
        await check(page.locator('#sceneImage'));
        assert(await page.evaluate(() => {
            const actual = document.getElementById('detail'), expected = document.createElement('canvas');
            expected.width = actual.width; expected.height = actual.height;
            expected.getContext('2d').drawImage(document.getElementById('sceneImage'), ...window.__detailRect, 0, 0, expected.width, expected.height);
            const a = actual.getContext('2d').getImageData(0, 0, actual.width, actual.height).data;
            return expected.getContext('2d').getImageData(0, 0, expected.width, expected.height).data.every((v, n) => v === a[n]);
        }));
    }
    for (const image of await page.locator('#states img').all()) await check(image);
    for (const video of await page.locator('video').all()) {
        await video.evaluate(v => { v.closest('details').open = true; v.preload = 'metadata'; v.load(); });
        await video.evaluate(v => new Promise((resolve, reject) => { if (v.readyState >= 1) resolve(); else { v.onloadedmetadata = resolve; v.onerror = () => reject(Error('Embedded clip failed')); } }));
        const hash = sha(Buffer.from((await video.getAttribute('src')).split(',')[1], 'base64'));
        assert(allowed.has(hash)); seen.add(hash);
        await video.evaluate(v => v.play()); await page.waitForTimeout(350);
        assert(await video.evaluate(v => v.currentTime > 0));
        await video.evaluate(v => v.pause()); result.clips.push({ sha256: hash, playback: true });
    }
    assert.equal(seen.size, allowed.size); assert.deepEqual(result.errors, []); assert.deepEqual(result.network, []);
    await page.selectOption('#scene', '0'); await page.locator('[data-mode="four"]').click();
    await page.screenshot({ path: path.join(output, 'feedback-review.png') });
    result.status = 'PASS_SINGLE_FILE_OFFLINE_NATIVE_FEEDBACK_SCENES_STATES_AND_CLIPS';
} catch (error) { result.status = 'FAIL'; result.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'qa.json'), JSON.stringify(result, null, 2) + '\n'); await app.close(); }
