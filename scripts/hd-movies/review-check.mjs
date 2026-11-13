import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]), review = path.resolve(process.argv[3]);
const samples = process.argv.includes('--samples');
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
await fs.writeFile(path.join(out, 'main.mjs'), `
import { app, BrowserWindow } from 'electron';
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
let window;
app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1280, height: 960, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadFile(${JSON.stringify(review)});
});
`);
let app, page;
const report = { status: 'RUNNING', errors: [], review, scope: samples
    ? 'Local temporal short-sample review; user visual acceptance and complete-movie production remain pending.'
    : 'Source-only local HTML review; no HD candidate or actual-game radar visual acceptance.' };
async function capture(name) {
    const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
    await fs.writeFile(path.join(out, name + '.png'), Buffer.from(bytes, 'base64'));
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 45000 });
    page = await app.firstWindow({ timeout: 30000 }); page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForFunction(samples => document.querySelectorAll('article').length === 5
        && [...document.querySelectorAll('video')].every((video, index) => video.readyState >= 2
            && !video.seeking && video.currentTime >= (samples ? 0 : [35, 25, 25, 0, 0][index])), samples, { timeout: 30000 });
    report.contents = await page.evaluate(() => ({ title: document.title, status: document.querySelector('#status').textContent,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        videos: [...document.querySelectorAll('video')].map(video => ({ url: video.currentSrc, duration: video.duration,
            time: video.currentTime, width: video.videoWidth, height: video.videoHeight, error: video.error?.message ?? null,
            colorSpace: (() => { const frame = new VideoFrame(video); const space = frame.colorSpace.toJSON(); frame.close(); return space; })() })) }));
    assert(report.contents.status.startsWith(samples ? 'LOCAL TEMPORAL' : 'SOURCE FOOTAGE ONLY'));
    assert(!report.contents.horizontalOverflow); assert.equal(report.contents.videos.length, samples ? 10 : 5);
    assert(report.contents.videos.every(video => !video.error && video.time >= 0));
    if (samples) for (const video of report.contents.videos) {
        assert.deepEqual(video.colorSpace, { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
    }
    if (samples) {
        report.pairedPlayback = [];
        for (let index = 0; index < 5; index++) {
            await page.evaluate(index => document.querySelectorAll('article')[index].querySelector('.tools button').click(), index);
            await page.waitForFunction(index => [...document.querySelectorAll('article')[index].querySelectorAll('video')]
                .every(video => video.currentTime > .5), index, { timeout: 15000 });
            const playback = await page.evaluate(index => {
                const videos = [...document.querySelectorAll('article')[index].querySelectorAll('video')];
                videos.forEach(video => video.pause());
                return videos.map(video => {
                    const quality = video.getVideoPlaybackQuality();
                    return { time: video.currentTime, muted: video.muted,
                        quality: { totalFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames } };
                });
            }, index);
            assert(Math.abs(playback[0].time - playback[1].time) < 1 / 15);
            assert.equal(playback[0].muted, false); assert.equal(playback[1].muted, true);
            report.pairedPlayback.push(playback);
        }
        report.fullscreen = [];
        for (const index of [0, 4]) {
            const point = await page.evaluate(index => {
                const button = document.querySelectorAll('article')[index].querySelectorAll('.tools button')[3];
                button.scrollIntoView({ block: 'center' });
                const rect = button.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }, index);
            await page.mouse.click(point.x, point.y);
            await page.waitForFunction(() => document.fullscreenElement?.tagName === 'VIDEO');
            const fullscreen = await page.evaluate(() => {
                const video = document.fullscreenElement, bounds = video.getBoundingClientRect();
                return { width: bounds.width, height: bounds.height, viewport: [innerWidth, innerHeight], fit: getComputedStyle(video).objectFit };
            });
            assert.equal(fullscreen.fit, 'contain'); assert.equal(fullscreen.width, fullscreen.viewport[0]);
            assert.equal(fullscreen.height, fullscreen.viewport[1]); report.fullscreen.push(fullscreen);
            await capture('review-fullscreen-' + index);
            await page.evaluate(() => document.exitFullscreen());
            await page.waitForFunction(() => !document.fullscreenElement);
        }
        await page.evaluate(() => {
            for (const detail of document.querySelectorAll('details')) detail.open = true;
            for (const image of document.querySelectorAll('.native img')) image.loading = 'eager';
            scrollTo(0, 0);
        });
        await page.waitForFunction(() => [...document.querySelectorAll('.native img')].every(image => image.complete && image.naturalWidth > 0));
        report.nativeCapturesLoaded = await page.evaluate(() => document.querySelectorAll('.native img').length);
        assert.equal(report.nativeCapturesLoaded, 10);
    }
    await capture('review-fullscreen-layout');
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await capture('review-radar-layout');
    const viewport = await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(760, 960); return window.getSize(); });
    report.narrowViewport = { size: viewport, horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
    assert(!report.narrowViewport.horizontalOverflow); await capture('review-narrow-layout');
    assert.deepEqual(report.errors, []); report.status = samples
        ? 'PASS_LOCAL_TEMPORAL_REVIEW_FIVE_PAIRED_SHORT_SAMPLES_AND_LAYOUTS'
        : 'PASS_LOCAL_SOURCE_REVIEW_FIVE_PLAYABLE_ORIGINALS_AND_LAYOUTS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
