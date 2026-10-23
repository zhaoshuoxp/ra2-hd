import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
const s = await startSession(process.argv[2], process.argv[3]);
let failure;
try {
    s.report.fixture = await s.page.evaluate(expanded => {
        const d = window.__ra2debug, f = window.__allied;
        const names = ['MTNK', 'HTNK', 'HARV', 'SMCV', 'HTK', 'APOC', 'TTNK', 'DTRUCK'];
        for (let i = 0; i < 64; i++) f.spawn(names[i % names.length], 7,
            { rx: f.center.rx + i % 8, ry: f.center.ry + Math.floor(i / 8) });
        const buildings = ['GAAIRC', 'GAWEAP', 'GAPILE', 'GAREFN', 'NAWEAP', 'NAHAND', 'NAREFN', 'NAPOWR'];
        if (expanded) buildings.push('NAYARD', 'NACNST', 'NAIRON', 'NALASR', 'NAFLAK', 'TESLA', 'NAINDP', 'NABNKR',
            'GAGAP', 'GAWALL', 'GAPILL', 'GASPYSAT', 'ATESLA', 'GADEPT', 'GAOREP', 'GAWEAT', 'GAROBO', 'NASAM');
        for (const name of buildings)
            f.building(name, { rx: f.center.rx + (expanded ? 25 : 10), ry: f.center.ry + (expanded ? 25 : 10) });
        if (expanded) for (const name of ['SPY', 'ADOG', 'SHK', 'IVAN', 'DESO', 'FLAKT', 'DOG', 'SENGINEER']) f.spawn(name, 3);
        d.worldInteraction.minimapHandler.panToTile({rx:f.center.rx+4,ry:f.center.ry+4});
        return { units: expanded ? 72 : 64, buildings: buildings.length, cameraUnchanged: true, expanded };
    }, process.argv.includes('--expanded'));
    await s.page.waitForTimeout(6000);
    await s.page.waitForFunction(() => {
        const d = window.__ra2debug;
        return Object.values(window.__allied.actors).filter(u => ['HARV', 'SMCV', 'HTK', 'APOC', 'TTNK', 'DTRUCK'].includes(u.name))
            .every(u => d.renderableManager.getRenderableByGameObject(u)?.unitVxlHd?.active);
    }, undefined, { timeout: 60000 });
    await s.stage('mixed-pressure-scene');
    s.report.gpu = await s.page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
            vendor: info && gl.getParameter(info.UNMASKED_VENDOR_WEBGL), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
            timerQueries: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
            contextLost: gl.isContextLost() };
    });
    await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    s.report.measurements = [];
    for (const extraMiB of [0, 256, 512, 0]) {
        s.report.measurements.push(await s.page.evaluate(async extraMiB => {
            const d = window.__ra2debug, renderer = d.renderer.renderer, gl = renderer.getContext();
            for (const texture of window.__pressureTextures ?? []) gl.deleteTexture(texture);
            const textures = window.__pressureTextures = [];
            // Diagnostic storage only: no candidate art or runtime budget is promoted.
            const pixels = new Uint8Array(2048 * 2048 * 4);
            for (let i = 0; i < pixels.length; i += 4) { pixels[i] = i % 251; pixels[i+3] = 255; }
            const allocationStart = performance.now();
            for (let i = 0; i < extraMiB / 16; i++) {
                const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 2048, 2048, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            }
            gl.finish(); renderer.resetState();
            const allocationMs = performance.now() - allocationStart;
            const samples = [], started = performance.now();
            for (let i = 0; i < 75 && performance.now() - started < 12000; i++) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const start = performance.now(); d.renderer.render(); gl.finish();
                if (i >= 5) samples.push(performance.now() - start);
            }
            samples.sort((a,b)=>a-b);
            return { extraMiB, allocationMs, samples: samples.length, synchronizedRenderMedianMs: samples[Math.floor(samples.length*.5)],
                synchronizedRenderP95Ms: samples[Math.floor(samples.length*.95)], elapsedMs:performance.now()-started,
                drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,
                glError:gl.getError(),contextLost:gl.isContextLost(),disclosure:'Paused same-scene render plus GPU completion; not GPU-only time or live gameplay FPS. Extra storage is a residency probe, not a 4x artwork benchmark.' };
        }, extraMiB));
    }
    s.report.sovietShadowMasks = await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return Object.values(f.actors).filter(u=>['HARV','SMCV','HTK','APOC','TTNK','DTRUCK'].includes(u.name)).map(u=>{
            const r=d.renderableManager.getRenderableByGameObject(u), h=r.unitVxlHd;
            if (!h?.active) return {name:u.name,active:false};
            h.update(); return {name:u.name,active:true,masks:h.shadowOccluders.map(m=>m.visible)};
        });
    });
    s.report.demand = await s.page.evaluate(() => window.__ra2debug.sovietUnitsHd.families);
    s.report.eager = await s.page.evaluate(() => Object.fromEntries(Object.entries(window.__ra2debug.worldView.sovietBuildingsHd)
        .map(([name, family]) => [name, family.report])));
    for (const [name, r] of Object.entries(s.report.demand)) assert(!/FAIL|FALLBACK/.test(r.status), name + ': ' + JSON.stringify(r));
    if (process.argv.includes('--expanded')) {
        for (const name of ['SPY', 'ADOG', 'GAAIRC', 'NASAM']) assert.equal(s.report.demand[name].density, 4, name);
        assert.equal(s.report.eager.NAYARD.density, 4);
    }
    assert(s.report.measurements.every(m => !m.glError && !m.contextLost));
    assert(s.report.sovietShadowMasks.every(m => m.active && m.masks.every(v => v === false)));
    s.report.preflightOnly = !process.argv.includes('--expanded');
    s.report.densityCandidatePressurePassed = process.argv.includes('--expanded');
} catch (e) { failure=e; console.error(e); }
await s.close(failure);
if (failure) process.exitCode=1;
