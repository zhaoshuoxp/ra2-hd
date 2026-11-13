import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]), review = path.resolve(process.argv[3]);
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
const metadata = JSON.parse(await fs.readFile(review.replace(/\.html$/, '.json')));
assert.equal(createHash('sha256').update(await fs.readFile(review)).digest('hex'), metadata.sha256);
await fs.writeFile(path.join(out, 'main.mjs'), `
import{app,BrowserWindow}from'electron';
app.setPath('userData',${JSON.stringify(path.join(out, 'profile'))});
app.whenReady().then(async()=>{const window=new BrowserWindow({width:1360,height:1000,
webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
await window.loadFile(${JSON.stringify(review)});});`);
const report = { status: 'RUNNING', review, reviewSha256: metadata.sha256, errors: [], pairs: [], fullscreen: [], requests: [],
    scope: 'Self-contained final review decode, synchronized controls, full-screen presentation, native capture loading and wide/narrow layouts. User complete-film acceptance remains separate.' };
let app, page;
const capture = async name => fs.writeFile(path.join(out, name + '.png'), Buffer.from(await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')), 'base64'));
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 60000 });
    page = await app.firstWindow({ timeout: 60000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => report.requests.push(request.url().slice(0, 120)));
    await page.waitForFunction(() => !!window.movieReview && document.querySelectorAll('article').length === window.movieReview.rows.length);
    report.contents = await page.evaluate(() => {
        for (const image of document.querySelectorAll('#captures img')) image.loading = 'eager';
        return { title: document.title, excerpts: window.movieReview.rows.length, captures: window.movieReview.captures.length,
            allMediaEmbedded: window.movieReview.rows.every(row => row.original.startsWith('data:video/mp4;base64,') && row.final.startsWith('data:video/mp4;base64,'))
                && window.movieReview.captures.every(row => row.image.startsWith('data:image/png;base64,')),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(report.contents.allMediaEmbedded && !report.contents.horizontalOverflow);
    assert.equal(report.contents.excerpts, metadata.excerpts.length);
    await page.waitForFunction(() => [...document.querySelectorAll('#captures img')].every(image => image.complete && image.naturalWidth > 0));
    for (let index = 0; index < report.contents.excerpts; index++) {
        const article = page.locator('article').nth(index); await article.scrollIntoViewIfNeeded();
        await article.getByRole('button', { name: 'Play together', exact: true }).click();
        await page.waitForFunction(index => [...document.querySelectorAll('article')[index].querySelectorAll('video')]
            .every(video => video.currentTime > .7 && video.readyState >= 2), index, { timeout: 20000 });
        await article.getByRole('button', { name: 'Pause', exact: true }).click();
        const pair = await page.evaluate(index => {
            const article = document.querySelectorAll('article')[index];
            return { identity: article.dataset.identity, videos: [...article.querySelectorAll('video')].map(video => {
                const frame = new VideoFrame(video), color = frame.colorSpace.toJSON(); frame.close();
                const quality = video.getVideoPlaybackQuality();
                return { time: video.currentTime, duration: video.duration, dimensions: [video.videoWidth, video.videoHeight], muted: video.muted,
                    colorSpace: color, decodedFrames: quality.totalVideoFrames, droppedFrames: quality.droppedVideoFrames, error: video.error?.message ?? null };
            }) };
        }, index);
        assert.deepEqual(pair.videos[0].dimensions, metadata.excerpts[index].originalSize);
        assert.deepEqual(pair.videos[1].dimensions, metadata.excerpts[index].finalSize);
        assert(Math.abs(pair.videos[0].time - pair.videos[1].time) < .15);
        assert.equal(pair.videos[0].muted, false); assert.equal(pair.videos[1].muted, true);
        for (const video of pair.videos) {
            assert(!video.error && video.decodedFrames > 2 && Math.abs(video.duration - metadata.excerpts[index].seconds) < .1);
            assert.deepEqual(video.colorSpace, { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
        }
        report.pairs.push(pair);
    }
    for (const index of [0, 3]) {
        const article = page.locator('article').nth(index); await article.scrollIntoViewIfNeeded();
        await article.getByRole('button', { name: 'Full screen final', exact: true }).click();
        await page.waitForFunction(() => document.fullscreenElement?.tagName === 'VIDEO');
        const state = await page.evaluate(() => {
            const video = document.fullscreenElement, bounds = video.getBoundingClientRect();
            return { bounds: [bounds.width, bounds.height], viewport: [innerWidth, innerHeight], fit: getComputedStyle(video).objectFit };
        });
        assert.deepEqual(state.bounds, state.viewport); assert.equal(state.fit, 'contain'); report.fullscreen.push(state);
        await capture('fullscreen-' + index); await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement);
    }
    await page.evaluate(() => scrollTo(0, 0)); await capture('wide-review');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 1000));
    await page.waitForTimeout(400);
    report.narrow = await page.evaluate(() => ({ viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth }));
    assert(!report.narrow.overflow); await capture('narrow-review');
    assert.deepEqual(report.errors, []);
    assert(report.requests.every(url => url.startsWith('file:') || url.startsWith('data:')));
    report.status = 'PASS_SELF_CONTAINED_FINAL_REVIEW_MEDIA_CONTROLS_NATIVE_CAPTURES_AND_LAYOUTS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
