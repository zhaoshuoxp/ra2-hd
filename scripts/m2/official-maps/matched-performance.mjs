// A short matched R10 scene, with unchanged graphics, camera route and live gameplay.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [receiptFile, output, baselineFile] = process.argv.slice(2);
const artifact = JSON.parse(await fs.readFile(receiptFile));
const baseline = JSON.parse(await fs.readFile(baselineFile));
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out, { recursive: false }); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: artifact.resources }));
const report = { schema: 'm2-3-matched-performance-v1', artifact, baselineFile,
    preferences: baseline.preferences, errors: [], measurements: [], platform: process.platform,
    disclosure: 'Same recorded R10 map, seed, eight players, seven live bots, graphics and pan route. A short local Mac comparison; no Windows or physical-input acceptance.' };
const launched = performance.now();
const app = await electron.launch({ executablePath: path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions'),
    args: [], cwd: '/private/tmp', timeout: 60000, env: { ...process.env,
        RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1', RA2_UI_RESOURCE_ROOT: artifact.uiResources ?? artifact.uiRoot } });
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1707, height: 1067, deviceScaleFactor: 1.5, mobile: false });
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    report.editionReadyMs = performance.now() - launched;
    await page.evaluate(preferences => {
        Object.entries(preferences).forEach(([key, value]) => localStorage.setItem(key, value));
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.renderResolution.value = 'native'; graphics.hdEnabled.value = true;
        graphics.hdDensity.value = 4; graphics.shadows.value = 3;
    }, baseline.preferences);
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    const started = performance.now();
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    report.matchReadyMs = performance.now() - started;
    await page.waitForTimeout(8000);
    report.scenario = await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m23PerformancePan = d.worldScene.cameraPan.getPan();
        return { players: d.game.getCombatants().length, bots: d.game.botManager.bots.size,
            tick: d.game.currentTick, output: d.renderer.outputMetrics, panBase: window.__m23PerformancePan,
            shadows: d.generalOptions.graphics.shadows.value,
            automaticSceneMatrices: d.renderer.getScenes().map(scene => scene.scene.matrixWorldAutoUpdate),
            prepared: { ...d.preparedHdCache }, terrain: d.terrainHd.worldChargeBytes,
            environment: d.environmentHd.worldChargeBytes };
    });
    assert.equal(report.scenario.players, 8); assert.equal(report.scenario.bots, 7);
    assert.deepEqual(report.scenario.output.effective, [2560, 1600]);
    assert.equal(report.scenario.shadows, 3);
    assert(report.scenario.automaticSceneMatrices.every(value => !value));
    for (const label of ['live-candidate', 'live-candidate-repeat']) {
        report.measurements.push(await page.evaluate(async label => {
            const d = window.__ra2debug, renderer = d.renderer;
            const samples = { frames: [], update: [], render: [] };
            const originalUpdate = renderer.update, originalRender = renderer.render;
            renderer.update = function (...args) {
                const at = performance.now(); try { return originalUpdate.apply(this, args); }
                finally { samples.update.push(performance.now() - at); }
            };
            renderer.render = function (...args) {
                const at = performance.now(); try { return originalRender.apply(this, args); }
                finally { samples.render.push(performance.now() - at); }
            };
            const visibilityEvents = [], onVisibility = () => visibilityEvents.push(document.visibilityState);
            document.addEventListener('visibilitychange', onVisibility);
            const tick = d.game.currentTick, start = performance.now(); let last, raf;
            const pan = t => {
                if (last !== undefined) samples.frames.push(t - last); last = t;
                const base = window.__m23PerformancePan;
                d.worldScene.cameraPan.setPan({ x: base.x - 350 + Math.sin((t - start) / 900) * 350,
                    y: base.y + 150 + Math.cos((t - start) / 900) * 150 });
                raf = requestAnimationFrame(pan);
            };
            raf = requestAnimationFrame(pan);
            try { await new Promise(resolve => setTimeout(resolve, 8000)); }
            finally { cancelAnimationFrame(raf); renderer.update = originalUpdate; renderer.render = originalRender;
                document.removeEventListener('visibilitychange', onVisibility); }
            const duration = performance.now() - start;
            const stat = values => { values.sort((a, b) => a - b); return { n: values.length,
                mean: values.reduce((a, b) => a + b, 0) / values.length,
                p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)],
                p99: values[Math.floor(values.length * .99)], max: values.at(-1) }; };
            return { label, duration, fps: samples.frames.length * 1000 / duration,
                ticksPerSecond: (d.game.currentTick - tick) * 1000 / duration,
                ...Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, stat(values)])),
                output: renderer.outputMetrics, visibility: document.visibilityState, visibilityEvents,
                glError: renderer.renderer.getContext().getError(), prepared: { ...d.preparedHdCache } };
        }, label));
    }
    for (const sample of report.measurements) {
        assert.equal(sample.visibility, 'visible'); assert.deepEqual(sample.visibilityEvents, []);
        assert.equal(sample.glError, 0); assert(sample.ticksPerSecond > 0);
        assert(sample.prepared.bytes + sample.prepared.pendingBytes <= 128 * 1024 * 1024);
    }
    report.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(process => ({ type: process.type, memory: process.memory })));
    report.worldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])]
                .reduce((sum, part) => sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand, total: terrain + environment + baseline + eager + demand,
            limit: d.terrainHd.budget };
    });
    assert.equal(report.worldAllocation.limit, 1280 * 1024 * 1024);
    assert(report.worldAllocation.total <= report.worldAllocation.limit);
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_MATCHED_SHORT_MAC_SCENE';
} catch (error) { report.status = 'FAIL'; report.failure = error.stack; throw error; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app.close(); }
console.log(JSON.stringify({ status: report.status, matchReadyMs: report.matchReadyMs, measurements: report.measurements }));
