// Independent complete-library codec/range probe; native story scenarios are separate.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerMovieResources } from '../../desktop/movie-profile.mjs';
import { registerHdMovieResources } from '../../desktop/hd-movie-profile.mjs';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const resourceRoot = path.resolve(process.argv[3] ?? path.join(root, '.local'));
const profile = await validateProfile(resourceRoot);
await registerMovieResources(profile, () => {}, path.join(resourceRoot, 'campaign'));
assert(await registerHdMovieResources(profile));
assert.equal(profile.hdMovies.accepted, 136); assert.deepEqual(profile.hdMovies.rejected, []);
const pointer = JSON.parse(await fs.readFile(path.join(resourceRoot, 'hd-movie-selection.json')));
const manifest = JSON.parse(await fs.readFile(path.join(resourceRoot, pointer.manifest)));
const catalog = profile.selections.get('/local-hd-movies/catalog.json').entries;
const inputs = catalog.map(entry => {
    const metadata = manifest.entries.find(row => row.edition === entry.edition && row.id === entry.id);
    return { ...entry, video: metadata.video };
});
await fs.mkdir(path.join(out, 'dist'), { recursive: true });
await fs.mkdir(path.join(out, 'profile'), { recursive: true });
await fs.writeFile(path.join(out, 'dist/index.html'), '<!doctype html><meta charset="utf-8"><title>HD movie library validation</title><video muted playsinline style="width:960px;height:720px;object-fit:contain"></video><script src="/library.js"></script>');
await fs.writeFile(path.join(out, 'dist/library.js'), `
const video=document.querySelector('video');
const wait=(test,ms=10000)=>new Promise((resolve,reject)=>{
const start=performance.now(),timer=setInterval(()=>{if(test()){clearInterval(timer);resolve();}
else if(performance.now()-start>ms){clearInterval(timer);reject(Error('Native library timeout'));}},10);});
window.probe=async entry=>{
const result={identity:entry.edition+':'+entry.id,samples:[]},started=performance.now();
const head=await fetch(entry.file.route,{method:'HEAD'});
if(!head.ok||head.headers.get('X-RA2-Movie-Sha256')!==entry.file.sha256)throw Error('Native streamed identity failed');
result.integrityMs=performance.now()-started;
video.src=entry.file.route;await wait(()=>video.readyState>=2||video.error);
if(video.error)throw Error(video.error.message);result.dimensions=[video.videoWidth,video.videoHeight];result.duration=video.duration;
let audioDecodedBytes=0;
for(const point of [0,Math.max(0,video.duration/2-.225),Math.max(0,video.duration-.45)]){
video.pause();if(Math.abs(video.currentTime-point)>.001){video.currentTime=point;await wait(()=>!video.seeking);}
const before=video.getVideoPlaybackQuality(),begin=performance.now(),times=[];
let callback=video.requestVideoFrameCallback(function frame(now,meta){times.push(meta.mediaTime);callback=video.requestVideoFrameCallback(frame);});
await video.play();await wait(()=>video.ended||video.currentTime>=Math.min(video.duration-.03,point+.40));
video.pause();video.cancelVideoFrameCallback(callback);const after=video.getVideoPlaybackQuality();
if(!result.colorSpace){const color=new VideoFrame(video);result.colorSpace=color.colorSpace.toJSON();color.close();}
audioDecodedBytes=Math.max(audioDecodedBytes,video.webkitAudioDecodedByteCount);
result.samples.push({sourceTime:point,mediaTime:video.currentTime,frameTimes:times,
elapsedMs:performance.now()-begin,decodedFrames:after.totalVideoFrames-before.totalVideoFrames,
droppedFrames:after.droppedVideoFrames-before.droppedVideoFrames});
}
result.audioDecodedBytes=audioDecodedBytes;result.elapsedMs=performance.now()-started;
video.pause();video.removeAttribute('src');video.load();await wait(()=>video.readyState===0);
result.released=video.getAttribute('src')===null;return result;
};`);
await fs.writeFile(path.join(out, 'main.mjs'), `
import{app,BrowserWindow,protocol,session}from'electron';
import path from'node:path';
import{validateProfile}from ${JSON.stringify(path.join(root, 'desktop/profile.mjs'))};
import{registerMovieResources}from ${JSON.stringify(path.join(root, 'desktop/movie-profile.mjs'))};
import{registerHdMovieResources}from ${JSON.stringify(path.join(root, 'desktop/hd-movie-profile.mjs'))};
import{createHandler}from ${JSON.stringify(path.join(root, 'desktop/protocol.mjs'))};
app.setPath('userData',${JSON.stringify(path.join(out, 'profile'))});app.enableSandbox();
protocol.registerSchemesAsPrivileged([{scheme:'ra2',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.whenReady().then(async()=>{
const root=${JSON.stringify(resourceRoot)},profile=await validateProfile(root);
await registerMovieResources(profile,()=>{},path.join(root,'campaign'));await registerHdMovieResources(profile);
session.defaultSession.protocol.handle('ra2',createHandler({appRoot:${JSON.stringify(out)},appFiles:new Set(['dist/index.html','dist/library.js']),getProfile:()=>profile,getError:()=>''}));
const window=new BrowserWindow({width:1050,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadURL('ra2://game/');});`);
const report = { status: 'RUNNING', scope: 'Independent native Electron library probe through actual validated registration, streamed integrity and bounded ranges. Every identity decodes at start, middle and end. Short observer seeks are not native mission triggers or a complete-film smoothness claim.',
    windows: 'NOT_RUN_ON_THIS_MAC', resourceRoot, revision: manifest.revision, clips: [], requests: [], errors: [] };
let app;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(out, 'main.mjs')], cwd: '/private/tmp', timeout: 60000 });
    const page = await app.firstWindow({ timeout: 60000 });
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('request', request => report.requests.push({ url: request.url(), range: request.headers().range }));
    await page.waitForFunction(() => !!window.probe);
    for (const entry of inputs) {
        const result = await page.evaluate(entry => window.probe(entry), entry);
        report.failedClip = result;
        assert.deepEqual(result.dimensions, [entry.video.width, entry.video.height]);
        assert(Math.abs(result.duration - entry.video.durationSeconds) < .1);
        assert.deepEqual(result.colorSpace, { fullRange: false, matrix: 'smpte170m', primaries: 'smpte170m', transfer: 'bt709' });
        assert(result.released && result.audioDecodedBytes > 0);
        assert(result.samples.every(row => row.frameTimes.length >= 2 && row.decodedFrames >= 2 && row.droppedFrames <= 1));
        report.clips.push(result); delete report.failedClip; await save();
        console.log(JSON.stringify({ identity: result.identity, completed: report.clips.length, total: inputs.length }));
    }
    assert.deepEqual(report.errors, []);
    assert(report.requests.every(request => request.url.startsWith('ra2://game/')));
    assert(report.requests.some(request => request.range?.startsWith('bytes=')));
    report.status = 'PASS_ALL_136_NATIVE_REGISTERED_MOVIES_START_MIDDLE_END_RANGES_AND_RELEASE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, clips: report.clips.length, error: report.error }));
