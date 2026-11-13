// Actual returned CUDA videos in the pinned Electron and real bounded range handler.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2]), inputs = JSON.parse(await fs.readFile(process.argv[3]));
await fs.mkdir(path.join(out, 'dist'), { recursive: true });
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
const entries = [];
for (const input of inputs) {
    const file = path.resolve(input.file), bytes = await fs.readFile(file);
    entries.push({ ...input, file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(path.join(out, 'dist/index.html'), '<!doctype html><meta charset="utf-8"><title>HD movie playback check</title><video muted playsinline style="width:960px;height:720px;object-fit:contain"></video><script src="/check.js"></script>');
await fs.writeFile(path.join(out, 'dist/check.js'), `
window.results=[];window.playProbe=async index=>{
const video=document.querySelector('video'), state={index,frameTimes:[],started:performance.now()};
video.onerror=()=>{state.error={code:video.error.code,message:video.error.message};};
video.requestVideoFrameCallback(function frame(now,meta){
state.frameTimes.push(meta.mediaTime);if(!state.colorSpace){const f=new VideoFrame(video);state.colorSpace=f.colorSpace.toJSON();f.close();}
if(!video.ended)state.callback=video.requestVideoFrameCallback(frame);
});
video.src='/local-hd-movies/cuda-validation/'+index+'.mp4';
const ended=new Promise(resolve=>video.onended=resolve);await video.play();
await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(Error('Native playback timed out')),30000))]);
const quality=video.getVideoPlaybackQuality();Object.assign(state,{totalFrames:quality.totalVideoFrames,droppedFrames:quality.droppedVideoFrames,
width:video.videoWidth,height:video.videoHeight,duration:video.duration,audioDecodedBytes:video.webkitAudioDecodedByteCount,elapsedMs:performance.now()-state.started});
video.cancelVideoFrameCallback(state.callback);video.pause();video.removeAttribute('src');video.load();state.released=video.getAttribute('src')===null;
window.results.push(state);return state;
};`);
await fs.writeFile(path.join(out, 'main.mjs'), `
import {app,BrowserWindow,protocol,session} from 'electron';
import {createHandler} from ${JSON.stringify(path.join(root, 'desktop/protocol.mjs'))};
app.setPath('userData',${JSON.stringify(path.join(out, 'profile'))});app.enableSandbox();
protocol.registerSchemesAsPrivileged([{scheme:'ra2',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.whenReady().then(async()=>{
const entries=${JSON.stringify(entries)}, routes=new Map(), movieIntegrity=new Map();
entries.forEach((entry,index)=>{const route='/local-hd-movies/cuda-validation/'+index+'.mp4';routes.set(route,entry.file);movieIntegrity.set(route,entry);});
const profile={root:${JSON.stringify(root)},routes,movieIntegrity};
session.defaultSession.protocol.handle('ra2',createHandler({appRoot:${JSON.stringify(out)},appFiles:new Set(['dist/index.html','dist/check.js']),getProfile:()=>profile,getError:()=>''}));
const window=new BrowserWindow({width:1000,height:820,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadURL('ra2://game/');});`);
const report = { status: 'RUNNING', scope: 'Returned CUDA H264 videos in native Electron through the actual range/integrity handler. Independent codec/release probe; story and full-film acceptance remain separate.', clips: [], requests: [], responses: [], errors: [] };
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 45000 });
    const page = await app.firstWindow({ timeout: 30000 });
    page.on('request', r => report.requests.push({ url: r.url(), range: r.headers().range }));
    page.on('response', r => report.responses.push({ url: r.url(), status: r.status(), contentType: r.headers()['content-type'] }));
    page.on('pageerror', e => report.errors.push(e.stack));
    await page.waitForFunction(() => !!window.playProbe);
    for (const [index, input] of entries.entries()) {
        const result = await page.evaluate(index => window.playProbe(index), index);
        assert.equal(result.totalFrames, input.frames); assert(result.droppedFrames <= 1);
        assert.deepEqual([result.width, result.height], [input.width, input.height]);
        assert.deepEqual(result.colorSpace, { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
        assert(result.released); assert(!result.error);
        if (input.audio) assert(result.audioDecodedBytes > 0);
        report.clips.push({ ...input, ...result });
    }
    assert.deepEqual(report.errors, []);
    assert(report.requests.every(r => r.url.startsWith('ra2://game/')));
    assert(report.requests.some(r => r.range?.startsWith('bytes=')));
    report.status = 'PASS_NATIVE_CUDA_H264_COLOR_RANGES_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
} finally {
    await app?.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, clips: report.clips.length, error: report.error }));
