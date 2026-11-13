import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { configureScene, sceneSnapshot } from './scene.mjs';
import { measurementContract, summarizeFrames } from './statistics.mjs';
import { captureStaticPixels, installStaticUiClock } from './pixel-controls.mjs';
import { installGpuDiagnostic } from './gpu-diagnostic.mjs';
import { measureNativeMeshBuilds } from './native-mesh-diagnostic.mjs';
import { benchmarkLayout } from './runtime-layout.mjs';
import { diagnoseVehicleShadows } from './shadow-diagnostic.mjs';
import { captureShadowStateControls } from './shadow-state-controls.mjs';
import { runShadowSaveLifecycle } from './shadow-save-lifecycle.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--') && a.includes('='))
    .map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; }));
const root = path.resolve(import.meta.dirname, '../..');
const { runtime, resources, executable: packagedExecutable, packaged, packagedApp, packagedWindowsApp } = benchmarkLayout(args, root);
const out = path.resolve(args.out);
const edition = args.edition ?? 'yr', scene = args.scene ?? 'dense', phase = args.phase ?? 'measure';
const seconds = Number(args.seconds ?? measurementContract.seconds), density = Number(args.density ?? 4);
assert(['ra2', 'yr'].includes(edition) && ['dense', 'overload', 'sustained'].includes(scene));
assert(['measure', 'profile', 'explore'].includes(phase) && seconds > 0 && seconds <= 600 && [0, 2, 4].includes(density));
assert(args.gpu !== '1' || phase !== 'measure', 'GPU query instrumentation is diagnostic only');
assert(args.draws !== '1' || phase !== 'measure', 'Draw classification is diagnostic only');
assert(args.static !== '1' || phase === 'explore', 'Frozen pixel controls are diagnostic only');
assert(args['shadow-diagnostic'] !== '1' || phase !== 'measure', 'Shadow diagnostics are excluded from formal timing');
assert(args['shadow-states'] !== '1' || phase === 'explore', 'Dynamic shadow controls are diagnostic only');
assert(args['shadow-lifecycle'] !== '1' || phase === 'explore', 'Shadow lifecycle controls are diagnostic only');
assert(!args['shadow-instancing'] || ['on', 'off'].includes(args['shadow-instancing']));
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: resources }));
const report = { schema: 'm4-native-benchmark-v1', status: 'RUNNING', edition, scene, phase, seconds, density,
    runtime, packagedApp, packagedWindowsApp, resources, startedAt: new Date().toISOString(), contract: measurementContract, errors: [], failedResources: [],
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    settings: { hd: density !== 0, density, resolution: 'native', shadows: 3, cameraScale: 'unchanged', seedTimestamp: 1700000000000 },
    formalWindow: phase === 'measure' && seconds === measurementContract.seconds };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const runtimePackage = JSON.parse(await fs.readFile(path.join(runtime, 'package.json'), 'utf8'));
const uuidCallers = [];
if (args.static === '1') for (const name of await fs.readdir(path.join(runtime, 'dist/assets'))) {
    if (!name.endsWith('.js')) continue;
    const source = await fs.readFile(path.join(runtime, 'dist/assets', name), 'utf8');
    for (const match of source.matchAll(/function ([\w$]+)\(\)\{(?:let|var|const) [^{}]{0,250}?Math\.random\(\)\*4294967295/g)) {
        uuidCallers.push({ file: name, name: match[1] });
    }
}
if (args.static === '1') assert(uuidCallers.some(row => row.file.startsWith('three.module-')),
    'Static control must identify the UUID generator before separating visual randomness');
const frozenIdentity = await fs.readFile(runtime + '.json', 'utf8').catch(() => undefined);
report.runtimeIdentity = { packageSourceHead: runtimePackage.sourceHead ?? null, sourceDigest: runtimePackage.sourceDigest ?? null,
    frozenManifest: frozenIdentity ? { path: runtime + '.json', sha256: createHash('sha256').update(frozenIdentity).digest('hex'),
        sourceHead: JSON.parse(frozenIdentity).sourceHead, sourceDiffSha256: JSON.parse(frozenIdentity).sourceDiffSha256 } : null,
    harnessHead: report.sourceHead };
await save();
const launchedAt = performance.now();
const executable = packagedExecutable ?? createRequire(import.meta.url)('electron');
const launchOptions = { executablePath: await fs.realpath(executable),
    args: packaged ? [] : [path.join(runtime, 'desktop/main.mjs')], cwd: tmpdir(), timeout: 90000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_UI_RESOURCE_ROOT: resources } };
