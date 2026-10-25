// Exercise the native retail decoder, not predecoded images injected by a fixture.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const edition = process.argv[4] ?? 'yr', referenceFile = path.resolve(process.argv[5]);
const allReferences = JSON.parse(await fs.readFile(referenceFile, 'utf8'));
const references = allReferences.filter(r => r.edition === edition);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile');
await fs.mkdir(profile);
const packaged = build.endsWith('.app');
if (!packaged) await fs.writeFile(path.join(profile, 'resource-registration.json'),
    JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { edition, packaged, errors: [], countries: [], layouts: [], flags: [],
    disclosure: 'Actual native game loading is held after resource loading to inspect all retail country decodes and rendered flag pixels.' };
let app;
try {
    app = await electron.launch({
        executablePath: packaged ? path.join(build, 'Contents/MacOS/RA2 HD Editions')
            : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        cwd: '/private/tmp', args: packaged ? [] : [build],
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: packaged ? '0' : '1' },
    });
    const page = await app.firstWindow();
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(edition => {
        const prefs = { _r_lastMap: edition === 'yr' ? 'XMP23T4.map' : 'MP23T4.map', _r_lastMode: '1',
            _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(`_edition:${edition}:${k}`, v));
    }, edition);
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => {
        const root = window.__ra2debug.mainMenuController.getCurrentScreen().rootController;
        const screen = [...root.screens.values()].find(s => s.gameLoader);
        const loader = screen.gameLoader, original = loader.load;
        window.loadingTestScreen = screen;
        const held = new Promise(resolve => window.releaseLoadingTest = resolve);
        loader.load = async function(...args) {
            const result = await original.apply(this, args);
            await held; loader.load = original; return result;
        };
        void window.__ra2debug.skirmishLobby.startGame();
    });
    await page.locator('canvas[data-loading-backdrop]').waitFor({ timeout: 90000 });
    await page.waitForTimeout(1500);
    async function capture(label, screenshot = true) {
        await page.waitForTimeout(400);
        const layout = await page.locator('canvas[data-loading-backdrop]').evaluate(c => {
            const r = c.getBoundingClientRect();
            return { size: [c.width, c.height], bounds: [r.x, r.y, r.width, r.height], window: [innerWidth, innerHeight] };
        });
        const [x, y, w, h] = layout.bounds;
        assert(Math.abs(x) < 1 && Math.abs(y) < 1 && Math.abs(w - layout.window[0]) < 2 && Math.abs(h - layout.window[1]) < 2);
        report.layouts.push({ label, ...layout });
        const flag = await page.locator('canvas[data-loading-backdrop]').evaluate(async c => {
            const wrapper = window.loadingTestScreen.loadingScreenApi.loadingScreen;
            const src = window.__loadingCandidateActive ? window.__loadingFlagSrc : wrapper.flagHtmlImg;
            if (!src) return { ready: c.dataset.loadingFlag === 'ready', present: false };
            const image = new Image(); image.src = src; await image.decode();
            const expected = document.createElement('canvas'); expected.width = c.width; expected.height = c.height;
            const ctx = expected.getContext('2d');
            ctx.scale(2, 2); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            const scale = Math.min(216 / image.width, 164 / image.height);
            const width = image.width * scale, height = image.height * scale;
            const x = 500 + parseFloat(c.style.width) - 800 + (216 - width) / 2, y = 380 + (164 - height) / 2;
            ctx.drawImage(image, x, y, width, height);
            // Chromium can switch to CPU rasterization after repeated canvas readback.
            const cpu = document.createElement('canvas'); cpu.width = c.width; cpu.height = c.height;
            const cpuCtx = cpu.getContext('2d', { willReadFrequently: true });
            cpuCtx.scale(2, 2); cpuCtx.imageSmoothingEnabled = true; cpuCtx.imageSmoothingQuality = 'high';
            cpuCtx.drawImage(image, x, y, width, height);
            const actual = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const reference = ctx.getImageData(0, 0, c.width, c.height).data;
            const cpuReference = cpuCtx.getImageData(0, 0, c.width, c.height).data;
            let samples = 0, mismatches = 0, bright = 0, errorSum = 0, maxError = 0;
            for (let py = Math.ceil(y * 2) + 4; py < (y + height) * 2 - 4; py += 6) {
                for (let px = Math.ceil(x * 2) + 4; px < (x + width) * 2 - 4; px += 6) {
                    const i = (py * c.width + px) * 4;
                    if (reference[i + 3] !== 255) continue;
                    samples++;
                    const error = Math.min(...[reference, cpuReference].map(pixels =>
                        Math.max(...[0, 1, 2].map(channel => Math.abs(actual[i + channel] - pixels[i + channel])))));
                    errorSum += error; maxError = Math.max(maxError, error);
                    if (error > 4) mismatches++;
                    if (Math.max(actual[i], actual[i + 1], actual[i + 2]) > 40) bright++;
                }
            }
            return { present: true, ready: c.dataset.loadingFlag === 'ready', samples, mismatches,
                meanError: errorSum / samples, maxError, bright,
                source: c.dataset.loadingSource, artId: c.dataset.loadingArtId, ui: window.__ra2debug.uiArt.metrics() };
        });
        report.flags.push({ label, ...flag });
        if (screenshot) await page.screenshot({ path: path.join(out, `${label}.png`) });
        if (edition === 'yr') {
            if (flag.present) {
                assert(flag.ready); assert(flag.samples > 1500); assert.equal(flag.mismatches, 0, `${label} rendered flag pixels`);
                assert(flag.bright > 100, `${label} must not be a black flag window`);
            }
        } else assert.equal(flag.ready, false, 'RA2 must retain the embedded original flag');
    }
    await page.setViewportSize({ width: 1512, height: 982 });
    await capture('actual-soviet-entry');
    for (const reference of references) {
        const decoded = await page.evaluate(async countryName => {
            const wrapper = window.loadingTestScreen.loadingScreenApi.loadingScreen;
            const country = wrapper.props.rules.getMultiplayerCountries().find(c => c.name === countryName);
            if (!country && countryName !== 'Observer') throw new Error(`Missing country: ${countryName}`);
            const props = { ...wrapper.props, playerName: '__loading_validation__',
                playerInfos: [{ name: '__loading_validation__', country }] };
            const candidate = new wrapper.constructor(props);
            if (!candidate.bgHtmlImg?.startsWith('data:image/png')) throw new Error('Retail loading decode failed');
            const src = candidate.bgHtmlImg, image = new Image();
            image.src = src; await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let binary = '';
            for (let i = 0; i < rgba.length; i += 8192) binary += String.fromCharCode(...rgba.subarray(i, i + 8192));
            const flagSrc = candidate.flagHtmlImg;
            let flag;
            if (flagSrc) {
                const f = new Image(); f.src = flagSrc; await f.decode();
                const fc = document.createElement('canvas'); fc.width = f.width; fc.height = f.height;
                const ctx = fc.getContext('2d'); ctx.drawImage(f, 0, 0);
                const bytes = ctx.getImageData(0, 0, fc.width, fc.height).data;
                let binary = '';
                for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                flag = { width: f.width, height: f.height, rgba: btoa(binary) };
            }
            window.__loadingFlagSrc = flagSrc;
            window.__loadingCandidateActive = true;
            wrapper.applyOptions(options => Object.assign(options, { countryName, bgImageSrc: src,
                flagImageSrc: flagSrc, color: candidate.color, unitArtworkReady: true }));
            candidate.getUiObject().dispose?.();
            return { src, rgba: btoa(binary), palette: candidate.bgSpritePal, width: image.width, height: image.height, flag };
        }, reference.country);
        assert.equal(decoded.palette, reference.palette);
        assert.deepEqual([decoded.width, decoded.height], [800, 600]);
        const hash = createHash('sha256').update(Buffer.from(decoded.rgba, 'base64')).digest('hex');
        assert.equal(hash, reference.rgbaSha256, `${edition}/${reference.country} retail pixels`);
        let flagHash;
        if (edition === 'yr' && reference.country !== 'Observer') {
            assert(decoded.flag, `${reference.country} must decode its flag`);
            const expected = allReferences.find(r => r.country === reference.country
                && r.edition === (reference.country === 'YuriCountry' ? 'yr' : 'ra2')).flag;
            assert.deepEqual([decoded.flag.width, decoded.flag.height], [expected.width, expected.height]);
            flagHash = createHash('sha256').update(Buffer.from(decoded.flag.rgba, 'base64')).digest('hex');
            assert.equal(flagHash, expected.rgbaSha256, `${reference.country} original flag pixels`);
        } else assert.equal(decoded.flag, undefined);
        report.countries.push({ country: reference.country, palette: decoded.palette, rgbaSha256: hash, flagSha256: flagHash });
        await fs.writeFile(path.join(out, `${reference.country}-source.png`), Buffer.from(decoded.src.split(',')[1], 'base64'));
        await capture(`${reference.country}-1512x982`);
        for (const [enabled, density] of [[false, 2], [true, 2], [true, 4]]) {
            await page.evaluate(({ enabled, density }) => {
                const g = window.__ra2debug.generalOptions.graphics;
                g.hdDensity.value = density; g.hdEnabled.value = enabled;
            }, { enabled, density });
            await capture(`${reference.country}-${enabled ? density + 'X' : 'Original'}`,
                ['Americans', 'YuriCountry'].includes(reference.country));
        }
        if (['Americans', 'Africans', 'YuriCountry'].includes(reference.country)) {
            for (const [width, height] of [[1920, 1080], [1920, 1200], [1728, 1117]]) {
                await page.setViewportSize({ width, height });
                await capture(`${reference.country}-${width}x${height}`);
            }
            await page.setViewportSize({ width: 1512, height: 982 });
        }
    }
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.clearDeviceMetricsOverride');
    await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
    await page.waitForTimeout(1000);
    report.nativeFullscreen = await page.evaluate(() => window.desktopDisplay.get());
    assert.equal(report.nativeFullscreen.fullscreen, true);
    await capture('native-fullscreen');
    await page.evaluate(async () => {
        const display = await window.desktopDisplay.get();
        await window.desktopDisplay.set(display.choices.find(c => c.id !== 'fullscreen').id);
    });
    await session.detach();
    await page.evaluate(() => window.releaseLoadingTest());
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    report.gameStarted = true;
    await page.waitForFunction(() => !document.querySelector('canvas[data-loading-backdrop]'));
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_RETAIL_BACKDROPS_AND_FLAGS_ALL_COUNTRIES_HD_MODES_AND_VIEWPORTS';
} catch (e) {
    report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1;
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(report.status);
}
