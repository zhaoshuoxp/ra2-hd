// Incremental true-4x binding, representative state and GPU residency checks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../allied-units/desktop-session.mjs';

const density = process.argv.includes('--density=2') ? 2 : 4;
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const snow = process.argv.includes('--snow'), probe = process.argv.includes('--probe');
const changedOnly = process.argv.includes('--changed-only');
const s = await startSession(process.argv[2], process.argv[3], edition, snow, async ({ page, report }) => {
    report.options = { default: await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), selected: density };
    assert.equal(report.options.default, 4);
    await page.evaluate(density => window.__ra2debug.generalOptions.graphics.hdDensity.value = density, density);
});
let failure;
s.report.console = [];
s.page.on('console', message => {
    if (s.report.console.length < 500) s.report.console.push({ type: message.type(), text: message.text().slice(0, 4000) });
});
try {
    await s.page.waitForFunction(() => window.__ra2debug?.renderableManager && window.__ra2debug?.worldView);
    s.report.fixture = await s.page.evaluate(({ edition, probe, changedOnly }) => {
        const f = window.__allied;
        const infantry = ['E1', 'JUMPJET', 'CLEG', 'SNIPE', 'TANY', 'GHOST', 'SPY', 'ADOG',
            'E2', 'SHK', 'FLAKT', 'DOG', 'SENGINEER', 'IVAN', 'DESO', 'TERROR', 'YURI'];
        const vehicles = ['MTNK', 'AMCV', 'CMIN', 'FV', 'MGTK', 'SREF', 'TNKD', 'SHAD', 'DEST', 'AEGIS', 'LCRF', 'CARRIER',
            'DLPH', 'HTNK', 'DRED', 'V3', 'HARV', 'ZEP', 'HYD', 'SUB', 'SAPC', 'TTNK', 'HTK', 'APOC', 'SMCV', 'DTRUCK', 'DRON'];
        const buildings = ['GAPOWR', 'GAPILE', 'GACSPH', 'GACNST', 'GAWEAP', 'GATECH', 'GAREFN', 'GAYARD', 'GTGCAN',
            'GAAIRC', 'GAGAP', 'GAWALL', 'GAPILL', 'GASPYSAT', 'ATESLA', 'GADEPT', 'GAOREP', 'GAWEAT', 'NASAM'];
        if (edition === 'yr') {
            infantry.push('GGI', 'BORIS', 'CCOMAND', 'PTROOP', 'CIVAN');
            vehicles.push('BFRT', 'ROBO', 'SCHP'); buildings.push('GAROBO');
        }
        if (changedOnly) {
            infantry.splice(0, infantry.length, 'E1', 'JUMPJET', 'CLEG', 'SNIPE', 'TANY', 'GHOST', 'E2',
                ...(edition === 'yr' ? ['GGI'] : []));
            vehicles.splice(0, vehicles.length, 'DLPH', 'MTNK', 'HTNK', 'APOC');
            buildings.splice(0, buildings.length, 'GAPILE', 'GACSPH', 'GACNST', 'GAWEAP', 'GATECH', 'GAREFN', 'GAYARD', 'GTGCAN', 'GAAIRC');
        }
        for (const [i, name] of infantry.entries()) f.spawn(name, 3,
            { rx: f.center.rx + i % 8, ry: f.center.ry + Math.floor(i / 8) });
        for (const [i, name] of vehicles.entries()) f.spawn(name, 7,
            { rx: f.center.rx + i % 8, ry: f.center.ry + 5 + Math.floor(i / 8) });
        for (const name of ['ORCA', 'BEAG']) f.spawn(name, 1);
        f.buildings = buildings.map((name, i) => f.building(name,
            { rx: f.center.rx + 18 + (i % 5) * 7, ry: f.center.ry + 18 + Math.floor(i / 5) * 7 }));
        f.sovietBuildings = ['NARADR', 'NADEPT', 'NATECH', 'NANRCT', 'NAMISL', 'NAWALL',
            ...(edition === 'ra2' ? ['NACLON', 'NAPSIS'] : [])].map((name, i) => f.building(name,
                { rx: f.center.rx + 40 + i % 4 * 8, ry: f.center.ry + 40 + Math.floor(i / 4) * 8 }));
        window.__ra2debug.worldInteraction.minimapHandler.panToTile({ rx: f.center.rx + 4, ry: f.center.ry + 4 });
        return { infantry, vehicles, buildings, sovietBuildings: f.sovietBuildings.map(u => u.name), probe, changedOnly,
            boundary: 'Legal placement/spawn fixture; unchanged native rules, geometry and camera. Atlas-residency coverage is not full gameplay acceptance.' };
    }, { edition, probe, changedOnly });
    await s.page.waitForFunction(({ probe, names }) => {
        const d = window.__ra2debug, f = window.__allied;
        if (probe) return ['E1', 'JUMPJET', 'CLEG', 'SNIPE', 'TANY', 'GHOST', 'DLPH',
            ...(names.includes('GGI') ? ['GGI'] : [])].every(n => d.sovietUnitsHd.families[n]?.status === 'READY')
            && d.sovietUnitsHd.gpuBytes > 300 * 1024 * 1024;
        return [...f.buildings, ...f.sovietBuildings].every(u =>
            !!d.renderableManager.getRenderableByGameObject(u)?.mainObj?.builder?.hdOverride)
            && names.filter(n => !['E2', 'HTNK'].includes(n)).every(n => {
                const report = d.sovietUnitsHd.families[n];
                return report?.status === 'READY';
            }) && Object.values(d.sovietUnitsHd.families).every(r => r.status !== 'LOADING_COMPLETE_FAMILY');
    }, { probe, names: [...s.report.fixture.infantry, ...s.report.fixture.vehicles, 'ORCA', 'BEAG'] }, { timeout: 90000 });
    s.report.bindings = await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return [...Object.values(f.actors), ...f.buildings, ...f.sovietBuildings].map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u), h = r?.unitVxlHd;
            h?.update();
            return { name: u.name, source: d.sovietUnitsHd.families[u.name],
                identity: (r?.mainObj?.builder ?? r?.shpRenderable?.builder)?.hdOverride?.identity,
                turretDensity: r?.buildingTurretHd?.resources.density,
                shadowMasks: h?.shadowOccluders.map(m => m.visible),
                footprints: h?.layers.flatMap(l => l.frames).map(p => p.source.material.uniforms.hdMinFootprint.value) };
        });
    });
    s.report.eager = await s.page.evaluate(() => Object.fromEntries(Object.entries(window.__ra2debug.worldView.sovietBuildingsHd)
        .map(([name, family]) => [name, family.report])));
    s.report.demand = await s.page.evaluate(() => window.__ra2debug.sovietUnitsHd.families);
    s.report.lowerDensityFamilies = [...Object.entries(s.report.eager), ...Object.entries(s.report.demand)]
        .filter(([, r]) => r.status !== 'NOT_REQUESTED' && r.status !== 'EVICTED_IDLE'
            && r.density !== undefined && r.density !== density).map(([name, report]) => ({ name, report }));
    if (!probe) assert.deepEqual(s.report.lowerDensityFamilies, [], 'Requested density must fit the tested complete roster');
    for (const row of s.report.bindings) {
        if (row.shadowMasks) assert(row.shadowMasks.every(v => v === false), row.name);
        if (row.footprints) assert(row.footprints.every(v => v === 1), row.name);
        if (!probe && row.source && row.source.status === 'READY') assert.equal(row.source.density, density, row.name);
        if (row.turretDensity) assert.equal(row.turretDensity, density, row.name);
    }
    await s.stage('complete-roster');
    s.report.gpu = await s.page.evaluate(() => {
        const gl = window.__ra2debug.renderer.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], gpuTimerQueries: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    });
    if (density === 4 && !snow && !changedOnly && edition === 'yr') {
        await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        s.report.pressure = [];
        for (const extraMiB of [0, 256, 512, 0]) s.report.pressure.push(await s.page.evaluate(async extraMiB => {
            const d = window.__ra2debug, r = d.renderer.renderer, gl = r.getContext();
            for (const t of window.__regenerationPressure ?? []) gl.deleteTexture(t);
            const textures = window.__regenerationPressure = [], pixels = new Uint8Array(2048 * 2048 * 4);
            pixels.fill(127); const started = performance.now();
            for (let i = 0; i < extraMiB / 16; i++) {
                const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 2048, 2048, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            }
            gl.finish(); r.resetState(); const allocationMs = performance.now() - started, samples = [];
            for (let i = 0; i < 45; i++) {
                await new Promise(resolve => requestAnimationFrame(resolve)); const t = performance.now(); d.renderer.render(); gl.finish();
                if (i >= 5) samples.push(performance.now() - t);
            }
            samples.sort((a, b) => a - b);
            return { extraMiB, allocationMs, synchronizedRenderMedianMs: samples[20], synchronizedRenderP95Ms: samples[38],
                glError: gl.getError(), contextLost: gl.isContextLost(), textures: r.info.memory.textures,
                disclosure: 'Paused same-scene render with GPU completion; not GPU-only time or live FPS. Extra allocation probes residency.' };
        }, extraMiB));
        assert(s.report.pressure.every(r => r.glError === 0 && !r.contextLost));
        await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    if (!probe) {
        s.report.construction = [];
        await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        for (const fraction of [0, .5, 1]) {
            const samples = await s.page.evaluate(fraction => {
                const d = window.__ra2debug, f = window.__allied;
                return [...f.buildings.filter(u => ['GAPILE', 'GACSPH', 'GACNST', 'GAWEAP', 'GATECH', 'GAREFN', 'GAYARD', 'GTGCAN'].includes(u.name)),
                    ...f.sovietBuildings.filter(u => u.name !== 'NAWALL')].map(u => {
                    const r = d.renderableManager.getRenderableByGameObject(u); r.setAnimation(5, 0);
                    const object = r.animObjects.get(5)[0], a = r.animations.get(object), p = a.props;
                    const frame = p.start + Math.round((p.loopEnd - p.start) * fraction);
                    a.start(0); a.update((frame - p.start) / (p.rate * a.speed.value) * 1000 + 1);
                    object.setFrame(a.getCurrentFrame());
                    return { name: u.name, expected: frame, actual: object.builder.getFrame(), hd: object.builder.hdOverride?.identity };
                });
            }, fraction);
            assert(samples.every(r => r.expected === r.actual && r.hd)); s.report.construction.push({ fraction, samples });
        }
        await s.page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const u of [...f.buildings, ...f.sovietBuildings]) d.renderableManager.getRenderableByGameObject(u).setAnimation(0, 0);
            d.gameScreen.gameAnimationLoop.start();
        });
        for (const name of ['E1', ...(edition === 'yr' ? ['GGI'] : [])]) {
            await s.page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied; f.actor = Object.values(f.actors).find(u => u.name === name);
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile); d.actionsApi.orderUnits([f.actor.id], 10);
            }, name);
            await s.page.waitForFunction(() => window.__allied.actor.deployerTrait.isDeployed(), undefined, { timeout: 30000 });
            await s.stage(name + '-deployed');
            await s.page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await s.page.waitForFunction(() => !window.__allied.actor.deployerTrait.isDeployed());
        }
        for (const name of ['TANY', 'DLPH', 'GAPILE', 'GACSPH', 'GAYARD', 'NARADR', 'NADEPT', 'NANRCT', 'NAMISL',
            ...(edition === 'ra2' ? ['NAPSIS'] : [])]) {
            await s.page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                f.actor = [...Object.values(f.actors), ...f.buildings, ...f.sovietBuildings].find(u => u.name === name);
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            }, name);
            await s.page.waitForTimeout(200); await s.stage(name);
        }
    }
    s.report.live = await s.page.evaluate(async () => {
        const d = window.__ra2debug, startTick = d.game.currentTick, samples = []; let previous = performance.now();
        for (let i = 0; i < 120; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve)); const now = performance.now(); samples.push(now - previous); previous = now;
        }
        samples.sort((a, b) => a - b); const gl = d.renderer.renderer.getContext();
        return { medianFrameIntervalMs: samples[60], p95FrameIntervalMs: samples[114], ticksAdvanced: d.game.currentTick - startTick,
            contextLost: gl.isContextLost(), glError: gl.getError(), disclosure: 'Live frame intervals include display scheduling.' };
    });
    assert(s.report.live.ticksAdvanced > 0 && !s.report.live.contextLost && s.report.live.glError === 0);
} catch (error) {
    failure = error; console.error(error);
    await s.page.screenshot({ path: path.join(s.out, 'failure.png') });
    s.report.status = 'FAIL'; s.report.failure = error.stack;
    await fs.writeFile(path.join(s.out, 'report.json'), JSON.stringify(s.report, null, 2) + '\n');
}
try { await s.close(failure); }
catch (error) {
    await fs.writeFile(path.join(s.out, 'report.json'), JSON.stringify({ ...s.report, status: 'FAIL', closeFailure: error.stack }, null, 2) + '\n');
    failure ??= error;
}
if (failure) process.exitCode = 1;
