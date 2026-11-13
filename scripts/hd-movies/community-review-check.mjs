import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]), review = path.resolve(process.argv[3]);
const pairs = Number(process.argv[4] ?? 5), nativeCaptures = Number(process.argv[5] ?? pairs * 2);
assert(Number.isInteger(pairs) && pairs > 0 && Number.isInteger(nativeCaptures) && nativeCaptures >= 0);
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
await fs.writeFile(path.join(out, 'main.mjs'), `
import { app, BrowserWindow } from 'electron';
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
let window;
app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1440, height: 1000, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadFile(${JSON.stringify(review)});
});
`);
let app, page;
const report = { status: 'RUNNING', errors: [], playback: [], fullscreen: [],
    declaredPairs: pairs, declaredNativeCaptures: nativeCaptures,
    scope: 'Declared source-matched comparison pairs on one playback clock, original references, separate source audio, full-screen and available radar scales. No production movie selection or visual acceptance is inferred.' };
async function capture(name) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(out, name + '.png') });
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 45000 });
    page = await app.firstWindow({ timeout: 30000 }); page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForFunction(pairs => document.querySelectorAll('article').length === pairs
        && document.querySelectorAll('video').length === pairs * 4
        && [...document.querySelectorAll('video')].every(video => video.readyState >= 2 && !video.error), pairs);
    report.contents = await page.evaluate(() => ({ title: document.title, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        videos: [...document.querySelectorAll('video')].map(video => {
            const frame = new VideoFrame(video), colorSpace = frame.colorSpace.toJSON(); frame.close();
            return { identity: video.dataset.identity, kind: video.dataset.kind, dimensions: [video.videoWidth, video.videoHeight],
                duration: video.duration, colorSpace };
        }) }));
    assert(!report.contents.horizontalOverflow);
    for (const video of report.contents.videos) assert.deepEqual(video.colorSpace,
        { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
    for (let index = 0; index < pairs; index++) {
        await page.evaluate(index => document.querySelectorAll('article')[index].querySelector('[data-action=play]').click(), index);
        await page.waitForFunction(index => document.querySelectorAll('article')[index].querySelector('.pair').currentTime > .65,
            index, { timeout: 15000 });
        const state = await page.evaluate(index => {
            const article = document.querySelectorAll('article')[index], pair = article.querySelector('.pair');
            article.querySelector('[data-action=pause]').click();
            const quality = pair.getVideoPlaybackQuality();
            return { identity: article.dataset.identity, time: pair.currentTime, audible: !pair.muted && pair.volume > 0,
                totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames,
                sourcesPaused: [...article.querySelectorAll('.sources video')].every(video => video.paused) };
        }, index);
        assert(state.sourcesPaused && state.audible && state.totalFrames > 1); report.playback.push(state);
    }
    const fullscreenCases = [[0, 'fullscreen-pair'], [0, 'fullscreen-local'], [0, 'fullscreen-community']];
    if (pairs > 1) fullscreenCases.push([pairs - 1, 'fullscreen-community']);
    for (const [index, action] of fullscreenCases) {
        await app.evaluate(({ BrowserWindow }) => {
            const window = BrowserWindow.getAllWindows()[0];
            globalThis.__reviewEnter = new Promise(resolve => window.once('enter-full-screen', () => resolve(true)));
            globalThis.__reviewLeave = new Promise(resolve => window.once('leave-full-screen', () => resolve(true)));
        });
        const point = await page.evaluate(({ index, action }) => {
            const button = document.querySelectorAll('article')[index].querySelector(`[data-action=${action}]`);
            button.scrollIntoView({ block: 'center' }); const bounds = button.getBoundingClientRect();
            return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        }, { index, action });
        await page.mouse.click(point.x, point.y);
        await page.waitForFunction(() => !!document.fullscreenElement?.querySelector('video'));
        await app.evaluate(async () => await globalThis.__reviewEnter);
        const state = await page.evaluate(() => {
            const video = document.fullscreenElement.querySelector('video'), bounds = video.getBoundingClientRect();
            return { kind: video.dataset.kind, width: bounds.width, height: bounds.height, viewport: [innerWidth, innerHeight],
                fit: getComputedStyle(video).objectFit, controls: video.controls, audible: !video.muted && video.volume > 0 };
        });
        assert.equal(state.width, state.viewport[0]); assert.equal(state.height, state.viewport[1]); assert.equal(state.fit, 'contain');
        assert(state.controls && state.audible); report.fullscreen.push(state); await capture(`fullscreen-${index}-${action}`);
        const exit = await page.evaluate(() => {
            const bounds = document.querySelector('[data-action=exit-fullscreen]').getBoundingClientRect();
            return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        });
        await page.mouse.click(exit.x, exit.y); await page.waitForFunction(() => !document.fullscreenElement);
        await app.evaluate(async () => await globalThis.__reviewLeave);
    }
    report.radarScales = await page.evaluate(() => [...document.querySelectorAll('article.radar')].map(article => {
        const button = article.querySelector('[data-action=radar-scale]'), video = article.querySelector('.pair');
        const size = () => { const rect = video.getBoundingClientRect(); return [rect.width, rect.height]; };
        const before = size(); button.click(); const enlarged = size(); button.click(); return { before, enlarged, restored: size() };
    }));
    for (const scale of report.radarScales) {
        assert.deepEqual(scale.before, [280, 110]); assert.deepEqual(scale.enlarged, [560, 220]); assert.deepEqual(scale.restored, [280, 110]);
    }
    await page.evaluate(() => scrollTo(0, 0)); await capture('paired-fullscreen-layout');
    await page.evaluate(() => {
        for (const article of document.querySelectorAll('article')) article.querySelector('[data-action=reference]').click();
        for (const details of document.querySelectorAll('details')) details.open = true;
        for (const image of document.querySelectorAll('.captures img')) image.loading = 'eager';
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.captures img')].every(image => image.complete && image.naturalWidth > 0));
    report.nativeCapturesLoaded = await page.evaluate(() => document.querySelectorAll('.captures img').length);
    assert.equal(report.nativeCapturesLoaded, nativeCaptures); await capture('source-reference-layout');
    report.radarScroll = await page.evaluate(() => {
        const radar = document.querySelector('article.radar:last-child');
        radar?.scrollIntoView({ block: 'center' });
        return { offset: scrollY, height: document.documentElement.scrollHeight, available: !!radar };
    });
    if (report.radarScroll.available) { assert(report.radarScroll.offset > 0); await capture('paired-radar-layout'); }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(740, 1000));
    report.narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert(!report.narrowOverflow); await capture('narrow-reference-layout');
    assert.deepEqual(report.errors, []); report.status = 'PASS_SYNCHRONIZED_REVIEW_PLAYBACK_FULLSCREEN_AND_DECLARED_REFERENCES';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
