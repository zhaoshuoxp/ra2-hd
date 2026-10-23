// Exercise the native retail decoder, not predecoded images injected by a fixture.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const edition = process.argv[4] ?? 'yr', referenceFile = path.resolve(process.argv[5]);
const references = JSON.parse(await fs.readFile(referenceFile, 'utf8')).filter(r => r.edition === edition);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile');
await fs.mkdir(profile);
const packaged = build.endsWith('.app');
if (!packaged) await fs.writeFile(path.join(profile, 'resource-registration.json'),
    JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { edition, packaged, errors: [], countries: [], layouts: [] };
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
    async function capture(label) {
        await page.waitForTimeout(400);
        const layout = await page.locator('canvas[data-loading-backdrop]').evaluate(c => {
            const r = c.getBoundingClientRect();
            return { size: [c.width, c.height], bounds: [r.x, r.y, r.width, r.height], window: [innerWidth, innerHeight] };
        });
        const [x, y, w, h] = layout.bounds;
        assert(Math.abs(x) < 1 && Math.abs(y) < 1 && Math.abs(w - layout.window[0]) < 2 && Math.abs(h - layout.window[1]) < 2);
        report.layouts.push({ label, ...layout });
        await page.screenshot({ path: path.join(out, `${label}.png`) });
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
            wrapper.applyOptions(options => Object.assign(options, { countryName, bgImageSrc: src, color: candidate.color }));
            candidate.getUiObject().dispose?.();
            return { src, rgba: btoa(binary), palette: candidate.bgSpritePal, width: image.width, height: image.height };
        }, reference.country);
        assert.equal(decoded.palette, reference.palette);
        assert.deepEqual([decoded.width, decoded.height], [800, 600]);
        const hash = createHash('sha256').update(Buffer.from(decoded.rgba, 'base64')).digest('hex');
        assert.equal(hash, reference.rgbaSha256, `${edition}/${reference.country} retail pixels`);
        report.countries.push({ country: reference.country, palette: decoded.palette, rgbaSha256: hash });
        await fs.writeFile(path.join(out, `${reference.country}-source.png`), Buffer.from(decoded.src.split(',')[1], 'base64'));
        await capture(`${reference.country}-1512x982`);
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
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_RETAIL_PIXELS_ALL_COUNTRIES_AND_VIEWPORTS';
} catch (e) {
    report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1;
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(report.status);
}
