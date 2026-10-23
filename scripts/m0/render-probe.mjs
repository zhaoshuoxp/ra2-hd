import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs';
import { runAircraftScenario } from './aircraft-sequence.mjs';
import { runMcvProbe } from './mcv-sequence.mjs';
import { runMcvVplProbe } from './mcv-vpl-sequence.mjs';
const output = process.env.M01_OUTPUT ?? '.artifacts/rendering/current';
fs.mkdirSync(output, { recursive: true });
const browser = process.env.M01_BROWSER === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({
    executablePath: process.env.M01_BROWSER_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.M01_HEADED !== '1',
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
const result = { browser: { type: browser.browserType().name(), version: browser.version() },
    external: [], errors: [], console: [], phases: [] };
await context.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith('http://127.0.0.1:4000/') && !/^(blob|data):/.test(url)) {
        result.external.push(url); return route.abort();
    }
    return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => result.errors.push(error.stack));
page.on('console', message => result.console.push({ type: message.type(), text: message.text() }));
await context.addInitScript(aircraft => {
    for (const [key, value] of Object.entries({
        _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '0',
        _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0',
        _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: i, s: i, t: 1 })), null, null, null, null]),
    })) localStorage.setItem(key, value);
}, process.env.M01_SCENARIO === 'aircraft');
async function snapshot(name) {
    await page.screenshot({ path: `${output}/${name}.png` });
    return page.evaluate(() => {
        const d = window.__ra2debug, renderer = d.renderer.renderer, scene = d.worldScene;
        const mcv = d.localPlayer.getOwnedObjects().find(o => o.name === 'AMCV');
        const meshes = [];
        const renderable = mcv && d.renderableManager.getRenderableByGameObject(mcv);
        if (mcv) d.renderableManager.getRenderableByGameObject(mcv).get3DObject().traverse(o => {
            if (o.geometry) meshes.push({ type: o.type, name: o.name, visible: o.visible, vertices: o.geometry.attributes.position.count,
                indices: o.geometry.index?.count, attributes: Object.keys(o.geometry.attributes), castShadow: o.castShadow,
                material: o.material?.type, scale: o.scale.toArray(), matrixWorld: o.matrixWorld.toArray() });
        });
        const surface = d.mapRenderable.mapSurface.get3DObject();
        const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { tick: d.game.currentTick, speed: d.game.speed.value, mcvMeshes: meshes,
            model: renderable && { image: mcv.art.imageName, placeholder: !!renderable.placeholder,
                file: renderable.bodyVxlBuilder?.vxlFile?.filename,
                sections: renderable.bodyVxlBuilder?.vxlFile?.sections.map(s => ({name:s.name, size:[s.sizeX,s.sizeY,s.sizeZ],
                    bounds:[s.minBounds.toArray(),s.maxBounds.toArray()], voxels:s.spans.reduce((n,v)=>n+v.voxels.length,0)})) },
            gl: { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
            graphics: d.generalOptions.graphics.serialize(), shadow: { enabled: renderer.shadowMap.enabled,
                cast: scene.directionalLight.castShadow, size: scene.directionalLight.shadow.mapSize.toArray(),
                camera: scene.directionalLight.shadow.camera.toJSON(), projection:scene.directionalLight.shadow.camera.projectionMatrix.toArray(),
                actualSize: scene.directionalLight.shadow.map && [scene.directionalLight.shadow.map.width,scene.directionalLight.shadow.map.height], surfaceVisible: surface.visible,
                vertices: surface.geometry.attributes.position.count, material: surface.material.type },
            attempts: window.__offlineAttempts, failure: window.__m01Failure };
    });
}
async function measure(name, shadowQuality) {
    await page.evaluate(quality => { if (quality !== undefined) window.__ra2debug.generalOptions.graphics.shadows.value = quality; }, shadowQuality);
    await page.waitForTimeout(2000);
    const metrics = await page.evaluate(async () => {
        const d = window.__ra2debug, frame = [], render = [], update = [], simulation = [];
        const wrap = (obj, key, target) => {
            const original = obj[key];
            obj[key] = function (...args) { const start = performance.now(); try { return original.apply(this, args); } finally { target.push(performance.now() - start); } };
            return () => { obj[key] = original; };
        };
        const restore = [wrap(d.renderer, 'render', render), wrap(d.renderer, 'update', update), wrap(d.game, 'update', simulation)];
        const start = performance.now(), tick = d.game.currentTick;
        let last;
        await new Promise(resolve => {
            const sample = now => { if (last !== undefined) frame.push(now - last); last = now;
                if (now - start >= 20000) resolve(); else requestAnimationFrame(sample); };
            requestAnimationFrame(sample);
        });
        restore.forEach(fn => fn());
        const stats = values => {
            values.sort((a, b) => a - b);
            return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
                p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) };
        };
        return { durationMs: performance.now() - start, ticks: d.game.currentTick - tick,
            frame: stats(frame), render: stats(render), update: stats(update), simulation: stats(simulation) };
    });
    result.phases.push({ name, metrics, snapshot: await snapshot(name) });
    console.log(JSON.stringify({ name, metrics }));
}
try {
    await page.goto(`http://127.0.0.1:4000/${process.env.M01_STATS === '1' ? '?stats=1' : ''}`);
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 45000 });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    await page.waitForTimeout(3000);
    result.initial = await snapshot('initial');
    if(process.env.M01_STATS==='1')result.frameStats=await page.locator('#offline-frame-stats').textContent();
    const shadowPair = await page.evaluate(() => {
        const d=window.__ra2debug, light=d.worldScene.directionalLight, renderer=d.renderer.renderer;
        const enabled=light.castShadow;
        light.castShadow=false; d.renderer.render();const off=renderer.domElement.toDataURL();
        light.castShadow=true; d.renderer.render();const on=renderer.domElement.toDataURL();
        light.castShadow=enabled;
        return {off,on};
    });
    for(const [key,url] of Object.entries(shadowPair))fs.writeFileSync(`${output}/static-shadow-${key}.png`,Buffer.from(url.split(',')[1],'base64'));
    if (process.env.M01_SCENARIO === 'mcv-vpl') {
        result.mcvVpl = await runMcvVplProbe(page, output);
    } else if (process.env.M01_SCENARIO === 'mcv') {
        result.mcv = await runMcvProbe(page, output);
    } else if (process.env.M01_SCENARIO === 'aircraft') {
        result.aircraft = await runAircraftScenario(page, output);
    } else if(process.env.M01_SCENARIO !== 'shadows') {
    await measure('default');
    await measure('shadow-off', 0);
    await measure('shadow-low', 1);
    result.motion = await page.evaluate(async () => {
        const d=window.__ra2debug, unit=d.localPlayer.getOwnedObjects().find(o=>o.name==='MTNK');
        const r=d.renderableManager.getRenderableByGameObject(unit), queue=d.actionsApi.actionQueue;
        const push=queue.push.bind(queue), issued=performance.now(); let processed;
        queue.push=action=>{ const process=action.process.bind(action); action.process=()=>{processed=performance.now();return process();}; push(action); };
        d.actionsApi.orderUnits([unit.id],0,unit.tile.rx+8,unit.tile.ry+2);
        queue.push=push;
        const frames=[];
        await new Promise(resolve=>{ const sample=now=>{frames.push({ms:now-issued,tick:d.game.currentTick,
            moving:unit.isMoving,logical:unit.position.worldPosition.toArray(),visual:r.getPosition().toArray()});
            if(now-issued>5000)resolve();else requestAnimationFrame(sample);};requestAnimationFrame(sample); });
        return {issued,processed,actionQueueMs:processed-issued,frames};
    });
    }
    if (process.env.M01_MEASURE === '1') await measure('default');
} catch (error) {
    result.harnessError = error.stack;
    await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});
    result.failureState=await page.evaluate(()=>({air:window.__airTest,failure:window.__m01Failure,
        tick:window.__ra2debug?.game?.currentTick,status:window.__ra2debug?.game?.status})).catch(()=>null);
    throw error;
} finally {
    fs.writeFileSync(`${output}/probe.json`, JSON.stringify(result, null, 2));
    await browser.close();
}
