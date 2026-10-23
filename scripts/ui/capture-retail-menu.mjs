import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const source = path.resolve('.local/ui-packs/yuri-emblem-ui-v1/menu-original.webm');
const bytes = await fs.readFile(source);
const app = await electron.launch({ args: [path.resolve('scripts/ui/feedback-art-shell.mjs')], timeout: 60000 });
const report = { status: 'RUNNING', source, sha256: createHash('sha256').update(bytes).digest('hex'), frames: [] };
try {
    const page = await app.firstWindow();
    const metadata = await page.evaluate(async data => {
        const video = document.createElement('video');
        video.muted = true; video.playsInline = true;
        video.src = 'data:video/webm;base64,' + data;
        document.body.style.cssText = 'margin:0;background:black;display:grid;place-items:center';
        document.body.append(video);
        await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.style.cssText = 'position:absolute;inset:0;opacity:0'; document.body.append(canvas);
        const context = canvas.getContext('2d');
        const stream = canvas.captureStream(30);
        const chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6000000 });
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        const draw = () => { context.drawImage(video, 0, 0); video.requestVideoFrameCallback(draw); };
        window.__retailMenuCapture = { video, canvas, stream, recorder, chunks };
        video.requestVideoFrameCallback(draw); recorder.start(1000); await video.play();
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    }, bytes.toString('base64'));
    Object.assign(report, metadata);
    console.log(JSON.stringify(metadata));
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const duration = Math.min(metadata.duration, 90), start = Date.now();
    for (let second = 0; second < duration; second += 1) {
        await page.waitForTimeout(Math.max(0, start + second * 1000 - Date.now()));
        const frame = await page.evaluate(() => {
            const { video, canvas } = window.__retailMenuCapture;
            canvas.getContext('2d').drawImage(video, 0, 0);
            return { time: video.currentTime, png: canvas.toDataURL('image/png').split(',')[1] };
        });
        const file = `frame-${String(second).padStart(3, '0')}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(frame.png, 'base64'));
        report.frames.push({ file, time: frame.time });
    }
    await page.waitForTimeout(Math.max(0, start + duration * 1000 - Date.now()));
    const capture = await page.evaluate(async () => {
        const { video, recorder, stream, chunks } = window.__retailMenuCapture;
        await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
        stream.getTracks().forEach(track => track.stop()); video.pause();
        const data = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
        let result = '';
        for (let i = 0; i < data.length; i += 32768) result += String.fromCharCode(...data.subarray(i, i + 32768));
        return btoa(result);
    });
    await fs.writeFile(path.join(out, 'original-menu-native-capture.webm'), Buffer.from(capture, 'base64'));
    report.recordedSeconds = duration;
    report.status = duration >= metadata.duration ? 'PASS_COMPLETE_ORIGINAL_MENU_LOOP_CAPTURED' : 'PASS_BOUNDED_ORIGINAL_MENU_CAPTURE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1;
} finally {
    await app.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(report.status);
