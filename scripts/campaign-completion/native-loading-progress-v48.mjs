import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [],
    scope: 'Actual loading UI held before unchanged mission preparation. Progress values, window sizes and one restored presentation-only negative probe are controlled; no world, map, rules or source artwork is changed.' };
let app, page, labels;
const pixels = async name => {
    const file = name + '.png'; const bytes = await page.screenshot({ path: path.join(out, file) });
    return { file, png: PNG.sync.read(bytes) };
};
function alignment(empty, full, metrics) {
    const ratio = full.width / metrics.viewport[0];
    const { left, right, top, bottom } = metrics.cylinder;
    const bounds = [Math.floor(left * ratio) - 1, Math.floor(top * ratio) - 1,
        Math.ceil(right * ratio) + 1, Math.ceil(bottom * ratio) + 1];
    let changed = 0, outside = 0;
    const housingTop = Math.max(0, Math.floor(metrics.housing.top * ratio));
    for (let y = housingTop; y < full.height; y++) for (let x = 0; x < full.width; x++) {
        const offset = (y * full.width + x) * 4;
        if (![0, 1, 2].some(channel => Math.abs(empty.data[offset + channel] - full.data[offset + channel]) > 4)) continue;
        changed++;
        if (x < bounds[0] || x >= bounds[2] || y < bounds[1] || y >= bounds[3]) outside++;
    }
    const values = [];
    for (let lag = -10; lag <= 10; lag++) {
        let count = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (let y = Math.ceil(top * ratio) + 6; y < Math.floor(bottom * ratio) - 6; y++)
            for (let x = Math.ceil((left + (right - left) * .1) * ratio); x < (left + (right - left) * .9) * ratio; x += 2) {
                const before = (y * full.width + x) * 4, after = ((y + lag) * full.width + x) * 4;
                const a = .2126 * empty.data[before] + .7152 * empty.data[before + 1] + .0722 * empty.data[before + 2];
                const b = full.data[after + 1];
                count++; sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b;
            }
        values.push({ lag, correlation: (count * sxy - sx * sy) / Math.sqrt((count * sxx - sx * sx) * (count * syy - sy * sy)) });
    }
    const best = values.toSorted((a, b) => b.correlation - a.correlation)[0];
    assert(changed > 1000); assert.equal(outside, 0, 'Heated fill must preserve the entire metal rim');
    assert(Math.abs(best.lag) <= 1, 'Heated highlights moved relative to the empty cylinder: ' + JSON.stringify(best));
    return { changed, outside, best, correlations: values };
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 4 }));
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory);
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => {
                await start(...args); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve);
            };
            return api;
        };
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov02t.map'));
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-loading-metal]'), undefined, { timeout: 90000 });
    const layouts = [[1440, 900], [1280, 800], [1600, 900], 'fullscreen'];
    for (const layout of layouts) {
        await app.evaluate(({ BrowserWindow }, layout) => {
            const window = BrowserWindow.getAllWindows()[0];
            if (layout === 'fullscreen') window.setFullScreen(true);
            else { window.setFullScreen(false); window.setContentSize(...layout); }
        }, layout);
        await page.waitForTimeout(layout === 'fullscreen' ? 1200 : 200);
        const metrics = await page.evaluate(() => {
            const housing = document.querySelector('[data-campaign-sprite="spldbrl.shp"]');
            const middle = housing.querySelectorAll('[data-loading-metal] > svg')[1];
            const matrix = middle.getScreenCTM();
            const from = new DOMPoint(381.41, 427.5).matrixTransform(matrix);
            const to = new DOMPoint(1392.59, 476).matrixTransform(matrix);
            return { viewport: [innerWidth, innerHeight], housing: housing.getBoundingClientRect().toJSON(),
                cylinder: { left: from.x, top: from.y, right: to.x, bottom: to.y },
                material: document.querySelector('[data-loading-fill]').dataset.loadingFill,
                ui: window.__ra2debug.uiArt.metrics() };
        });
        assert.equal(metrics.material, 'shared-cylinder-r4'); assert(metrics.ui.reservedBytes <= metrics.ui.budget);
        await page.evaluate(() => { window.__heldLoading.percent = 0; window.__heldLoading.onLoadProgress(0); });
        await page.waitForTimeout(80);
        const name = Array.isArray(layout) ? layout.join('x') : layout;
        const empty = await pixels(name + '-0'); let partial;
        for (const percent of [25, 62, 100]) {
            await page.evaluate(percent => window.__heldLoading.onLoadProgress(percent), percent); await page.waitForTimeout(80);
            const capture = await pixels(name + '-' + percent);
            if (percent === 62) partial = capture;
            if (percent === 100) {
                const result = alignment(empty.png, capture.png, metrics);
                const ratio = capture.png.width / metrics.viewport[0], c = metrics.cylinder;
                let prefixDifferences = 0, suffixDifferences = 0, prefixMaxDelta = 0, prefixChannels = 0;
                let suffixMaxDelta = 0, suffixChannels = 0;
                for (let y = Math.ceil(c.top * ratio) + 2; y < c.bottom * ratio - 2; y++)
                    // Rounded end caps have independent clip-edge antialiasing.
                    // Their exterior is covered by the rim-preservation check.
                    for (let x = Math.ceil(c.left * ratio) + 12; x < c.right * ratio - 12; x++) {
                        const at = (y * capture.png.width + x) * 4;
                        const reference = x < (c.left + (c.right - c.left) * .60) * ratio ? capture.png
                            : x > (c.left + (c.right - c.left) * .65) * ratio ? empty.png : undefined;
                        if (reference) for (let channel = 0; channel < 4; channel++) {
                            if (reference === capture.png) {
                                prefixChannels++;
                                prefixMaxDelta = Math.max(prefixMaxDelta, Math.abs(reference.data[at + channel] - partial.png.data[at + channel]));
                            } else {
                                suffixChannels++;
                                suffixMaxDelta = Math.max(suffixMaxDelta, Math.abs(reference.data[at + channel] - partial.png.data[at + channel]));
                            }
                            if (reference.data[at + channel] !== partial.png.data[at + channel])
                                x < (c.left + (c.right - c.left) * .60) * ratio ? prefixDifferences++ : suffixDifferences++;
                        }
                    }
                report.cases.push({ layout, ...metrics, pixels: result, prefixDifferences, suffixDifferences,
                    prefixMaxDelta, prefixChannels, suffixMaxDelta, suffixChannels });
                // Chromium's SVG filter can round a few clipped channel samples
                // differently. Spatial alignment and unchanged borders are tested
                // independently above, including an intentionally displaced image.
                assert(prefixMaxDelta <= 4 && prefixDifferences / prefixChannels < .01,
                    'Clipping changed the heated cylinder beyond bounded filter rounding');
                assert(suffixMaxDelta <= 1 && suffixDifferences / suffixChannels < .01,
                    'Clipping changed the empty cylinder beyond bounded compositing rounding');
                if (layout === layouts[0]) {
                    await page.evaluate(() => document.querySelector('[data-loading-fill] image').setAttribute('transform', 'translate(0 -6)'));
                    try {
                        const negative = await pixels(name + '-negative-displacement');
                        assert.throws(() => alignment(empty.png, negative.png, metrics), /Heated highlights moved/);
                        report.displacementNegative = 'PASS_SHIFTED_HIGHLIGHTS_REJECTED';
                    } finally { await page.evaluate(() => document.querySelector('[data-loading-fill] image').removeAttribute('transform')); }
                }
            }
        }
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, 'sov02t.map');
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]');
    report.afterAbort = await page.evaluate(() => ({ activeLoading: document.querySelectorAll('[data-campaign-loading]').length,
        activeMedia: document.querySelectorAll('[data-campaign-media]').length, ui: window.__ra2debug.uiArt.metrics() }));
    assert.equal(report.afterAbort.activeLoading, 0); assert.equal(report.afterAbort.activeMedia, 0);
    assert(report.afterAbort.ui.reservedBytes <= report.afterAbort.ui.budget);
    await page.evaluate(() => { window.__heldLoading = undefined;
        window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'); });
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading][data-campaign-art-density="1"]'),
        undefined, { timeout: 90000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800));
    await page.waitForTimeout(200);
    report.originalFallback = await page.evaluate(() => {
        const presentation = window.__heldLoading.presentation;
        const samples = ['progressHousing', 'progressFill'].map(key => {
            const sprite = presentation.sprites[key], canvas = document.querySelector(`canvas[data-campaign-sprite="${sprite.image}"]`);
            const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            return { key, size: [canvas.width, canvas.height], expectedSize: [sprite.width, sprite.height],
                originalRgba: actual.every((value, index) => value === sprite.frames[0].data[index]),
                rect: canvas.getBoundingClientRect().toJSON() };
        });
        return { hd: !!presentation.hd, samples, heatedOverlays: document.querySelectorAll('[data-loading-fill]').length };
    });
    assert.equal(report.originalFallback.hd, false); assert.equal(report.originalFallback.heatedOverlays, 0);
    for (const sample of report.originalFallback.samples) {
        assert(sample.originalRgba); assert.deepEqual(sample.size, sample.expectedSize);
    }
    for (const percent of [0, 62, 100]) {
        await page.evaluate(percent => { window.__heldLoading.percent = 0; window.__heldLoading.onLoadProgress(percent); }, percent);
        await page.waitForTimeout(80); await pixels('original-fallback-' + percent);
    }
    await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, 'sov04s.map');
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]');
    report.afterOriginalAbort = await page.evaluate(() => ({ activeLoading: document.querySelectorAll('[data-campaign-loading]').length,
        activeMedia: document.querySelectorAll('[data-campaign-media]').length, ui: window.__ra2debug.uiArt.metrics() }));
    assert.equal(report.afterOriginalAbort.activeLoading, 0); assert.equal(report.afterOriginalAbort.activeMedia, 0);
    assert(report.afterOriginalAbort.ui.reservedBytes <= report.afterOriginalAbort.ui.budget);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_PROGRESS_BORDER_ALIGNMENT_BOUNDED_FILTER_ROUNDING_FULLSCREEN_ORIGINAL_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
