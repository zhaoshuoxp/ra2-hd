// Synthetic signal only: this validates Electron codecs/streaming, never HD artwork quality.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
await fs.mkdir(path.join(out, 'dist'), { recursive: true });
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
const converter = process.env.RA2_CAMPAIGN_FFMPEG ?? execFileSync(path.join(root, '.local/tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const file = path.join(out, 'codec.mp4');
execFileSync(converter, ['-nostdin', '-n', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x960:rate=15:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-crf', '18',
    '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', file]);
const bytes = await fs.readFile(file), sha256 = createHash('sha256').update(bytes).digest('hex');
const protocolModule = path.join(root, 'desktop/protocol.mjs');
await fs.writeFile(path.join(out, 'dist/index.html'), '<!doctype html><meta charset="utf-8"><title>Synthetic codec test</title><button>Play synthetic signal</button><video playsinline style="width:960px;height:720px;object-fit:contain"></video><script src="/codec.js"></script>');
await fs.writeFile(path.join(out, 'dist/codec.js'), `
const video = document.querySelector('video');
window.codec = { synthetic: true, errors: [], frames: [] };
video.onerror = () => window.codec.errors.push({ code: video.error.code, message: video.error.message });
document.querySelector('button').onclick = () => {
    window.codec.requestedAt = performance.now();
    video.requestVideoFrameCallback(function frame(now, metadata) {
        window.codec.frames.push({ elapsedMs: now - window.codec.requestedAt, mediaTime: metadata.mediaTime });
        if (!video.ended) video.requestVideoFrameCallback(frame);
    });
    video.src = '/local-hd-movies/codec-fixture/codec.mp4';
    video.play().catch(error => window.codec.errors.push({ message: error.message }));
};
video.onended = () => {
    const quality = video.getVideoPlaybackQuality();
    Object.assign(window.codec, { ended: true, time: video.currentTime, duration: video.duration,
        dimensions: [video.videoWidth, video.videoHeight], totalFrames: quality.totalVideoFrames,
        droppedFrames: quality.droppedVideoFrames, audioDecodedBytes: video.webkitAudioDecodedByteCount,
        firstFrameMs: window.codec.frames[0]?.elapsedMs });
    video.pause(); video.removeAttribute('src'); video.load();
};
`);
await fs.writeFile(path.join(out, 'main.mjs'), `
import { app, BrowserWindow, protocol, session } from 'electron';
import { createHandler } from ${JSON.stringify(protocolModule)};
app.setPath('userData', ${JSON.stringify(path.join(out, 'profile'))});
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{ scheme: 'ra2', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window;
app.whenReady().then(async () => {
const profile = { root: ${JSON.stringify(out)}, routes: new Map([['/local-hd-movies/codec-fixture/codec.mp4', ${JSON.stringify(file)}]]),
    movieIntegrity: new Map([['/local-hd-movies/codec-fixture/codec.mp4', { file: ${JSON.stringify(file)}, bytes: ${bytes.length}, sha256: ${JSON.stringify(sha256)} }]]) };
session.defaultSession.protocol.handle('ra2', createHandler({ appRoot: ${JSON.stringify(out)},
    appFiles: new Set(['dist/index.html', 'dist/codec.js']), getProfile: () => profile, getError: () => '' }));
window = new BrowserWindow({ width: 1100, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
await window.loadURL('ra2://game/');
});
`);
let app, page;
const report = { status: 'RUNNING', scope: 'Synthetic H264 High Level4/AAC-LC MP4 signal in the pinned native Electron using the actual local range handler. No game image or HD acceptance claim.',
    file: { bytes: bytes.length, sha256 }, platform: process.platform, windows: 'NOT_RUN_ON_THIS_MAC', requests: [], errors: [] };
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 45000 });
    app.process().stderr.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow({ timeout: 30000 });
    page.on('request', request => report.requests.push({ url: request.url(), method: request.method(), range: request.headers().range }));
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.waitForFunction(() => !!window.codec);
    report.initialDocument = await page.evaluate(() => ({ url: location.href, body: document.body.innerHTML,
        button: document.querySelector('button').getBoundingClientRect().toJSON(), visibility: document.visibilityState }));
    console.log(JSON.stringify(report.initialDocument));
    const button = report.initialDocument.button;
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await page.waitForFunction(() => window.codec.ended || window.codec.errors.length, undefined, { timeout: 30000 });
    report.playback = await page.evaluate(() => window.codec);
    report.electron = await app.evaluate(() => process.versions.electron);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.playback.errors, []); assert(report.playback.ended);
    assert.deepEqual(report.playback.dimensions, [1280, 960]); assert.equal(report.playback.totalFrames, 30);
    assert(report.playback.frames.length >= 25); assert(report.playback.droppedFrames <= 1);
    assert(report.requests.every(request => request.url.startsWith('ra2://game/')));
    assert(report.requests.some(request => request.range?.startsWith('bytes=')));
    report.release = await page.evaluate(() => { const video = document.querySelector('video'); return { source: video.getAttribute('src'), readyState: video.readyState }; });
    assert.equal(report.release.source, null); assert.equal(report.release.readyState, 0);
    report.status = 'PASS_NATIVE_H264_AAC_MP4_RANGES_AND_DECODER_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    report.document = await page?.evaluate(() => ({ url: location.href, body: document.body.innerHTML })).catch(() => undefined);
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
}
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
