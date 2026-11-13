// Historical diagnostic-build harness; use input-native.mjs for current formal mission validation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2] || path.join(root, '.artifacts/m3-1/presentation/native-' + Date.now()));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve(root, '../ra2-hd/.local') }));
const report = { status: 'RUNNING', platform: process.platform + '-' + process.arch, testPid: process.pid,
    scope: 'Original campaign presentation and actual diagnostic entry. No normal gameplay, victory, failure or mission continuity claim.',
    errors: [], consoleErrors: [], resourceFailures: [], screenshots: [] };
let app, page, capturing = false, capturePromise;
const frames = [];
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
async function startCapture() {
    await fs.mkdir(path.join(out, 'frames'));
    const started = performance.now(); capturing = true;
    capturePromise = (async () => {
        while (capturing && !page.isClosed()) {
            const timestamp = (performance.now() - started) / 1000;
            try {
                const bytes = await page.screenshot({ type: 'jpeg', quality: 85, scale: 'css', timeout: 10000 });
                const file = `frames/${String(frames.length).padStart(5, '0')}.jpg`;
                await fs.writeFile(path.join(out, file), bytes);
                frames.push({ file, timestamp, sha256: createHash('sha256').update(bytes).digest('hex') });
            } catch (error) { report.captureFailure = String(error); break; }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    })();
}
async function stopCapture() { capturing = false; await capturePromise; }
async function settledMenu() {
    await page.waitForFunction(() => {
        const menu = window.__ra2debug.mainMenu;
        return !menu.sidebarCollapsed && menu.sidebarSlots.every(slot => slot.getAnimationRunner().isStopped());
    });
}
await save();
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, '.artifacts/m3-1/review-runtime')], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
            RA2_CAMPAIGN_RESOURCE_ROOT: path.join(root, '.local/campaign') } });
    app.process().stdout?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    app.process().stderr?.on('data', chunk => { void fs.appendFile(path.join(out, 'electron.log'), chunk); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('pageerror', error => { report.errors.push(error.stack); void save(); });
    page.on('console', message => { if (message.type() === 'error') { report.consoleErrors.push(message.text() + ' ' + JSON.stringify(message.location())); void save(); } });
    page.on('response', response => { if (response.status() >= 400) { report.resourceFailures.push({ url: response.url(), status: response.status() }); void save(); } });
    const window = await app.browserWindow(page);
    await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    await window.evaluate(window => { window.setFullScreen(false); window.unmaximize(); window.setContentSize(1280, 960); });
    report.language = await page.evaluate(() => document.documentElement.lang);
    await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value = false);
    report.worldDisplay = 'Original for this presentation-only run. Concurrent main Urban resource repair remains untouched and is not integrated into this branch.';
    const retail = JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${report.language}.json`), 'utf8'));
    const labels = { ...retail.labels, ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${report.language}.json`), 'utf8')) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.presentation
        || document.querySelector('[data-campaign-selection] [role=alert]'), undefined, { timeout: 30000 });
    assert.equal(await page.locator('[data-campaign-selection] [role=alert]').count(), 0);
    report.menu = await page.evaluate(() => {
        const d = window.__ra2debug, p = d.mainMenuController.screens.get(22).presentation;
        return { logicalViewport: d.mainMenu.viewport, background: p.sprites.background.image,
            anchors: p.anchors, frameCounts: ['allied', 'tutorial', 'soviet'].map(name => p.sprites[name].frames.length),
            sources: p.sources, difficulty: document.querySelector('[data-campaign-difficulty]').value };
    });
    assert.equal(report.menu.logicalViewport.width, 800); assert.deepEqual(report.menu.frameCounts, [8, 8, 8]);
    assert.equal(report.menu.background, 'fsbkgdlg.shp'); assert.equal(report.menu.difficulty, '1');
    await settledMenu();
    await startCapture();
    await shot('01-retail-faction-selection');
    const allied = page.locator('[data-campaign-faction=allied]');
    await allied.hover();
    await page.waitForFunction(() => Number(document.querySelector('[data-campaign-faction=allied] canvas').dataset.frame) > 0);
    const sample = () => page.evaluate(async () => {
        const canvas = document.querySelector('[data-campaign-faction=allied] canvas'), frame = Number(canvas.dataset.frame);
        const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const expected = window.__ra2debug.mainMenuController.screens.get(22).presentation.sprites.allied.frames[frame].data;
        return { frame, sourcePixelsMatch: bytes.every((byte, index) => byte === expected[index]),
            sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    });
    const first = await sample();
    await page.waitForFunction(frame => Number(document.querySelector('[data-campaign-faction=allied] canvas').dataset.frame) !== frame, first.frame);
    const second = await sample(); report.arrowAnimation = [first, second];
    assert(first.sourcePixelsMatch && second.sourcePixelsMatch); assert.notEqual(first.sha256, second.sha256);
    await shot('02-retail-arrow-animation');
    await allied.click();
    await page.getByRole('status').filter({ hasText: labels['hd:campaignfactionunavailable'] }).waitFor();
    await page.locator('[data-campaign-faction=tutorial]').click();
    await page.getByRole('status').filter({ hasText: labels['hd:campaignfactionunavailable'] }).waitFor();
    const slider = page.locator('[data-campaign-difficulty]');
    await slider.focus(); await slider.press('End');
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.getByRole('status').filter({ hasText: labels['hd:campaigndifficultyunavailable'] }).waitFor();
    await slider.focus(); await slider.press('Home');
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.getByRole('status').filter({ hasText: labels['hd:campaigndifficultyunavailable'] }).waitFor();
    report.unavailableContent = { allied: true, tutorial: true, easy: true, hard: true,
        mediaNotStarted: await page.locator('[data-campaign-media]').count() === 0 };
    assert(report.unavailableContent.mediaNotStarted);
    await slider.focus(); await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '1');
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > .3, undefined, { timeout: 15000 });
    report.intro = await page.evaluate(() => {
        const v = document.querySelector('[data-campaign-media] video');
        return { source: 'Basic.Intro', dimensions: [v.videoWidth, v.videoHeight], audioBytes: v.webkitAudioDecodedByteCount, objectFit: getComputedStyle(v).objectFit };
    });
    assert.deepEqual(report.intro.dimensions, [640, 480]); assert(report.intro.audioBytes > 0);
    await shot('03-original-intro-after-soviet-selection');
    await page.evaluate(() => {
        window.__m3LoadingProgress = [];
        const observe = () => {
            const loading = document.querySelector('[data-campaign-loading]');
            if (loading) {
                const percent = Number(loading.dataset.percent);
                if (window.__m3LoadingProgress.at(-1) !== percent) window.__m3LoadingProgress.push(percent);
            }
        };
        const observer = new MutationObserver(observe); observer.observe(document.body, { subtree: true, attributes: true, childList: true });
        window.__m3LoadingObserver = observer;
    });
    const loadingShown = page.waitForSelector('[data-campaign-loading]', { timeout: 90000 });
    await page.locator('[data-campaign-media] button').click();
    await loadingShown;
    report.loading = await page.evaluate(() => {
        const node = document.querySelector('[data-campaign-loading]'), frame = document.querySelector('[data-campaign-loading-frame]').getBoundingClientRect();
        return { source: node.dataset.campaignLoadingSource, percent: Number(node.dataset.percent), aspect: frame.width / frame.height,
            title: document.querySelector('[data-campaign-load-message]').textContent,
            briefing: document.querySelector('[data-campaign-load-briefing]').textContent,
            sprites: [...node.querySelectorAll('canvas')].map(canvas => ({ image: canvas.dataset.campaignSprite, dimensions: [canvas.width, canvas.height] })) };
    });
    assert.equal(report.loading.source, 'ls800s01.shp'); assert(Math.abs(report.loading.aspect - 4 / 3) < .001);
    assert.equal(report.loading.title, labels['loadmsg:sov01']); assert.equal(report.loading.briefing, labels['loadbrief:sov01']);
    await shot('04-original-soviet01-loading');
    await page.waitForFunction(() => window.__ra2debug?.game?.campaign?.failure && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 90000 });
    report.progress = await page.evaluate(() => { window.__m3LoadingObserver.disconnect(); return window.__m3LoadingProgress; });
    assert(report.progress.length > 1); assert(report.progress.every((percent, index, values) => !index || percent >= values[index - 1]));
    report.diagnostic = await page.evaluate(() => { const g = window.__ra2debug.game; return { tick: g.currentTick, failure: g.campaign.failure, result: g.campaign.result ?? null }; });
    assert.equal(report.diagnostic.result, null); assert.equal(report.diagnostic.tick, 1);
    assert(report.diagnostic.failure.includes('[Actions] 0BB24A9C:0')); await shot('05-diagnostic-mission-entry');
    assert.equal(await page.locator('[data-campaign-loading]').count(), 0);
    await page.getByRole('button', { name: labels['hd:campaignreturn'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.mainMenuController.screens.get(22)?.presentation, undefined, { timeout: 30000 });
    await settledMenu();
    await stopCapture();
    await window.evaluate(window => window.setContentSize(1600, 900));
    await page.waitForFunction(() => window.innerWidth === 1600 && window.__ra2debug.mainMenu.viewport.width === 800);
    await shot('06-wide-original-faction-selection');
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-campaign-selection]')
        && window.__ra2debug.mainMenuController.getCurrentScreenType() === 0);
    await settledMenu();
    report.homeRestored = await page.evaluate(() => ({ logicalWidth: window.__ra2debug.mainMenu.viewport.width, width: window.innerWidth, height: window.innerHeight }));
    assert(report.homeRestored.logicalWidth > 800); await shot('07-existing-home-after-return');
    assert.equal(report.errors.length, 0, report.errors.join('\n')); assert.equal(report.consoleErrors.length, 0, report.consoleErrors.join('\n'));
    report.status = 'PASS_PRESENTATION_DIAGNOSTIC_ONLY';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    if (page && !page.isClosed()) await shot('failure').catch(() => {});
    throw error;
} finally {
    await stopCapture();
    await save(); await app?.close();
    if (frames.length > 1) {
        const lines = ['ffconcat version 1.0'];
        frames.forEach((frame, index) => lines.push(`file '${frame.file}'`, `duration ${Math.max(.04, (frames[index + 1]?.timestamp ?? frame.timestamp + .1) - frame.timestamp).toFixed(4)}`));
        lines.push(`file '${frames.at(-1).file}'`);
        const input = path.join(out, 'capture.ffconcat'); await fs.writeFile(input, lines.join('\n') + '\n');
        await fs.writeFile(path.join(out, 'capture-frames.json'), JSON.stringify(frames, null, 2) + '\n');
        const ffmpeg = execFileSync(path.join(root, '.artifacts/m3-1/media-tools/bin/python'),
            ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
        const conversion = spawnSync(ffmpeg, ['-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', input,
            '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-cpu-used', '4', '-row-mt', '1', '-pix_fmt', 'yuv420p',
            '-an', '-fps_mode', 'vfr', path.join(out, 'presentation-flow.webm')], { encoding: 'utf8' });
        await fs.writeFile(path.join(out, 'capture-conversion.log'), conversion.stderr);
        report.capture = { frames: frames.length, durationSeconds: frames.at(-1).timestamp,
            file: 'presentation-flow.webm', conversionStatus: conversion.status,
            scope: 'Silent recording of actual Electron screenshots with measured timestamps; instrumentation affects frame sampling, not mission logic.' };
        await save();
    }
    console.log(out);
}
