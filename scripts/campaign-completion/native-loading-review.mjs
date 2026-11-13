import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { loadingBackdropPainter, verifyNativeLoadingWorld, captureLoadingComposition,
    verifyNativeLoadingSourceWorld } from './loading-composition.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const mission = process.argv[3] ?? 'sov03u.map', stem = mission.slice(0, -4);
const edition = process.argv.find(value => value.startsWith('--edition='))?.slice(10) ?? 'ra2';
assert(['ra2', 'yr'].includes(edition) && (edition === 'yr') === mission.endsWith('md.map'));
const stageArgument = process.argv.find(value => value.startsWith('--stage='))?.slice(8);
const stage = stageArgument && path.resolve(stageArgument);
const artReceipt = JSON.parse(await fs.readFile(stage ? path.join(stage, 'receipt.json')
    : path.resolve(import.meta.dirname, '../../docs/campaign-art', ...(edition === 'yr' ? ['yr-v1'] : []), stem + '-loading.json')));
const loading = JSON.parse(await fs.readFile(stage ? path.join(stage, 'files/interface-hd.json')
    : path.join('.local/campaign', edition, stem, 'interface-hd.json'))).loading;
assert.equal(artReceipt.mission, mission);
assert.deepEqual(loading.variants.map(variant => variant.density).sort(), [2, 4]);
const proofArgument = process.argv.find(value => value.startsWith('--source-world-proof='))?.slice(21);
let sourceProof;
if (proofArgument) {
    const file = path.resolve(proofArgument); sourceProof = JSON.parse(await fs.readFile(file));
    const bytes = await fs.readFile(path.resolve(path.dirname(file), sourceProof.original));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sourceProof.originalPngSha256);
    assert.equal(sourceProof.loadingSourceSha256, artReceipt.source.sha256);
    if (sourceProof.geometryAdmission) assert.equal(createHash('sha256')
        .update(await fs.readFile(sourceProof.geometryAdmission.atlas)).digest('hex'), sourceProof.geometryAdmission.sha256);
    const original = PNG.sync.read(bytes);
    for (const sample of sourceProof.samples) {
        const [x, y] = sample.at;
        assert.deepEqual([...original.data.subarray((y * original.width + x) * 4, (y * original.width + x) * 4 + 3)], sample.originalRgb);
    }
    for (const sample of sourceProof.grid) {
        if (!sample.originalRgb) continue;
        const [x, y] = sample.at, [r, g, b] = sample.originalRgb;
        assert.deepEqual([...original.data.subarray((y * original.width + x) * 4, (y * original.width + x) * 4 + 3)], sample.originalRgb);
        assert((sample.state ?? 'blue') === 'red' ? r > 24 && r > b * 2 && g < 8 : b > 24 && b > r * 2 && g < 8,
            'Grid proof disagrees with original loading pixels');
    }
}
const report = { status: 'RUNNING', errors: [], failedResources: [], frames: [], exports: [],
    edition, mission, ...(loading.inheritedPhotoDetail ? { inheritedPhotoDetail: loading.inheritedPhotoDetail } : {}),
    scope: 'Actual held native loading screen, unchanged original mission preparation, independent authored 2X/4X export decoding. The hold affects loading presentation only. This does not establish objective completion or user visual acceptance.',
    ...(stage ? { stage, stagedResponses: [], registration: 'STAGED_ARTWORK_PREVIEW_ONLY_NOT_FORMALLY_REGISTERED' } : {}) };
