// Validate the self-contained matched-motion review in isolated native Electron.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2]), review = path.resolve(process.argv[3]);
const metadata = JSON.parse(await fs.readFile(review.replace(/\.html$/, '.json')));
assert.equal(createHash('sha256').update(await fs.readFile(review)).digest('hex'), metadata.pageSha256);
await fs.mkdir(out, { recursive: false });
await fs.writeFile(path.join(out, 'main.mjs'), `
import { app, BrowserWindow } from 'electron';
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 1450, height: 1050,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await window.loadFile(${JSON.stringify(review)});
});`);
const report = { status: 'RUNNING', errors: [], requests: [], samples: [], reviewSha256: metadata.pageSha256,
    scope: 'Actual native decode of every matched review excerpt, original-size master PNGs, synchronized controls, common audio and responsive layout. This does not establish user complete-film acceptance.' };
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root,
        'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 60000 });
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => report.requests.push(request.url().slice(0, 100)));
    await page.waitForFunction(() => document.querySelector('#sample')?.options.length === 12);
    for (let index = 0; index < metadata.samples.length; index++) {
        await page.evaluate(index => {
            const select = document.querySelector('#sample');
            select.value = index; select.dispatchEvent(new Event('change'));
        }, index);
        await page.waitForFunction(() => [...document.querySelectorAll('video')]
            .every(video => video.readyState >= 2 && !video.error && !video.seeking
                && video.videoWidth > 0 && video.currentSrc === video.getAttribute('src'))
            && [...document.querySelectorAll('.native img')].every(image => image.complete && image.naturalWidth));
        const result = await page.evaluate(() => ({
            videos: [...document.querySelectorAll('video')].map(video => ({
                dimensions: [video.videoWidth, video.videoHeight], duration: video.duration,
            })),
            images: [...document.querySelectorAll('.native img')].map(image => ({
                dimensions: [image.naturalWidth, image.naturalHeight], displayedWidth: image.getBoundingClientRect().width,
            })),
        }));
        for (const video of result.videos) assert(Math.abs(video.duration - metadata.samples[index].frames / 15) < .01);
        assert.deepEqual(result.videos[0].dimensions, result.videos[1].dimensions);
        assert(result.images.every(image => image.displayedWidth === image.dimensions[0]));
        await page.locator('#play').click();
        await page.waitForFunction(() => [...document.querySelectorAll('video')].every(video => video.currentTime > .35));
        await page.evaluate(() => document.querySelector('#play').click());
        result.playback = await page.locator('video').evaluateAll(videos => videos.map(video => {
            const frame = new VideoFrame(video), color = frame.colorSpace.toJSON(); frame.close();
            return { time: video.currentTime, frames: video.getVideoPlaybackQuality().totalVideoFrames,
                dropped: video.getVideoPlaybackQuality().droppedVideoFrames, color };
        }));
        for (const video of result.playback) assert.deepEqual(video.color,
            { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
        assert(result.playback.every(video => video.frames >= 3));
        assert(Math.abs(result.playback[0].time - result.playback[1].time) < .15);
        report.samples.push(result);
    }
    await page.evaluate(() => { const select = document.querySelector('#sample'); select.value = 0; select.dispatchEvent(new Event('change')); });
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(video => video.readyState >= 2));
    await page.locator('#sound').check(); await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('audio').currentTime > .15);
    await page.evaluate(() => document.querySelector('#play').click());
    await page.locator('#fullscreen').click(); await page.waitForFunction(() => !!document.fullscreenElement);
    await page.evaluate(() => document.exitFullscreen()); await page.waitForFunction(() => !document.fullscreenElement);
    await page.screenshot({ path: path.join(out, 'wide.png') });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 1050));
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, 'narrow.png') });
    assert.deepEqual(report.errors, []);
    assert(report.requests.every(url => url.startsWith('file:') || url.startsWith('data:')));
    report.status = 'PASS_ALL_12_MATCHED_EXCERPTS_NATIVE_STILLS_AUDIO_FULLSCREEN_AND_LAYOUT';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
