import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { packagedLaunch } from '../m3-2/native-session.mjs';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const packaged = process.argv.find(value => value.startsWith('--app='))?.slice(6);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], editions: [],
    scope: 'Complete reference-authored Yuri badge replaces the RA2 badge in HD and Original UI. Actual retail radar motion, source-logo suppression, static fallback, two exports, viewport fit, v0.5 and Home lifecycle. Isolated profiles; user visual acceptance remains separate.' };
if (packaged) report.packagedApplication = path.resolve(packaged);
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function title(edition, label) {
    const result = await page.evaluate(() => {
        const element = document.querySelector('[data-menu-edition-logo]');
        const video = document.querySelector('video');
        const version = document.querySelector('[data-testid=menu-version]')?.textContent;
        const oldTitleCount = document.querySelectorAll('[data-menu-expansion-title]').length;
        const scene = document.querySelector('.hd-menu-scene');
        const images = [...(scene?.querySelector('svg')?.children ?? [])].filter(el => el.tagName === 'image')
            .map(el => el.getAttribute('href'));
        const suppressed = document.querySelector('[data-retail-menu-footage]')?.getAttribute('data-retail-logo-suppressed');
        if (!element) return { badge: null, videoTime: video?.currentTime, version, oldTitleCount, images, suppressed };
        const rect = element.getBoundingClientRect(), svg = element.ownerSVGElement.getBoundingClientRect();
        return { badge: element.getAttribute('aria-label'), file: element.getAttribute('href'),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            svg: { x: svg.x, y: svg.y, width: svg.width, height: svg.height }, videoTime: video?.currentTime,
            version, oldTitleCount, images, suppressed };
    });
    assert.equal(result.badge, edition === 'yr' ? "Command & Conquer: Yuri's Revenge" : null);
    assert.equal(result.oldTitleCount, 0);
    assert.match(result.version, /^v0\.5\s/);
    if (edition === 'yr') {
        assert.match(result.file, /menu-yuri-logo-r1-(2|4)x\.png$/);
        assert(result.images.includes('/res/presentation/menu-yuri-radar-clean-r1.png'));
        assert(!result.images.some(file => /menu-radar-(neutral|lit)-r2/.test(file)));
        assert.equal(result.suppressed, 'true');
    }
    if (result.rect) {
        const { rect, svg } = result;
        assert(rect.width > 120 && rect.height > 12);
        assert(rect.x >= svg.x && rect.y >= svg.y && rect.x + rect.width <= svg.x + svg.width
            && rect.y + rect.height <= svg.y + svg.height, 'Expansion badge is clipped');
    }
    await page.screenshot({ path: path.join(out, `${edition}-${label}.png`) });
    return result;
}
try {
    for (const edition of ['ra2', 'yr']) {
        report.phase = edition; await save();
        const profile = path.join(out, edition, 'profile'); await fs.mkdir(profile, { recursive: true });
        const launch = packaged && packagedLaunch(packaged);
        if (!packaged || launch.resources) await fs.writeFile(path.join(profile, 'resource-registration.json'),
            JSON.stringify({ schemaVersion: 1, directory: launch?.resources ?? path.join(root, '.local') }));
        app = await electron.launch({
            executablePath: launch ? launch.executablePath : process.platform === 'win32'
                ? await fs.realpath(path.join(root, 'node_modules/electron/dist/electron.exe'))
                : await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
            args: packaged ? [] : [path.join(root, 'desktop/main.mjs')], cwd: process.platform === 'darwin' ? '/private/tmp' : os.tmpdir(),
            env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
                RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
                ...(launch?.resources ? { RA2_UI_RESOURCE_ROOT: launch.resources } : {}) },
        });
        page = await app.firstWindow({ timeout: 90000 });
        page.on('pageerror', error => report.errors.push(error.stack));
        page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
        await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
        await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
        const language = await page.evaluate(() => document.documentElement.lang);
        const retail = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-${edition}-${language}.json`)));
        const labels = { ...retail.labels,
            ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
        await page.getByRole('button', { name: labels['hd:menuoptions'], exact: true }).waitFor();
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
        await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor({ timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        const row = { edition, states: [] }; report.editions.push(row);
        for (const [width, height] of [[1280, 960], [1600, 900], [1024, 768]]) {
            await app.browserWindow(page).then(window => window.evaluate((window, size) => window.setSize(...size), [width, height]));
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            row.states.push({ mode: 'hd', size: [width, height], ...await title(edition, `hd-${width}`) });
        }
        const video = page.locator('[data-retail-menu-video]');
        const before = await video.evaluate(video => video.currentTime);
        await page.waitForTimeout(350);
        assert(await video.evaluate(video => video.currentTime) > before, 'Retail radar movie must advance');
        for (const time of [.9, 9.9, 22.2]) {
            await video.evaluate((video, time) => new Promise(resolve => {
                video.pause(); video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time;
            }), time);
            row.states.push({ mode: 'retail-scan', time, ...await title(edition, `scan-${time}`) });
        }
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
        await page.locator(edition === 'yr' ? '[data-menu-edition-logo]' : '[data-ui-menu-video]').waitFor();
        row.states.push({ mode: 'original-ui', ...await title(edition, 'original-ui') });
        if (edition === 'yr') {
            for (const density of [2, 4]) {
                await page.locator('[data-menu-edition-logo]').evaluate((image, density) => {
                    image.setAttribute('href', `/res/presentation/menu-yuri-logo-r1-${density}x.png`);
                }, density);
                const exported = await page.evaluate(async density => {
                    const image = new Image(); image.src = `/res/presentation/menu-yuri-logo-r1-${density}x.png`;
                    await image.decode();
                    return { width: image.naturalWidth, height: image.naturalHeight };
                }, density);
                assert.deepEqual(exported, { width: 480 * density, height: 160 * density });
                row.states.push({ mode: 'native-export', density, exported, ...await title(edition, `export-${density}x`) });
            }
            await video.evaluate(video => { video.pause(); video.dispatchEvent(new Event('error')); });
            await page.locator('.hd-menu-scene[data-radar-footage=fallback]').waitFor();
            row.states.push({ mode: 'video-error-fallback', ...await title(edition, 'video-error-fallback') });
            await video.evaluate(video => { video.dispatchEvent(new Event('seeked')); return video.play(); });
            await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor();
        }
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
        await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor();
        await page.getByRole('button', { name: labels['hd:menuoptions'], exact: true }).click();
        await page.locator('[data-language-options]').waitFor();
        assert.equal(await page.locator('[data-menu-edition-logo]').count(), 0);
        assert.equal(await page.locator('[data-retail-menu-video]').count(), 0);
        await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
        await page.locator('.hd-menu-scene[data-radar-footage=retail]').waitFor();
        row.states.push({ mode: 'home-return', ...await title(edition, 'home-return') });
        await app.close(); app = undefined; await save();
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_EDITION_MENU_LOGO_REPLACEMENT_RADAR_FALLBACK_EXPORTS_VERSION_AND_LIFECYCLE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await app?.close(); await save(); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