const formalManifest = path.join('.local/campaign', edition, stem, 'manifest.json');
const manifestBefore = await fs.readFile(formalManifest);
const sourcePresentation = JSON.parse(await fs.readFile(path.join('.local/campaign', edition, stem, 'presentation.json')));
const localizedLoading = edition === 'yr' ? await Promise.all(['zh-CN', 'zh-TW', 'en-US'].map(async language => {
    const { labels } = JSON.parse(await fs.readFile(`public/res/locale/retail-yr-${language}.json`));
    const message = labels[sourcePresentation.loading.loadMessage.toLowerCase()];
    const briefing = labels[sourcePresentation.loading.briefing.toLowerCase()];
    assert(typeof message === 'string' && typeof briefing === 'string');
    return { language, message, briefing: briefing.replace(/\\n/g, '\n') };
})) : [];
const painter = await loadingBackdropPainter();
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    ({ app, page } = await campaignSession(out, report, { edition, density: 4 }));
    if (stage) {
        assert.equal(artReceipt.acceptance, 'STAGED_NOT_REGISTERED_FULL_LOADING_AND_USER_REVIEW_PENDING');
        // Electron's custom protocol bypasses Playwright request interception.
        // Supply only these exact preview bytes to the page's normal verified
        // loading decoder; all map, world and media fetches retain their routes.
        const files = Object.fromEntries(await Promise.all((await fs.readdir(path.join(stage, 'files'))).map(async name =>
            [`/local-campaign/${edition}/${stem}/${name}`, {
                data: (await fs.readFile(path.join(stage, 'files', name))).toString('base64'),
                type: name.endsWith('.png') ? 'image/png' : name.endsWith('.svg') ? 'image/svg+xml' : 'application/json',
            }])));
        await page.evaluate(files => {
            const fetchBefore = window.fetch;
            window.__loadingPreview = { responses: [], restore: () => window.fetch = fetchBefore };
            window.fetch = (input, options) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
                if (Object.hasOwn(files, url.pathname) && (options?.method ?? (input instanceof Request ? input.method : 'GET')) === 'GET') {
                    window.__loadingPreview.responses.push(url.pathname.split('/').at(-1));
                    const payload = files[url.pathname], bytes = Uint8Array.from(atob(payload.data), character => character.charCodeAt(0));
                    return Promise.resolve(new Response(bytes, { headers: { 'content-type': payload.type } }));
                }
                return fetchBefore.call(window, input, options);
            };
        }, files);
    }
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory);
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...parameters) => {
                await start(...parameters); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve);
            };
            return api;
        };
    });
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
        await page.waitForTimeout(200);
        const metrics = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]'), canvas = node.querySelector('[data-campaign-backdrop]');
            const api = window.__heldLoading;
            return { source: node.dataset.campaignLoadingSource, density: node.dataset.campaignArtDensity,
                viewport: [innerWidth, innerHeight], canvas: [canvas.width, canvas.height], artRevision: api.presentation?.hd?.revision,
                reservedGpuBytes: api.presentation?.hd?.reservedGpuBytes, ui: window.__ra2debug.uiArt.metrics() };
        });
        assert.equal(metrics.source, artReceipt.source.member); assert.equal(metrics.density, '2');
        assert.equal(metrics.artRevision, artReceipt.revision);
        assert(metrics.reservedGpuBytes < 16 * 1024 * 1024);
        assert(metrics.ui.reservedBytes <= metrics.ui.budget);
        if (edition === 'yr' && artReceipt.sourceWorldLocator && artReceipt.emblem?.reuse?.rect) {
            const briefing = await page.evaluate(({ locator, emblemTop, lunar }) => {
                const frame = document.querySelector('[data-campaign-loading-frame]');
                const node = document.querySelector('[data-campaign-load-briefing]');
                const container = frame.getBoundingClientRect(), bounds = node.getBoundingClientRect();
                const scale = container.width / frame.clientWidth;
                const left = (frame.clientWidth - 800) / 2, top = (frame.clientHeight - 520) / 2;
                return { fontSize: getComputedStyle(node).fontSize, language: document.documentElement.lang,
                    logicalRight: (bounds.right - container.left) / scale,
                    logicalBottom: (bounds.bottom - container.top) / scale,
                    availableRight: left + (lunar ? 175 : locator[0] - 5),
                    availableBottom: top + emblemTop - 8 };
            }, { locator: artReceipt.sourceWorldLocator, emblemTop: artReceipt.emblem.reuse.rect[1],
                lunar: mission === 'sov06lmd.map' });
            assert(briefing.logicalRight <= briefing.availableRight + .5, 'YR briefing overlaps the original world locator');
            assert(briefing.logicalBottom <= briefing.availableBottom + .5, 'YR briefing overlaps the faction emblem');
            metrics.briefing = briefing;
            metrics.languageLayouts = await page.evaluate(localized => {
                const frame = document.querySelector('[data-campaign-loading-frame]');
                const node = document.querySelector('[data-campaign-load-briefing]');
                const header = document.querySelector('[data-campaign-load-message]');
                const original = [node.textContent, header.textContent, document.documentElement.lang];
                const layouts = [];
                try {
                    for (const value of localized) {
                        document.documentElement.lang = value.language;
                        node.textContent = value.briefing; header.textContent = value.message;
                        const container = frame.getBoundingClientRect(), bounds = node.getBoundingClientRect();
                        const scale = container.width / frame.clientWidth;
                        const text = document.createRange(); text.selectNodeContents(header);
                        layouts.push({ language: value.language,
                            logicalRight: (bounds.right - container.left) / scale,
                            logicalBottom: (bounds.bottom - container.top) / scale,
                            headerContentWidth: text.getBoundingClientRect().width / scale,
                            headerAvailableWidth: header.getBoundingClientRect().width / scale });
                    }
                } finally {
                    [node.textContent, header.textContent, document.documentElement.lang] = original;
                }
                return layouts;
            }, localizedLoading);
            for (const layout of metrics.languageLayouts) {
                assert(layout.logicalRight <= briefing.availableRight + .5, layout.language + ' briefing overlaps locator');
                assert(layout.logicalBottom <= briefing.availableBottom + .5, layout.language + ' briefing overlaps emblem');
                assert(layout.headerContentWidth <= layout.headerAvailableWidth + .5, layout.language + ' loading title overflows');
            }
        }
        const file = `native-loading-${width}x${height}.png`;
        const world = await verifyNativeLoadingWorld(page, painter);
        const sourceWorld = sourceProof ? await verifyNativeLoadingSourceWorld(page, sourceProof) : undefined;
        await page.screenshot({ path: path.join(out, file) }); report.frames.push({ file, ...metrics, world,
            ...(sourceWorld ? { sourceWorld } : {}) }); await save();
    }
    if (process.argv.includes('--check-missing-world')) {
        await page.evaluate(() => {
            const canvas = document.querySelector('[data-campaign-backdrop]'), context = canvas.getContext('2d');
            window.__loadingWorldPixels = context.getImageData(0, 0, canvas.width, canvas.height);
            context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
            context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height); context.restore();
        });
        try {
            await assert.rejects(() => verifyNativeLoadingWorld(page, painter), /Native world differs/);
            report.missingWorldNegativeProbe = 'PASS_BLACK_CANVAS_REJECTED';
        } finally {
            await page.evaluate(() => {
                const canvas = document.querySelector('[data-campaign-backdrop]');
                canvas.getContext('2d').putImageData(window.__loadingWorldPixels, 0, 0);
                delete window.__loadingWorldPixels;
            });
        }
        report.worldRestoredAfterNegativeProbe = await verifyNativeLoadingWorld(page, painter);
        report.negativeProbeScope = 'Temporary presentation-canvas pixels only, restored before loading continues; no map, world, runtime policy or source artwork changes.';
    }
    if (process.argv.includes('--check-right-gap')) {
        assert(sourceProof?.extensionRegions?.length);
        const [rx, ry, rw, rh] = sourceProof.extensionRegions[0].rect;
        const outside = ([x, y]) => x < rx || x >= rx + rw || y < ry || y >= ry + rh;
        // Positive captures verify every original sample. The specialized negative
        // isolates the coverage guard when a source sample also occupies this area.
        const coverageProof = { ...sourceProof, samples: sourceProof.samples.filter(sample => outside(sample.at)) };
        assert(coverageProof.samples.length > 0);
        report.rightGapNegativeExcludedSourceSamples = sourceProof.samples.filter(sample => !outside(sample.at))
            .map(sample => sample.name);
        await page.evaluate(rect => {
            const canvas = document.querySelector('[data-campaign-backdrop]'), context = canvas.getContext('2d');
            window.__rightGapPixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const [x, y, width, height] = rect;
            const left = (canvas.clientWidth - 800) / 2, top = (canvas.clientHeight - 520) / 2;
            context.save(); context.setTransform(canvas.width / canvas.clientWidth, 0, 0, canvas.height / canvas.clientHeight, 0, 0);
            context.fillStyle = '#000'; context.fillRect(left + x, top + y, width, height); context.restore();
        }, sourceProof.extensionRegions[0].rect);
        try {
            await assert.rejects(() => verifyNativeLoadingSourceWorld(page, coverageProof), /Right world geography is absent/);
            report.rightGapNegativeProbe = 'PASS_RIGHT_ONLY_GAP_REJECTED';
        } finally {
            await page.evaluate(() => {
                document.querySelector('[data-campaign-backdrop]').getContext('2d').putImageData(window.__rightGapPixels, 0, 0);
                delete window.__rightGapPixels;
            });
        }
        report.rightWorldRestored = await verifyNativeLoadingSourceWorld(page, sourceProof);
        report.rightGapScope = 'Specialized temporary right-background pixel removal, restored before continuing. No world, trigger, rule, movie or objective changes.';
    }
    for (const { density, file: asset } of loading.variants) {
        const capture = await captureLoadingComposition(page, painter, stem, asset, edition);
        assert.equal(capture.width, 800 * density); assert.equal(capture.height, 520 * density);
        const file = `authored-loading-${density}x.png`;
        const composition = `composited-loading-${density}x.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(capture.foregroundPng.split(',')[1], 'base64'));
        await fs.writeFile(path.join(out, composition), Buffer.from(capture.compositedPng.split(',')[1], 'base64'));
        assert(capture.transparentForegroundPixels > 0 && capture.visibleWorldPixels > 1000 * density * density);
        assert(capture.maximumBackgroundChannelDifference <= 1);
        report.exports.push({ density, file, composition, width: capture.width, height: capture.height,
            transparentForegroundPixels: capture.transparentForegroundPixels, visibleWorldPixels: capture.visibleWorldPixels,
            maximumBackgroundChannelDifference: capture.maximumBackgroundChannelDifference,
            qualification: loading.world
                ? 'Independent foreground composed with the source-qualified palette/registration variant of the accepted world relief. Foreground-only PNG is not a complete page.'
                : 'Independent foreground composed with the unchanged shared world using the official painter. Foreground-only PNG retains transparency and is not a complete page.' });
    }
    if (stage) report.stagedResponses = await page.evaluate(() => {
        const preview = window.__loadingPreview; preview.restore(); return preview.responses;
    });
    await page.evaluate(() => {
        window.__loadingWorldImage = window.__heldLoading.presentation.backdrop.image;
        window.__releaseLoading();
    });
    await waitWorld(page, mission);
    await page.waitForFunction(() => window.__loadingWorldImage.getAttribute('src') === '', undefined, { timeout: 10000 });
    report.afterLoading = await page.evaluate(() => ({ worldImageReleased: window.__loadingWorldImage.getAttribute('src') === '',
        ui: window.__ra2debug.uiArt.metrics(), worldCanvasCount: document.querySelectorAll('[data-campaign-backdrop]').length }));
    await page.screenshot({ path: path.join(out, 'native-opening-after-loading.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    if (stage) for (const name of ['manifest.json', 'interface-hd.json', ...loading.variants.map(variant => variant.file),
        ...(loading.world ? [loading.world.file] : [])])
        assert(report.stagedResponses.includes(name), 'Staged preview did not load ' + name);
    assert(manifestBefore.equals(await fs.readFile(formalManifest)), 'Formal manifest changed during loading review');
    report.formalManifestUnchanged = true;
    report.status = stage ? 'PASS_NATIVE_STAGED_LOADING_PREVIEW_NOT_REGISTERED_VISUAL_REVIEW_PENDING'
        : 'PASS_NATIVE_LOADING_AND_INDEPENDENT_EXPORT_GEOMETRY_VISUAL_REVIEW_PENDING';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (error.loadingSourceObservation) report.loadingSourceFailure = error.loadingSourceObservation;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
