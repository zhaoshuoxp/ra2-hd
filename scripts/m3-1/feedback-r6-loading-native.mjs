import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import { PNG } from 'pngjs';

const receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2]), 'utf8'));
const out = path.resolve(process.argv[3]);
const metadata = JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json')));
await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const report = { status: 'RUNNING', app: receipt.app, sourceHead: metadata.sourceHead, screenshots: [], cases: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Actual packaged loading page held at controlled progress values. Pixel checks compare the same native housing at 0%, 62% and 100%; no DOM or artwork substitution.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page, browserWindow;
async function capture(name, clip) {
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file, ...(clip ? { clip } : {}) });
    report.screenshots.push(name + '.png'); return PNG.sync.read(await fs.readFile(file));
}
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); browserWindow = await app.browserWindow(page);
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await browserWindow.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 720); });
    await page.mouse.move(10, 10);
    await page.evaluate(() => {
        window.__worldPaintFrames = [];
        const prototype = CanvasRenderingContext2D.prototype, fill = prototype.fillRect, draw = prototype.drawImage;
        prototype.fillRect = function (...args) {
            if (this.canvas.dataset.campaignBackdrop?.includes('world')) window.__worldPaintFrames.push({ bounds: args, draws: [] });
            return fill.apply(this, args);
        };
        prototype.drawImage = function (image, ...args) {
            if (this.canvas.dataset.campaignBackdrop?.includes('world') && image.src?.includes('backdrop-world')) {
                window.__worldPaintFrames.at(-1).draws.push({ source: image.src, dimensions: [image.naturalWidth, image.naturalHeight], args });
            }
            return draw.call(this, image, ...args);
        };
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory);
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...parameters) => { await start(...parameters); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve); };
            return api;
        };
    });
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.locator('[data-campaign-media] button').waitFor({ timeout: 90000 });
    await page.locator('[data-campaign-media] button').click();
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    await page.waitForTimeout(350);
    const housing = page.locator('svg[data-campaign-sprite="spldbrl.shp"]');
    const box = await housing.boundingBox(), menuScale = box.height / 40;
    const clip = { x: box.x, y: box.y - 12.35 * menuScale, width: box.width, height: box.height + 12.35 * menuScale };
    const captures = new Map();
    for (const progress of [0, 25, 62, 100]) {
        await page.evaluate(progress => window.__heldLoading.onLoadProgress(progress), progress);
        await page.waitForTimeout(120);
        assert.equal(await page.locator('[data-campaign-loading]').getAttribute('data-percent'), String(progress));
        captures.set(progress, await capture('loading-metal-' + progress, clip));
        if (progress === 62) await capture('loading-62-1280x720');
    }
    const empty = captures.get(0), partial = captures.get(62), full = captures.get(100);
    assert.equal(partial.width, full.width); assert.equal(empty.height, full.height);
    const density = full.width / box.width;
    const x0 = Math.ceil(172 * menuScale * density) + 4, y0 = Math.ceil(20.35 * menuScale * density) + 2;
    const width = Math.floor(full.width - 344 * menuScale * density) - 8, height = Math.floor(25 * menuScale * density) - 4;
    let prefixMismatches = 0, bottomDarkPixels = 0, bottomPixels = 0;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let y = y0; y < y0 + height; y++) for (let x = x0; x < x0 + width; x++) {
        const at = (y * full.width + x) * 4;
        if (x < x0 + width * .60) for (let c = 0; c < 4; c++) if (partial.data[at + c] !== full.data[at + c]) prefixMismatches++;
        if (y >= y0 + height * .75 && y < y0 + height * .95) {
            bottomPixels++; if (Math.max(...full.data.subarray(at, at + 3)) < 80) bottomDarkPixels++;
        }
        const a = .2126 * empty.data[at] + .7152 * empty.data[at + 1] + .0722 * empty.data[at + 2], b = full.data[at + 1];
        n++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
    }
    const bins = [];
    for (let bin = 0; bin < 12; bin++) {
        const values = [];
        for (let y = y0; y < y0 + height * .4; y++) for (let x = Math.floor(x0 + bin * width / 12); x < x0 + (bin + 1) * width / 12; x++) {
            values.push(full.data[(y * full.width + x) * 4 + 1]);
        }
        values.sort((a, b) => b - a); const highlights = values.slice(0, Math.floor(values.length * .2));
        bins.push(Math.round(highlights.reduce((a, b) => a + b) / highlights.length));
    }
    const materialCorrelation = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    report.pixels = { region: [x0, y0, width, height], prefixMismatches, bottomDarkPixels, bottomPixels,
        materialCorrelation, highlightGreenLeftToRight: bins };
    assert.equal(prefixMismatches, 0, 'Loading progress must reveal fixed highlights, not redistribute them');
    assert.equal(bottomDarkPixels, 0, 'The loaded lower edge must have no irregular black holes');
    assert(materialCorrelation > .88, JSON.stringify(report.pixels));
    assert(bins.at(-2) > bins[1] + 15, 'The right-hand highlights must be stronger, matching the unlit cylinder');
    for (const dimensions of [[800, 600], [1280, 720], [1680, 720], [720, 900], [2560, 720]]) {
        await browserWindow.evaluate((window, size) => window.setContentSize(...size), dimensions);
        await page.waitForTimeout(350);
        const state = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]'), fill = node.querySelector('[data-loading-fill]');
            return { world: window.__worldPaintFrames.at(-1), viewport: [innerWidth, innerHeight], percent: Number(node.dataset.percent), bounds: node.getBoundingClientRect().toJSON(), ui: window.__ra2debug.uiArt.metrics(),
                fillSource: fill.querySelector('image').getAttribute('href'),
                housingSource: node.querySelector('[data-loading-metal] image').getAttribute('href'),
                transfer: [...fill.querySelectorAll('feComponentTransfer > *')].map(n => Object.fromEntries([...n.attributes].map(a => [a.name, a.value]))) };
        });
        assert.equal(state.percent, 100); assert.equal(state.fillSource, state.housingSource); assert(state.ui.reservedBytes <= state.ui.budget);
        assert(Math.abs(state.bounds.width - state.viewport[0]) < 2 && Math.abs(state.bounds.height - state.viewport[1]) < 2);
        assert.equal(state.world.draws.length, 1);
        const [sx, sy, sw, sh, x, y, w, h] = state.world.draws[0].args;
        assert.deepEqual([sx, sy], [0, 0]); assert(sw < 1790);
        assert(Math.abs(w / sw - h / sh) < 1e-10, 'World geography must use one scale for both axes');
        assert(Math.abs(x + 520 * w / sw - ((state.world.bounds[2] - 800) / 2 + 264)) < 1e-8);
        assert(Math.abs(y + 248 * h / sh - ((state.world.bounds[3] - 520) / 2 + 160)) < 1e-8);
        report.cases.push(state); await capture('loading-' + dimensions.join('x'));
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_SINGLE_PROPORTIONAL_WORLD_NO_WRAPPED_ALASKA_REGISTERED_LOCATOR_FIVE_ASPECTS_AND_PRESERVED_METAL';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await capture('failure').catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, pixels: report.pixels, out, error: report.error }));
