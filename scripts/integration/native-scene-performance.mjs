import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [receiptFile, output, preferencesFile] = process.argv.slice(2);
const artifact = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out, { recursive: false }); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: artifact.resources }));
const preferences = JSON.parse(await fs.readFile(preferencesFile, 'utf8'));
const app = await electron.launch({
    executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
        : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp', timeout: 60000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1',
        RA2_UI_RESOURCE_ROOT: artifact.uiResources },
});
const report = { status: 'RUNNING', artifact, preferences, platform: process.platform, errors: [], consoleErrors: [], measurements: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 1067, deviceScaleFactor: 1.5, mobile: false });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(preferences => {
        Object.entries(preferences).forEach(([key, value]) => localStorage.setItem(key, value));
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.renderResolution.value = 'native'; graphics.hdEnabled.value = true;
        graphics.hdDensity.value = 4; graphics.shadows.value = 3;
    }, preferences);
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.waitForTimeout(8000);
    report.scenario = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { players: d.game.getCombatants().length, bots: d.game.botManager.bots.size,
            tick: d.game.currentTick, visibility: document.visibilityState, output: d.renderer.outputMetrics };
    });
    assert.equal(report.scenario.players, 8); assert.equal(report.scenario.bots, 7);
    const setup = await page.evaluate(() => {
        const d = window.__ra2debug;
        const renderables = d.renderableManager.getRenderableContainer().getChildren();
        const frame = renderables.flatMap(r => r.unitVxlHd?.layers.flatMap(layer => layer.frames) ?? [])[0];
        if (!frame?.parent) throw Error('Candidate cached heading ownership is unavailable');
        let frames = [];
        const parents = new Map();
        const trackFrames = () => {
            frames = d.renderableManager.getRenderableContainer().getChildren()
                .flatMap(r => r.unitVxlHd?.layers.flatMap(layer => layer.frames) ?? []);
            for (const frame of frames) {
                const parent = frame.parent;
                if (parents.has(parent)) continue;
                const remove = parent.remove; parents.set(parent, remove);
                parent.remove = function (...objects) {
                    // Retain the old cache without reorder overhead. Native
                    // disposal continues normally outside frozen controls.
                    if (window.__keepCachedAttached && objects.every(object => object.name.startsWith('unit-vxl-hd-'))) return this;
                    return remove.apply(this, objects);
                };
            }
        };
        trackFrames();
        window.__panBase = d.worldScene.cameraPan.getPan();
        window.__savedTick = d.gameScreen.gameAnimationLoop.tickGame;
        window.__sampleScene = async ({ label, automatic, attached, frozen, duration = 8000 }) => {
            window.__keepCachedAttached = attached;
            d.renderer.getScenes().forEach(s => s.scene.matrixWorldAutoUpdate = automatic);
            d.gameScreen.gameAnimationLoop.tickGame = frozen ? () => true : window.__savedTick;
            trackFrames();
            if (attached) for (const frame of frames) for (const mesh of [frame.batch, frame.depth, frame.translucent])
                if (mesh.parent !== frame.parent) frame.parent.add(mesh);
            await new Promise(resolve => setTimeout(resolve, 2000));
            const renderer = d.renderer, glRenderer = renderer.renderer;
            const originalUpdate = renderer.update, originalRender = renderer.render;
            const autoReset = glRenderer.info.autoReset; glRenderer.info.autoReset = false;
            const samples = { frames: [], update: [], render: [], drawCalls: [], triangles: [] };
            let matrixUpdates = 0;
            const matrixMethods = d.renderer.getScenes().map(s => [s.scene, s.scene.updateMatrixWorld]);
            for (const [scene, update] of matrixMethods) scene.updateMatrixWorld = function (...args) {
                matrixUpdates++; return update.apply(this, args);
            };
            renderer.update = function (...args) {
                const at = performance.now(); try { return originalUpdate.apply(this, args); }
                finally { samples.update.push(performance.now() - at); }
            };
            renderer.render = function (...args) {
                glRenderer.info.reset(); const at = performance.now();
                try { return originalRender.apply(this, args); }
                finally { samples.render.push(performance.now() - at); samples.drawCalls.push(glRenderer.info.render.calls);
                    samples.triangles.push(glRenderer.info.render.triangles); }
            };
            const visibilityEvents = [], onVisibility = () => visibilityEvents.push(document.visibilityState);
            document.addEventListener('visibilitychange', onVisibility);
            const tick = d.game.currentTick, start = performance.now(); let last, raf;
            const pan = t => {
                if (last !== undefined) samples.frames.push(t - last); last = t;
                d.worldScene.cameraPan.setPan({ x: window.__panBase.x - 350 + Math.sin((t - start) / 900) * 350,
                    y: window.__panBase.y + 150 + Math.cos((t - start) / 900) * 150 });
                raf = requestAnimationFrame(pan);
            };
            raf = requestAnimationFrame(pan);
            try { await new Promise(resolve => setTimeout(resolve, duration)); }
            finally { cancelAnimationFrame(raf); renderer.update = originalUpdate; renderer.render = originalRender;
                glRenderer.info.autoReset = autoReset; document.removeEventListener('visibilitychange', onVisibility);
                for (const [scene, update] of matrixMethods) scene.updateMatrixWorld = update; }
            const elapsed = performance.now() - start;
            const stat = values => { values.sort((a, b) => a - b); return { n: values.length,
                mean: values.reduce((a, b) => a + b, 0) / values.length,
                p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)],
                p99: values[Math.floor(values.length * .99)], max: values.at(-1) }; };
            let nodes = 0, hd = 0, hiddenHd = 0;
            d.worldScene.scene.traverse(object => { nodes++; if (object.name.startsWith('unit-vxl-hd-')) {
                hd++; if (!object.visible) hiddenHd++; } });
            const context = glRenderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
            return { label, automatic, attached, frozen, duration: elapsed, fps: samples.frames.length * 1000 / elapsed,
                ticksPerSecond: (d.game.currentTick - tick) * 1000 / elapsed,
                ...Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stat(values)])),
                sceneMatrixUpdatesPerFrame: matrixUpdates / samples.update.length,
                nodes, hd, hiddenHd, output: renderer.outputMetrics, visibility: document.visibilityState, visibilityEvents,
                gpu: debug && context.getParameter(debug.UNMASKED_RENDERER_WEBGL), gl: context.getContextAttributes() };
        };
        window.__restoreCacheParents = () => { for (const [parent, remove] of parents) parent.remove = remove; };
        return { cachedFrames: frames.length };
    });
    report.setup = setup;
    for (const [label, automatic, attached, frozen] of [
        ['live-candidate', false, false, false],
        ['control-original-a', true, true, true], ['control-matrix-only', false, true, true],
        ['control-candidate-a', false, false, true], ['control-original-b', true, true, true],
        ['control-candidate-b', false, false, true],
        ['control-candidate-c', false, false, true], ['control-original-c', true, true, true],
    ]) {
        const result = await page.evaluate(options => window.__sampleScene(options), { label, automatic, attached, frozen });
        assert.equal(result.visibility, 'visible'); assert.deepEqual(result.visibilityEvents, []);
        if (frozen) assert.equal(result.ticksPerSecond, 0); else assert(result.ticksPerSecond > 0);
        assert.equal(result.sceneMatrixUpdatesPerFrame, automatic ? 4 : 2);
        report.measurements.push(result); await save();
        console.log(JSON.stringify({ label, fps: result.fps, update: result.update.mean, render: result.render.mean,
            calls: result.drawCalls.mean, nodes: result.nodes, p95: result.frames.p95 }));
    }
    report.renderEquivalence = await page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer.getContext();
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        const a = new Uint8Array(width * height * 4), b = new Uint8Array(a.length);
        window.__keepCachedAttached = false; d.renderer.getScenes().forEach(s => s.scene.matrixWorldAutoUpdate = false);
        d.renderer.update(0); d.renderer.render(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, a);
        const frames = d.renderableManager.getRenderableContainer().getChildren()
            .flatMap(r => r.unitVxlHd?.layers.flatMap(layer => layer.frames) ?? []);
        for (const frame of frames) for (const mesh of [frame.batch, frame.depth, frame.translucent])
            if (mesh.parent !== frame.parent) frame.parent.add(mesh);
        d.renderer.getScenes().forEach(s => s.scene.matrixWorldAutoUpdate = true);
        d.renderer.render(); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, b);
        let different = 0, nonzero = 0;
        for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) different++; if (a[i]) nonzero++; }
        return { width, height, comparedBytes: a.length, differentBytes: different, nonzeroBytes: nonzero };
    });
    assert.equal(report.renderEquivalence.differentBytes, 0);
    assert(report.renderEquivalence.nonzeroBytes > 0);
    await page.evaluate(() => {
        const d = window.__ra2debug; window.__keepCachedAttached = false;
        d.renderer.getScenes().forEach(s => s.scene.matrixWorldAutoUpdate = false);
        d.gameScreen.gameAnimationLoop.tickGame = window.__savedTick; window.__restoreCacheParents();
    });
    await page.waitForTimeout(1000); await page.screenshot({ path: path.join(out, 'eight-player-candidate.png') });
    assert.equal(report.errors.length, 0);
    assert.equal(report.consoleErrors.filter(message => message.includes('Handled error:')).length, 0);
    report.status = 'PASS_NATIVE_EIGHT_PLAYER_DIAGNOSTIC';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await save(); await app.close(); }
