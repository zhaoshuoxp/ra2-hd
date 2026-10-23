// Capture an inspection page from same-frame, unmodified WebGL outputs.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const run = path.resolve(process.argv[2] ?? '.artifacts/m1-1/4k-gameplay-v1/hd-4k-v3');
const report = JSON.parse(await fs.readFile(`${run}/result.json`, 'utf8'));
assert.equal(report.status, 'PASS_BOUNDED_GAMEPLAY');
const samples = report.renderResolution.samples;
const original = samples.find(s => s.mode === 'original'), hd = samples.find(s => s.mode === '4k');
assert.deepEqual(hd.buffer, [3840, 2160]);
assert.equal(original.tick, hd.tick);
assert.equal(original.frame, hd.frame);
const dataUrl = async file => 'data:image/png;base64,' + (await fs.readFile(file)).toString('base64');
const images = await Promise.all(['original', '4k'].map(mode => dataUrl(`${run}/same-frame-${mode}.png`)));
const crop = { x: Math.round(original.point.viewportX) - 24, y: Math.round(original.point.viewportY) - 46, width: 48, height: 64 };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 840 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#18242a;color:#edf5f5;font:21px/1.45 system-ui}h1{font-size:29px;margin:0}p{margin:5px 0 18px;color:#bed1d9}.pair{display:flex;gap:40px}section{width:464px}h2{font-size:23px;margin:0 0 12px}canvas{display:block;border:1px solid #6e818b}footer{margin-top:18px;font-size:18px;color:#bed1d9}</style>
    <h1>Actual match · same unit, same frame</h1><p>HD artwork in both views · 9× pixel inspection · no smoothing</p>
    <div class="pair"><section><h2>Previous rendering · 1920 × 1080</h2><canvas id="before" width="432" height="576"></canvas></section>
    <section><h2>4K rendering · 3840 × 2160</h2><canvas id="after" width="432" height="576"></canvas></section></div>
    <footer>Tick ${original.tick} · native frame ${original.frame} · identical camera and geometry.<br>Inspection enlarges existing pixels. Unit and UI display sizes stay unchanged in the game.</footer>`);
    const measurements = await page.evaluate(async ({ images, crop }) => {
        const dimensions = [];
        for (let n = 0; n < 2; n++) {
            const img = new Image(); img.src = images[n]; await img.decode();
            dimensions.push([img.width, img.height]);
            const scale = n + 1, canvas = document.getElementById(n ? 'after' : 'before');
            const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, crop.x * scale, crop.y * scale, crop.width * scale, crop.height * scale,
                0, 0, canvas.width, canvas.height);
        }
        return dimensions;
    }, { images, crop });
    assert.deepEqual(measurements, [[1920, 1080], [3840, 2160]]);
    const height = await page.locator("footer").evaluate(el => Math.ceil(el.getBoundingClientRect().bottom + 28));
    await page.setViewportSize({ width: 1024, height });
    assert(await page.locator("footer").evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
    await page.screenshot({ path: `${run}/4k-closeup-comparison.png` });
    // The static review has no script or sibling-image dependency, including in remote previews.
    const embedded = await dataUrl(`${run}/4k-closeup-comparison.png`);
    await fs.writeFile(`${run}/review.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>M1.1 actual 4K review</title><style>body{margin:20px auto;max-width:1100px;background:#18242a;color:#edf5f5;font:20px/1.5 system-ui;padding:0 20px}img{max-width:100%;height:auto}a{color:#a3ddff}</style><h1>Actual 4K rendering</h1><p>Options → Rendering resolution → 4K (up to 3840 x 2160).</p><img alt="Same-frame comparison of previous and 4K rendering" src="${embedded}"><p><a href="same-frame-4k.png">Full 3840 × 2160 capture</a></p><p>The comparison image is embedded; no JavaScript or neighboring image file is needed to display it.</p></html>`);
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const check = await noScript.newPage();
    await check.goto(`file://${run}/review.html`);
    assert.equal(await check.locator('img').evaluate(img => img.complete && img.naturalWidth === 1024), true);
    await fs.writeFile(`${run}/closeup-evidence.json`, JSON.stringify({ status: 'PASS', crop, logicalMagnification: 9,
        inputDimensions: measurements, sameTick: original.tick, sameNativeFrame: original.frame,
        noScriptEmbeddedPreview: true, note: 'Both sides use HD art; only render-buffer density changes.' }, null, 2));
    console.log(`${run}/4k-closeup-comparison.png`);
} finally { await browser.close(); }
