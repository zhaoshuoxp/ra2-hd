// Validate the embedded review in an isolated offline native Electron window.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [root, output] = process.argv.slice(2).map(p => path.resolve(p));
await fs.mkdir(output, { recursive: false });
const receipt = JSON.parse(await fs.readFile(path.join(root, 'review.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(await fs.readFile(receipt.review)), receipt.sha256);
const allowed = new Set(receipt.media.map(m => m.sha256));
const report = { status: 'RUNNING', errors: [], network: [], imageCases: 0, colorCases: 0 };
const app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [path.resolve('scripts/m2/showcase-review-shell.mjs'), receipt.review,
        `--review-profile=${path.join(output, 'profile')}`], cwd: '/private/tmp' });
try {
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('request', r => { if (/^(https?|wss?):/.test(r.url())) report.network.push(r.url()); });
    await page.waitForFunction(() => window.__reviewManifest);
    await page.waitForFunction(() => window.__probeReady);
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__reviewManifest);
    await page.waitForFunction(() => window.__probeReady);
    const manifest = await page.evaluate(() => window.__reviewManifest);
    assert.equal(manifest.probes, receipt.probes); assert.equal(manifest.colors, 8);
    const families = await page.locator('#family option').evaluateAll(o => o.map(o => o.value));
    for (const family of families) {
        await page.selectOption('#family', family);
        const states = await page.locator('#state option').evaluateAll(o => o.map(o => o.value));
        for (const state of states) for (const density of ['2', '4']) {
            await page.selectOption('#state', state); await page.selectOption('#density', density);
            for (const mode of ['original', 'hd']) {
                const image = await page.locator('#' + mode).evaluate(async i => {
                    await i.decode(); return { src: i.src, width: i.naturalWidth, height: i.naturalHeight };
                });
                assert(image.width > 0 && image.height > 0);
                assert(allowed.has(sha(Buffer.from(image.src.split(',')[1], 'base64'))));
            }
            report.imageCases++;
        }
    }
    report.colorCases = await page.evaluate(async () => {
        let count = 0;
        for (const family of document.getElementById('probeFamily').options) for (const density of ['2', '4']) {
            document.getElementById('probeFamily').value = family.value;
            document.getElementById('probeDensity').value = density;
            for (let color = 0; color < 8; color++) {
                document.getElementById('color').value = String(color); await probe();
                if (window.__probeReady.family !== family.value || window.__probeReady.density !== Number(density))
                    throw Error('Stale color preview');
                for (const id of ['probeOriginal', 'probeBefore', 'probeHd']) {
                    const c = document.getElementById(id), pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height);
                    if (!pixels.data.some((v, i) => i % 4 === 3 && v > 0)) throw Error('Empty owner preview');
                }
                count++;
            }
        }
        return count;
    });
    assert.equal(report.colorCases, receipt.probes * 2 * 8);
    assert.equal(report.imageCases, manifest.cases);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.network, []);
    await page.selectOption('#family', families.includes('CAHSE01') ? 'CAHSE01' : families[0]);
    await page.selectOption('#state', 'occupied-enemy');
    await page.selectOption('#density', '4');
    await page.screenshot({ path: path.join(output, 'review.png'), fullPage: true });
    report.status = 'PASS_EMBEDDED_OFFLINE_NATIVE_STATES_AND_OWNER_COLOR_PREVIEWS';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(output, 'qa.json'), JSON.stringify(report, null, 2) + '\n'); await app.close(); }
