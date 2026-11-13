import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), file = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const record = JSON.parse(await fs.readFile(file.replace(/\.html$/, '.json')));
await fs.mkdir(out, { recursive: false });
await fs.mkdir(path.join(out, 'profile'));
await fs.writeFile(path.join(out, 'main.mjs'), `import { app, BrowserWindow } from 'electron';
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
app.whenReady().then(async()=>{const window = new BrowserWindow({width:1280,height:960,webPreferences:{sandbox:true,contextIsolation:true}});
globalThis.reviewFullscreen={entered:0,left:0};
window.on('enter-html-full-screen',()=>globalThis.reviewFullscreen.entered++);
window.on('leave-html-full-screen',()=>globalThis.reviewFullscreen.left++);
await window.loadFile(${JSON.stringify(file)});});`);
const report = { status: 'RUNNING', errors: [], clips: [], pageSha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    scope: 'Actual complete embedded review: eight source-derived excerpts, original sound, native CSS dimensions, native fullscreen, decoded color, image and layout. Excerpt checks remain separate from complete-film native gameplay.' };
assert.equal(report.pageSha256, record.sha256);
let app, page;
async function htmlFullscreenEvent(key, after) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const state = await app.evaluate(({ BrowserWindow }) => ({ ...globalThis.reviewFullscreen,
            enabled: BrowserWindow.getAllWindows()[0].isFullScreen() }));
        if (state[key] > after) return state;
        await page.waitForTimeout(50);
    }
    throw Error('Electron HTML fullscreen transition did not finish: ' + key);
}
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp',
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))) });
    page = await app.firstWindow({ timeout: 90000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    for (let index = 0; index < record.clips.length; index++) {
        const expected = record.clips[index];
        await page.locator('#clip').selectOption(String(index));
        await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
        await page.locator('#play').click();
        await page.waitForFunction(() => document.querySelector('video').currentTime > .5);
        await page.locator('#play').click();
        const result = await page.locator('video').evaluate(video => {
            const frame = new VideoFrame(video), color = frame.colorSpace.toJSON(); frame.close();
            return { width: video.videoWidth, height: video.videoHeight, duration: video.duration,
                audioDecodedBytes: video.webkitAudioDecodedByteCount, color, quality: video.getVideoPlaybackQuality() };
        });
        assert.deepEqual([result.width, result.height], [expected.width, expected.height]);
        assert(Math.abs(result.duration - 3) < .1 && result.audioDecodedBytes > 0);
        assert.equal(result.color.matrix, 'smpte170m'); assert.equal(result.color.transfer, 'bt709');
        await page.locator('#native').click();
        const width = await page.locator('video').evaluate(video => video.getBoundingClientRect().width);
        assert(Math.abs(width - expected.width) < 1);
        await page.locator('#native').click();
        if (index === 0 || index === record.clips.length - 1) {
            const before = await app.evaluate(() => ({ ...globalThis.reviewFullscreen }));
            await page.locator('#fullscreen').click();
            await page.waitForFunction(() => document.fullscreenElement?.tagName === 'VIDEO');
            result.fullscreenEntered = await htmlFullscreenEvent('entered', before.entered);
            await page.evaluate(() => document.exitFullscreen());
            await page.waitForFunction(() => document.fullscreenElement === null);
            result.fullscreenLeft = await htmlFullscreenEvent('left', before.left);
            result.fullscreenExitMethod = 'document.exitFullscreen';
        }
        report.clips.push({ identity: expected.identity, label: expected.label, ...result });
    }
    assert.equal(await page.locator('tbody tr').count(), 136);
    assert(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 1000));
    await app.browserWindow(page).then(window => window.evaluate(window => window.setSize(900, 760)));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    report.layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(report.layout.scrollWidth <= report.layout.width + 1);
    await page.screenshot({ path: path.join(out, 'review.png') });
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_EIGHT_DOWNLOADED_REVIEW_CLIPS_NATIVE_AUDIO_COLOR_FULLSCREEN_DIMENSIONS_AND_LAYOUT';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await app?.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ status: report.status, error: report.error }));
