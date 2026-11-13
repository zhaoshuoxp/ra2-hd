import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const density = Number(process.argv.find(a => a.startsWith('--density='))?.slice(10) ?? 4);
const focused = process.argv.includes('--training02-fullscreen');
const nativeReference = process.argv.includes('--native-source-reference');
const emptyOnly = process.argv.includes('--empty-only');
const report = { status: 'RUNNING', errors: [], failedResources: [], frames: [],
    scope: 'Actual public Training01/02 loading pages at held percentage probes. Exact unchanged source material at 0%, whole source-aligned segments, shared orange-yellow metal at completion, native window/fullscreen and public abort.' };
let app, page, labels;
const pixels = file => PNG.sync.read(file);
function equalSuffix(a, b, start, end, top, bottom) {
    assert.equal(a.width, b.width); assert.equal(a.height, b.height);
    let changed = 0, maximum = 0, total = 0;
    for (let y = top; y < bottom; y++) for (let x = start; x < end; x++) {
        const i = (y * a.width + x) * 4;
        const delta = Math.max(...a.data.subarray(i, i + 4).map((value, c) => Math.abs(value - b.data[i + c])));
        if (delta) changed++;
        total += delta;
        maximum = Math.max(maximum, delta);
    }
    // Native GPU tile invalidation rounds some unchanged edge taps. Require
    // unchanged material within a bounded 8-bit raster tolerance, not new paint.
    const count = Math.max(1, (bottom - top) * (end - start)), mean = total / count;
    assert(maximum <= 8 && mean <= .15, JSON.stringify({ changed, maximum, mean, start }));
    return { maximumGpuRounding: maximum, changedSamples: changed,
        changedFraction: changed / count, meanMaximumChannelDelta: mean, core: [start, top, end, bottom] };
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory); factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => { await start(...args); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve); };
            return api;
        };
    });
    for (const mission of nativeReference ? ['trn01t.map'] : focused ? ['trn02t.map'] : ['trn01t.map', 'trn02t.map']) {
        await page.evaluate(mission => { window.__heldLoading = undefined;
            window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission); }, mission);
        await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
        for (const layout of nativeReference ? ['window'] : focused ? ['fullscreen'] : ['window', 'fullscreen']) {
            if (layout === 'window') await app.evaluate(({ BrowserWindow }, nativeReference) => {
                const w = BrowserWindow.getAllWindows()[0]; w.setSimpleFullScreen(false);
                w.setContentSize(nativeReference ? 800 : 1280, nativeReference ? 600 : 800);
            }, nativeReference);
            else await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
            await page.waitForTimeout(400);
            let empty;
            const percentages = emptyOnly ? [0] : mission === 'trn01t.map' && layout === 'window'
                ? [0, 4, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 5), 62, 99] : [0, 4, 5, 25, 62, 99, 100];
            for (const percent of percentages) {
                await page.evaluate(percent => { window.__heldLoading.percent = 0; window.__heldLoading.onLoadProgress(percent); }, percent);
                await page.waitForTimeout(80);
                const state = await page.locator('[data-campaign-loading-segments]').evaluate(node => {
                    const box = node.getBoundingClientRect(), paths = [...node.querySelectorAll('[data-loading-segment]')];
                    const filled = paths.filter(p => p.dataset.filled === 'true');
                    return { completed: Number(node.dataset.completedSegments), count: paths.length,
                        material: node.dataset.loadingMaterialSource,
                        filled: filled.length, hidden: paths.filter(p => p.getAttribute('display') === 'none').length,
                        box: box.toJSON(), viewport: [innerWidth, innerHeight], logicalWidth: node.viewBox.baseVal.width,
                        suffixStart: filled.length ? Math.ceil((filled.at(-1).getBBox().x + filled.at(-1).getBBox().width)
                            * box.width / node.viewBox.baseVal.width) + 3 : 0 };
                });
                assert.equal(state.completed, Math.floor(percent / 5)); assert.equal(state.filled, state.completed);
                assert.equal(state.material, density ? 'accepted-hd-housing' : 'original-shp-pair');
                assert.equal(state.count, 20); assert.equal(state.hidden, 20 - state.completed);
                const file = `${mission.slice(0, -4)}-${layout}-${percent}-bar.png`;
                const capture = async () => {
                    const full = pixels(await page.screenshot({ scale: 'css' }));
                    const scale = full.width / state.viewport[0];
                    const x = Math.max(0, Math.round(state.box.x * scale)), y = Math.max(0, Math.round(state.box.y * scale));
                    const width = Math.min(full.width - x, Math.round(state.box.width * scale));
                    const height = Math.min(full.height - y, Math.round(state.box.height * scale));
                    assert(height > 0 && height < full.height / 3, 'Actual progress chrome must be at the bottom of the frame');
                    const crop = new PNG({ width, height });
                    PNG.bitblt(full, crop, x, y, width, height, 0, 0);
                    return PNG.sync.write(crop);
                };
                const png = await capture(); await fs.writeFile(path.join(out, file), png);
                const actual = pixels(png);
                if (percent === 0) {
                    empty = actual;
                    const fill = page.locator('[data-loading-fill=original-material-orange],[data-loading-fill=original-shp-fill]');
                    await fill.evaluate(node => node.style.visibility = 'hidden');
                    const original = pixels(await capture());
                    assert.deepEqual(actual.data, original.data, 'Zero percent must preserve the exact accepted housing');
                    await fill.evaluate(node => node.style.removeProperty('visibility'));
                }
                if (percent === 4) assert.deepEqual(actual.data, empty.data);
                if (percent < 100) {
                    const factor = actual.width / state.logicalWidth;
                    // Compare the actual cylinder, excluding cap/wire antialiasing.
                    const end = Math.floor((172 + (1380 - 381.41) * (state.logicalWidth - 344) / 1011.18) * factor);
                    const top = Math.ceil((-12.35 + (430 - 385) * 52.35 / 106) * factor);
                    const bottom = Math.floor((-12.35 + (473 - 385) * 52.35 / 106) * factor);
                    state.unfilledComparison = equalSuffix(actual, empty,
                        Math.ceil(state.suffixStart * actual.width / state.box.width), end, top, bottom);
                }
                if (density && state.completed > 0 && state.completed < 20) {
                    const factor = actual.width / state.logicalWidth;
                    state.highlightEdge = [432, 438, 442, 450, 460, 470].map(sourceY => {
                        const y = Math.round((-12.35 + (sourceY - 385) * 52.35 / 106) * factor);
                        let last = -1;
                        for (let x = 0; x < actual.width; x++) {
                            const i = (y * actual.width + x) * 4;
                            if ([0, 1, 2].some(c => Math.abs(actual.data[i + c] - empty.data[i + c]) > 12)) last = x;
                        }
                        return { sourceY, last };
                    });
                    const edges = state.highlightEdge.map(row => row.last);
                    assert(Math.min(...edges) >= 0 && Math.max(...edges) - Math.min(...edges) <= 1,
                        'Tint edge must stay vertical through the native highlight: ' + JSON.stringify(state.highlightEdge));
                }
                if (percent === 100) {
                    let orange = 0;
                    for (let i = 0; i < actual.data.length; i += 4) if (actual.data[i] > 220 && actual.data[i + 1] > 110
                        && actual.data[i + 1] < actual.data[i] && actual.data[i + 2] < 100) orange++;
                    assert(orange > actual.width, 'Capture must include the actual orange-yellow cylinder');
                    state.orangePixels = orange;
                }
                if (nativeReference) {
                    const reference = await page.evaluate(async () => {
                        const p = window.__heldLoading.presentation, node = document.querySelector('[data-campaign-loading-segments]');
                        if (Math.abs(node.viewBox.baseVal.width - 800) > .001) throw Error('Native reference requires an 800px loading viewport');
                        const copy = node.cloneNode(true); copy.setAttribute('width', '800'); copy.setAttribute('height', '40');
                        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
                        const image = new Image(); image.src = url; await image.decode();
                        const actual = document.createElement('canvas'); actual.width = 800; actual.height = 40;
                        actual.getContext('2d').drawImage(image, 0, 0); URL.revokeObjectURL(url);
                        const expected = document.createElement('canvas'); expected.width = 800; expected.height = 40;
                        const context = expected.getContext('2d'); context.putImageData(p.sprites.progressHousing.frames[0], 0, 0);
                        const fill = document.createElement('canvas'); fill.width = 456; fill.height = 25;
                        fill.getContext('2d').putImageData(p.sprites.progressFill.frames[0], 0, 0);
                        const cuts = [0, 18, 41, 64, 87, 110, 134, 157, 180, 203, 226, 249, 272, 295, 319, 342, 365, 388, 411, 434, 456];
                        const width = cuts[Number(node.dataset.completedSegments)];
                        if (width) context.drawImage(fill, 0, 0, width, 25, 172, 13, width, 25);
                        const a = actual.getContext('2d').getImageData(0, 0, 800, 40).data;
                        const b = context.getImageData(0, 0, 800, 40).data;
                        let changed = 0, maximum = 0;
                        for (let i = 0; i < a.length; i++) {
                            const delta = Math.abs(a[i] - b[i]); if (delta) changed++;
                            maximum = Math.max(maximum, delta);
                        }
                        return { changed, maximum, filters: node.querySelectorAll('filter').length,
                            hdHousingReferences: [...node.querySelectorAll('image')].filter(image =>
                                (image.getAttribute('href') ?? '').includes('campaign-loading-housing-r2.png')).length,
                            actual: actual.toDataURL('image/png'), expected: expected.toDataURL('image/png') };
                    });
                    const expected = pixels(Buffer.from(reference.expected.split(',')[1], 'base64'));
                    let difference = 0, decorDifference = 0, decorChannels = 0, maximum = 0;
                    for (let y = 0; y < 40; y++) for (let x = 0; x < 800; x++) {
                        const sx = Math.min(actual.width - 1, Math.floor((x + .5) * actual.width / 800));
                        const sy = Math.min(actual.height - 1, Math.floor((y + .5) * actual.height / 40));
                        for (let c = 0; c < 3; c++) {
                            const delta = Math.abs(actual.data[(sy * actual.width + sx) * 4 + c] - expected.data[(y * 800 + x) * 4 + c]);
                            difference += delta; maximum = Math.max(maximum, delta);
                            if (x < 172 || x >= 628) { decorDifference += delta; decorChannels++; }
                        }
                    }
                    reference.actualScreen = { meanChannelDelta: difference / (800 * 40 * 3),
                        decorationMeanChannelDelta: decorDifference / decorChannels, maximum };
                    // Compare the composited CSS3D screen within two native
                    // palette steps; the native bitmap composition stays exact.
                    assert(reference.actualScreen.maximum <= 8 && reference.actualScreen.meanChannelDelta <= 1
                        && reference.actualScreen.decorationMeanChannelDelta <= 1,
                        'Actual game pixels, including ornaments, must match original bitmap composition: ' + JSON.stringify(reference.actualScreen));
                    assert.equal(reference.filters, 0); assert.equal(reference.hdHousingReferences, 0);
                    for (const key of ['actual', 'expected']) {
                        if ([0, 25, 100].includes(percent)) await fs.writeFile(path.join(out, `native-source-${percent}-${key}.png`),
                            Buffer.from(reference[key].split(',')[1], 'base64'));
                        delete reference[key];
                    }
                    state.nativeSourceReference = reference;
                    assert.equal(reference.changed, 0, 'Original rendering must match direct original bitmap composition at (172,13)');
                }
                if ([25, 62, 100].includes(percent)) await page.screenshot({ path: path.join(out, `${mission.slice(0, -4)}-${layout}-${percent}.png`) });
                report.frames.push({ mission, layout, percent, file, ...state, unchangedUnfilledMaterial: true });
            }
        }
        await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, mission);
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_SOURCE_METAL_ORANGE_YELLOW_WHOLE_SEGMENTS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