let app, page;
try {
    app = await electron.launch(launchOptions);
    page = await app.firstWindow();
    page.setDefaultTimeout(90000);
    page.on('pageerror', e => report.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) report.failedResources.push([r.url(), r.status()]); });
    await page.evaluate(() => window.desktopDisplay.set('fullscreen'));
    await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
    report.machine = await app.evaluate(async ({ app, screen, BrowserWindow, powerMonitor }) => ({
        platform: process.platform, arch: process.arch, loadedAppPath: app.getAppPath(),
        versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
        displays: screen.getAllDisplays().map(d => ({ bounds: d.bounds, workArea: d.workArea, size: d.size,
            scaleFactor: d.scaleFactor, displayFrequency: d.displayFrequency, internal: d.internal, label: d.label })),
        window: { bounds: BrowserWindow.getAllWindows()[0].getBounds(), content: BrowserWindow.getAllWindows()[0].getContentSize() },
        thermalState: powerMonitor.getCurrentThermalState?.() ?? 'UNAVAILABLE', onBattery: powerMonitor.isOnBatteryPower(),
        gpuFeatures: app.getGPUFeatureStatus(), gpu: await app.getGPUInfo('basic'),
    }));
    await save(); console.log(JSON.stringify({ stage: 'native-display', displays: report.machine.displays }));
    if (args['wait-thermal'] === 'nominal') {
        const begun = performance.now();
        let state;
        do {
            state = await app.evaluate(({ powerMonitor }) => powerMonitor.getCurrentThermalState?.() ?? 'UNAVAILABLE');
            if (state === 'nominal') break;
            assert(state !== 'UNAVAILABLE', 'Requested thermal-state wait is unavailable on this host');
            assert(performance.now() - begun < 600000, 'Thermal state did not return to nominal within ten minutes');
            console.log(JSON.stringify({ stage: 'wait-thermal', state, waitedMs: performance.now() - begun }));
            await new Promise(resolve => setTimeout(resolve, 10000));
        } while (true);
        report.thermalWait = { state, waitedMs: performance.now() - begun };
    }
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    await page.evaluate(({ edition, density, staticPixels, uuidCallers, nativeSave }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.renderResolution.value = 'native'; graphics.hdEnabled.value = density !== 0;
        graphics.hdDensity.value = density || 4; graphics.shadows.value = 3;
        const bots = Array.from({ length: 8 }, (_, i) => i === 0 ? null : ({ d: 0,
            c: edition === 'yr' && i >= 6 ? 9 : i % 2 ? 5 : 0, co: i, s: i, t: -2 }));
        Object.entries({ _r_lastMap: edition === 'yr' ? 'xmp27t8.map' : 'mp27t8.map', _r_lastMode: '1',
            _r_lastCountry: '0', _r_lastColor: '0', _r_lastStartPos: '0', _r_lastTeam: '-2',
            soloSpeedTierV1: '2', _r_hostOpts: `6;10000;${nativeSave ? 10 : 0};1;1;0;1;1;;0;1;0;0`, _r_lastBots: JSON.stringify(bots) })
            .forEach(([k, v]) => localStorage.setItem(`_edition:${edition}:${k}`, v));
        if (staticPixels) {
            // Terrain variants and idle visual phases use nondeterministic
            // Math.random independently of the native simulation PRNG.
            let value = 0x4102026;
            window.__m4StaticRandom = { seed: value, calls: 0, uuidCalls: 0, visualCalls: 0,
                algorithm: 'Visual draws fixed at midpoint; UUID constructors use an independent xorshift stream.', uuidCallers };
            Math.random = () => {
                const caller = new Error().stack.split('\n')[2] ?? '';
                const uuid = uuidCallers.some(row => caller.includes(`at ${row.name} `) && caller.includes(row.file));
                window.__m4StaticRandom.calls++;
                if (!uuid) { window.__m4StaticRandom.visualCalls++; return .5; }
                value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
                window.__m4StaticRandom.uuidCalls++; return (value >>> 0) / 4294967296;
            };
        }
        const raf = window.requestAnimationFrame;
        window.__m4FreezeNextGame = true;
        window.requestAnimationFrame = function(callback) {
            const s = window.__ra2debug?.gameScreen;
            if (window.__m4FreezeNextGame && s?.gameAnimationLoop && s?.gameTurnMgr) {
                window.__m4FreezeNextGame = false; s.gameTurnMgr.setPaused(true); s.gameAnimationLoop.stop(); return 0;
            }
            return raf.call(window, callback);
        };
    }, { edition, density, staticPixels: args.static === '1', uuidCallers, nativeSave: args['shadow-lifecycle'] === '1' });
    if (args.static === '1') await page.evaluate(installStaticUiClock);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale/zh-CN.json')));
    await page.getByRole('button', { name: labels['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    report.lobby = await page.evaluate(() => {
        const d = window.__ra2debug, lobby = d.skirmishLobby;
        const players = [...lobby.gameOpts.humanPlayers, ...lobby.gameOpts.aiPlayers].filter(Boolean);
        return { gameOpts: lobby.gameOpts, slots: lobby.slotsInfo, form: lobby.formModel,
            minimumTeams: players[0].teamId === -2 || players.some(p => p.teamId !== players[0].teamId),
            localStorage: Object.fromEntries(Object.entries(localStorage).filter(([k]) => /_r_(last|hostOpts)|soloSpeed/.test(k))) };
    });
    await save(); assert(report.lobby.minimumTeams, 'Lobby team settings must permit native combat');
    console.log(JSON.stringify({ stage: 'lobby-ready', gameOpts: report.lobby.gameOpts }));
    const loadingAt = performance.now();
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug.gameScreen?.playerUi
        && !window.__m4FreezeNextGame, undefined, { timeout: 180000 });
    await page.evaluate(() => { const s = window.__ra2debug.gameScreen; s.gameAnimationLoop.stop(); s.gameTurnMgr.setPaused(true); s.pointer.unlock(true); });
    if (args['shadow-instancing']) {
        report.shadowInstancing = await page.evaluate(mode => {
            const renderer = window.__ra2debug.renderer;
            if (typeof renderer.setVehicleShadowInstancing !== 'function') throw Error('Runtime has no vehicle-shadow switch');
            renderer.setVehicleShadowInstancing(mode === 'on');
            return { requested: mode, hardwareSupported: renderer.supportsInstancing() };
        }, args['shadow-instancing']);
    }
    report.loading = { launchToReadyMs: performance.now() - launchedAt, matchLoadingMs: performance.now() - loadingAt };
    report.mapIdentity = await page.evaluate(async () => {
        const d = window.__ra2debug, file = d.gameScreen.debugMapFile
            ?? await d.gameScreen.mapFileLoader.load(d.game.gameOpts.mapName);
        const digest = await crypto.subtle.digest('SHA-256', file.getBytes());
        return { name: file.filename, bytes: file.getSize(), sha256: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') };
    });
    const setupAt = performance.now();
    report.setup = args['shadow-lifecycle'] === '1' ? await page.evaluate(() => {
        const d = window.__ra2debug, unit = d.localPlayer.getOwnedObjects().find(o => o.isVehicle());
        d.worldInteraction.minimapHandler.panToTile(unit.tile);
        window.__m4Scene = { panBase: d.worldScene.cameraPan.getPan() };
        return { kind: 'native-only-save-lifecycle', artificialObjects: 0, nativeStartingUnitCount: d.game.gameOpts.unitCount,
            scope: 'Replay-backed saves require ordinary native setup and journaled commands; artificial pressure placement is excluded.' };
    }) : await page.evaluate(configureScene, { edition, scene });
    report.artificialSetupMs = performance.now() - setupAt;
    if (report.setup.placements) {
        report.setup.placementSha256 = createHash('sha256').update(JSON.stringify(report.setup.placements)).digest('hex');
        await fs.writeFile(path.join(out, 'placements.json'), JSON.stringify(report.setup.placements));
        delete report.setup.placements;
    }
    report.before = await page.evaluate(sceneSnapshot);
    assert.deepEqual(report.before.output.effective, report.before.output.requested, 'Native output must remain uncapped');
    assert.equal(report.before.zoom, 1, 'Pressure workload keeps the original camera scale');
    report.preWindowThermal = await app.evaluate(({ powerMonitor }) => powerMonitor.getCurrentThermalState?.() ?? 'UNAVAILABLE');
    await save();
    console.log(JSON.stringify({ stage: 'ready', out, units: report.before.units, buildings: report.before.buildings,
        output: report.before.output, display: report.machine.displays }));
    if (args['shadow-diagnostic'] === '1') report.shadowBefore = await page.evaluate(diagnoseVehicleShadows);
    if (args['shadow-lifecycle'] === '1') {
        report.shadowLifecycle = await runShadowSaveLifecycle(page, { edition, labels,
            checkpoint: async result => { report.shadowLifecycle = result; await save(); }, restart: async () => {
            await app.close(); app = await electron.launch(launchOptions); page = await app.firstWindow();
            page.setDefaultTimeout(90000);
            page.on('pageerror', e => report.errors.push(e.stack));
            page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
            page.on('response', r => { if (r.status() >= 400) report.failedResources.push([r.url(), r.status()]); });
            return page;
        } });
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
        report.status = 'COMPLETE'; await save(); await app.close(); process.exit(0);
    }
    if (args['shadow-states'] === '1') {
        await page.mouse.move(5, 5);
        report.shadowStates = await page.evaluate(captureShadowStateControls);
        for (const row of report.shadowStates.rows) if (row.png) {
            await fs.writeFile(path.join(out, row.label + '.png'), Buffer.from(row.png.split(',')[1], 'base64'));
            delete row.png;
        }
        await save(); assert.equal(report.shadowStates.status, 'PASS_EXACT_DYNAMIC_RGBA', report.shadowStates.failure);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
        report.status = 'COMPLETE'; await save(); await app.close(); process.exit(0);
    }
    if (args.static === '1') {
        await page.mouse.move(5, 5);
        report.pixelControls = await page.evaluate(captureStaticPixels, { shadowCompare: args['shadow-compare'] === '1' });
        for (const image of report.pixelControls.images) {
            await fs.writeFile(path.join(out, image.label + '.png'), Buffer.from(image.png.split(',')[1], 'base64'));
            delete image.png;
            assert.equal(image.differentBytes, 0, image.label + ' repeated frame');
            if (image.shadowComparison) assert.equal(image.shadowComparison.differentBytes, 0, image.label + ' shadow switch');
        }
        assert(report.pixelControls.simulationUnchanged);
        assert(report.pixelControls.visualRandom.uuidCalls > 0 && report.pixelControls.visualRandom.visualCalls > 0);
        assert(report.pixelControls.uiClock.handlers > 0 && report.pixelControls.uiClock.instances > 0);
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
        report.status = 'COMPLETE'; await save();
        console.log(JSON.stringify({ status: report.status, out, static: true }));
        await app.close(); process.exit(0);
    }
    const cdp = await page.context().newCDPSession(page);
    if (args.gpu === '1') await page.evaluate(installGpuDiagnostic);
    if (phase === 'profile') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
    report.raw = await page.evaluate(async ({ seconds }) => {
        const d = window.__ra2debug, s = d.gameScreen, g = d.game, renderer = d.renderer;
        const update = renderer.update, render = renderer.render, tick = s.gameAnimationLoop.tickGame;
        const deltaFrames = s.gameAnimationLoop.updateDeltaGameFrames;
        const raw = { intervals: [], timestamps: [], ticks: [], updateMs: [], renderMs: [], simulationMs: [], workMs: [],
            requestedTicks: [], executedTicks: [], samplerMs: [], startTick: g.currentTick, nominalTickMs: s.gameTurnMgr.getTurnMillis(),
            visibility: document.visibilityState, visibilityEvents: [], counts: [] };
        let previous, raf, simulationMs = 0, updateMs = 0, renderMs = 0;
        let requestedTicks = 0, executedTicks = 0;
        const visibility = () => raw.visibilityEvents.push({ atMs: performance.now() - start, value: document.visibilityState });
        renderer.update = function(...args) { const at = performance.now(); try { return update.apply(this, args); } finally { updateMs += performance.now() - at; } };
        renderer.render = function(...args) { const at = performance.now(); try { return render.apply(this, args); } finally { renderMs += performance.now() - at; } };
        s.gameAnimationLoop.tickGame = function(...args) { const at = performance.now(), before = g.currentTick;
            try { return tick.apply(this, args); } finally { simulationMs += performance.now() - at; executedTicks += g.currentTick - before; } };
        s.gameAnimationLoop.updateDeltaGameFrames = function(...args) {
            const count = deltaFrames.apply(this, args); requestedTicks += Math.max(0, count); return count;
        };
        const start = performance.now(); previous = start;
        document.addEventListener('visibilitychange', visibility);
        let lastCountAt = -5000;
        const sample = () => {
            const at = performance.now(), elapsed = at - start;
            raw.intervals.push(at - previous); raw.timestamps.push(elapsed); raw.ticks.push(g.currentTick);
            raw.updateMs.push(updateMs); raw.renderMs.push(renderMs); raw.simulationMs.push(simulationMs);
            raw.workMs.push(updateMs + renderMs + simulationMs); updateMs = 0; renderMs = 0; simulationMs = 0;
            raw.requestedTicks.push(requestedTicks); raw.executedTicks.push(executedTicks); requestedTicks = 0; executedTicks = 0;
            previous = at;
            const base = window.__m4Scene.panBase, phase = g.currentTick / 180;
            d.worldScene.cameraPan.setPan({ x: base.x + Math.sin(phase) * 850, y: base.y + Math.sin(phase / 2) * 450 });
            if (elapsed - lastCountAt >= 5000) {
                const begun = performance.now(), objects = g.getWorld().getAllObjects();
                raw.counts.push({ atMs: elapsed, tick: g.currentTick, units: objects.filter(o => o.isUnit()).length,
                    buildings: objects.filter(o => o.isBuilding()).length, projectiles: objects.filter(o => o.isProjectile()).length,
                    moving: objects.filter(o => o.isMoving).length, firing: objects.filter(o => o.isFiring).length,
                    objects: objects.length, vehicleShadows: renderer.vehicleShadowDiagnostics?.() ?? null,
                    rendererMemory: { ...renderer.renderer.info.memory },
                    overheadMs: performance.now() - begun }); lastCountAt = elapsed;
            }
            raw.samplerMs.push(performance.now() - at);
            raf = requestAnimationFrame(sample);
        };
        s.gameTurnMgr.setPaused(false); s.gameAnimationLoop.start(); raf = requestAnimationFrame(sample);
        try { await new Promise(resolve => setTimeout(resolve, seconds * 1000)); }
        finally {
            raw.durationMs = performance.now() - start; raw.endTick = g.currentTick;
            cancelAnimationFrame(raf); s.gameTurnMgr.setPaused(true); s.gameAnimationLoop.stop();
            renderer.update = update; renderer.render = render; s.gameAnimationLoop.tickGame = tick;
            s.gameAnimationLoop.updateDeltaGameFrames = deltaFrames;
            document.removeEventListener('visibilitychange', visibility);
        }
        const calls = 100000, begun = performance.now();
        for (let i = 0; i < calls; i++) performance.now();
        raw.timerCalibration = { calls, elapsedMs: performance.now() - begun };
        return raw;
    }, { seconds });
    if (phase === 'profile') {
        const { profile } = await cdp.send('Profiler.stop');
        await fs.writeFile(path.join(out, 'cpu.cpuprofile'), JSON.stringify(profile));
    }
    if (args.gpu === '1') report.gpuDiagnostic = await page.evaluate(() => window.__m4Gpu.finish());
    report.after = await page.evaluate(sceneSnapshot);
    if (args['shadow-diagnostic'] === '1') report.shadowAfter = await page.evaluate(diagnoseVehicleShadows);
    report.summary = summarizeFrames(report.raw);
    report.summary.requestedTicks = report.raw.requestedTicks.reduce((a, b) => a + b, 0);
    report.summary.executedTicks = report.raw.executedTicks.reduce((a, b) => a + b, 0);
    report.summary.unexecutedRequestedTicks = report.summary.requestedTicks - report.summary.executedTicks;
    report.summary.tickBacklogPolicy = 'Current loop advances its wall-time cursor even when the per-frame catch-up budget is exhausted; missed opportunities are not retained as a queue.';
    report.instrumentation = { timerCalibration: report.raw.timerCalibration,
        samplerMeanMs: report.raw.samplerMs.reduce((a, b) => a + b, 0) / report.raw.samplerMs.length,
        samplerMaxMs: Math.max(...report.raw.samplerMs),
        disclosure: 'Measured sampler includes array appends, camera input and five-second counting. Timer microcalibration is an upper-bound per-call estimate; profiler and screenshots are outside formal timing.' };
    assert.equal(report.raw.visibility, 'visible'); assert.deepEqual(report.raw.visibilityEvents, []);
    if (args.draws === '1') {
        // Diagnostic only: classify one complete frame's submissions after timing.
        assert(phase !== 'measure', 'Draw classification is diagnostic only');
        report.drawDiagnostic = await page.evaluate(() => {
            const d = window.__ra2debug, r = d.renderer.renderer, direct = r.renderBufferDirect;
            const rows = new Map(), materials = new Set(), geometries = new Set(), programs = new Set();
            const scene = d.worldScene.scene;
            let nodes = 0, visibleNodes = 0;
            scene.traverse(() => nodes++); scene.traverseVisible(() => visibleNodes++);
            r.renderBufferDirect = function(camera, sceneArg, geometry, material, object, group) {
                const pass = r.getRenderTarget() ? 'shadow' : 'main';
                let owner = object.parent;
                while (owner && !owner.name) owner = owner.parent;
                const name = ((object.name || object.type) + '<' + (owner?.name ?? 'root')).replace(/-\d+/g, '')
                    .replace(/unit-vxl-hd-[^<]*/g, 'unit-vxl-hd');
                const key = [pass, name, material.type, material.colorWrite === false ? 'noColor' : 'color',
                    material.depthWrite === false ? 'noDepth' : 'depth', material.transparent ? 'transparent' : 'opaque'].join('|');
                rows.set(key, (rows.get(key) ?? 0) + 1);
                materials.add(material); geometries.add(geometry);
                return direct.call(this, camera, sceneArg, geometry, material, object, group);
            };
            // Count material version bumps (program re-evaluation) during one update and render.
            let material;
            scene.traverse(object => { material ??= Array.isArray(object.material) ? object.material[0] : object.material; });
            while (material && !Object.getOwnPropertyDescriptor(material, 'needsUpdate')?.set) material = Object.getPrototypeOf(material);
            const descriptor = Object.getOwnPropertyDescriptor(material, 'needsUpdate');
            const bumps = new Map();
            Object.defineProperty(material, 'needsUpdate', { configurable: true, get: descriptor.get, set(value) {
                if (value === true) { const key = `${this.type}|${this.name}|side${this.side}|${this.transparent ? 't' : 'o'}`; bumps.set(key, (bumps.get(key) ?? 0) + 1); }
                descriptor.set.call(this, value);
            } });
            const programsBefore = r.info.programs.length;
            try { d.renderer.update(performance.now(), 1); d.renderer.render(); }
            finally { r.renderBufferDirect = direct; Object.defineProperty(material, 'needsUpdate', descriptor); }
            return { nodes, visibleNodes, materials: materials.size, geometries: geometries.size,
                programsBefore, programsAfter: r.info.programs.length,
                needsUpdate: [...bumps].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })),
                rows: [...rows].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count })) };
        });
    }
    report.rendererDiagnostic = await page.evaluate(() => {
        const r = window.__ra2debug.renderer.renderer, gl = r.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        const reset = r.info.autoReset; r.info.autoReset = false; r.info.reset(); window.__ra2debug.renderer.render();
        const fullFrame = { ...r.info.render }; r.info.autoReset = reset;
        return { info: { render: { ...r.info.render }, memory: { ...r.info.memory }, programs: r.info.programs.length },
            fullFrame, timerQuerySupported: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
            backend: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'UNAVAILABLE',
            context: gl.getContextAttributes(), attributes: r.info.programs.map(p => Object.keys(p.getAttributes())) };
    });
    await fs.writeFile(path.join(out, 'samples.json'), JSON.stringify(report.raw)); delete report.raw;
    report.finalThermal = await app.evaluate(({ app, powerMonitor }) => ({ thermalState: powerMonitor.getCurrentThermalState?.() ?? 'UNAVAILABLE',
        processMetrics: app.getAppMetrics().map(p => ({ type: p.type, cpu: p.cpu, memory: p.memory })) }));
    if (args.mesh === '1') {
        report.nativeMesh = await page.evaluate(measureNativeMeshBuilds);
        assert(report.nativeMesh.rows.length > 0 && report.nativeMesh.simulationUnchanged);
    }
    await page.screenshot({ path: path.join(out, 'after.png') });
    assert.equal(report.before.bots, 7); assert.equal(report.after.bots, 7);
    assert.equal(report.after.status, 1, 'Native combat must remain active throughout the window');
    assert.equal(report.before.shadows, 3); assert.equal(report.after.shadows, 3);
    assert.deepEqual(report.after.output.effective, report.before.output.effective);
    assert.equal(report.after.zoom, 1);
    assert.equal(report.before.hdDensity, density || 4); assert.equal(report.after.hdEnabled, density !== 0);
    assert.deepEqual(report.summary.frameMs.n > 0, true); assert(report.summary.ticksAdvanced > 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'COMPLETE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1;
    report.body = await page?.locator('body').innerText().catch(() => '');
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, summary: report.summary && { fps: report.summary.callbackFps,
    p95: report.summary.frameMs.p95, p99: report.summary.frameMs.p99, max: report.summary.frameMs.max,
    simulationRatio: report.summary.simulationRatio, gate: report.summary.callbackGate }, failure: report.failure }));
