// Audit every Soviet rendering family and exercise density via the actual UI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../allied-units/desktop-session.mjs';

const density = process.argv.includes('--density=2') ? 2 : 4;
const snow = process.argv.includes('--snow');
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const s = await startSession(process.argv[2], process.argv[3], edition, snow, async ({ page, report, out }) => {
    report.options = { default: await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), selected: density };
    assert.equal(report.options.default, 4);
    for (const selected of density === 4 ? [2, 4] : [2]) {
        await page.getByRole('button', { name: locale['hd:menuoptions'], exact: true }).click();
        const field = page.locator('[data-hd-density="atlas"]');
        await field.locator('.select-value').click();
        await field.getByText(`${selected}×`, { exact: true }).click();
        assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), selected);
        await page.screenshot({ path: path.join(out, `options-${selected}x.png`) });
        const back = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
        await page.getByRole('button', { name: back, exact: true }).click();
        await page.reload();
        await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), selected);
    }
    report.options.persistedAcrossReload = true;
});
let failure;
try {
    s.report.roster = await s.page.evaluate(edition => {
        const f = window.__allied;
        const infantry = ['E2', 'SHK', 'FLAKT', 'DOG', 'SENGINEER', 'IVAN', 'DESO', 'TERROR', 'DRON',
            'BORIS', 'CCOMAND', 'PTROOP', 'CIVAN', 'YURI', 'SPY', 'ADOG'];
        const vehicles = ['HTNK', 'DRED', 'V3', 'HARV', 'ZEP', 'HYD', 'SUB', 'SAPC', 'TTNK', 'HTK', 'APOC', 'SMCV', 'DTRUCK', 'SCHP'];
        const buildings = ['GAAIRC', 'NASAM', 'NALASR', 'NAWEAP', 'NAIRON', 'NAYARD'];
        if (edition === 'ra2') {
            for (const name of ['BORIS', 'CCOMAND', 'PTROOP', 'CIVAN']) infantry.splice(infantry.indexOf(name), 1);
            vehicles.splice(vehicles.indexOf('SCHP'), 1);
            infantry.push('E1', 'TANY'); vehicles.push('MTNK', 'CARRIER');
            buildings.push('GAPILE', 'GADEPT');
        }
        for (const name of infantry) f.spawn(name, name === 'DRON' ? 7 : 3);
        for (const name of vehicles) f.spawn(name, 7);
        f.spawn('SQD', 7);
        if (edition === 'ra2') f.spawn('ORCA', 1);
        f.buildings = buildings.map(name => f.building(name, { rx: f.center.rx + 20, ry: f.center.ry + 20 }));
        return { infantry, vehicles, buildings };
    }, edition);
    await s.page.waitForFunction(edition => {
        const d = window.__ra2debug;
        const names = ['SPY', 'ADOG', 'YURI', 'BORIS', 'SCHP', 'DRED', 'V3', 'HARV', 'ZEP', 'HYD', 'SUB', 'SAPC', 'TTNK', 'HTK', 'APOC', 'SMCV', 'DTRUCK'];
        return names.filter(n => edition !== 'ra2' || !['BORIS', 'SCHP'].includes(n)).every(n => d.sovietUnitsHd.families[n]?.status === 'READY');
    }, edition, { timeout: 60000 });
    await s.page.waitForTimeout(1000);
    s.report.audit = await s.page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return Object.values(f.actors).map(u => {
            const r = d.renderableManager.getRenderableByGameObject(u), hd = r?.unitVxlHd;
            const builder = r?.shpRenderable?.builder;
            return { name: u.name, vxlActive: hd?.active, shpActive: !!builder?.hdOverride,
                coverage: hd ? hd.layers.flatMap(l => l.frames).map(frame => frame.source.material.uniforms.hdMinFootprint.value)
                    : builder?.mesh?.material?.uniforms?.hdMinFootprint?.value,
                vxlPages: hd?.family.parts.map(p => ({ pageSize: p.pageSize, frame: p.frames[0].rect, logicalSize: p.frames[0].logicalSize,
                    offset: p.frames[0].offset, physicalSize: [p.override.pages[0].base.image.width, p.override.pages[0].base.image.height],
                    nearest: p.override.pages[0].base.minFilter === 1003, mipmaps: p.override.pages[0].base.generateMipmaps })),
                source: d.sovietUnitsHd.families[u.name],
                shadowMasks: hd?.shadowOccluders.map(m => m.visible) };
        });
    });
    s.report.eager = await s.page.evaluate(() => Object.fromEntries(Object.entries(window.__ra2debug.worldView.sovietBuildingsHd)
        .map(([name, family]) => [name, family.report])));
    s.report.special = await s.page.evaluate(() => ({
        conscript: window.__ra2debug.worldView.conscriptHd?.report,
        rhino: window.__ra2debug.worldView.rhinoHd?.report,
        rhinoPages: [...window.__ra2debug.worldView.rhinoHd.parts.values()].map(p => [p.bitmap.width, p.bitmap.height]),
        turrets: window.__allied.buildings.map(u => {
            const r = window.__ra2debug.renderableManager.getRenderableByGameObject(u);
            return { name: u.name, density: r.buildingTurretHd?.resources?.density,
                pages: r.buildingTurretHd && [...r.buildingTurretHd.resources.parts.values()].map(p => [p.base.image.width, p.base.image.height]) };
        }),
    }));
    assert.equal(s.report.special.conscript.density, density);
    assert.equal(s.report.special.rhino.density, density);
    assert(s.report.special.rhinoPages.every(size => size[0] === 80 * density && size[1] === 72 * density));
    for (const name of ['NASAM', 'NALASR'])
        assert.equal(s.report.special.turrets.find(row => row.name === name)?.density, density);
    for (const row of s.report.audit) {
        if (Array.isArray(row.coverage)) assert(row.coverage.every(v => v === 1), row.name);
        else if (row.coverage !== undefined) assert.equal(row.coverage, 1, row.name);
        if (row.source?.status === 'READY') assert.equal(row.source.density, ['E1', 'TANY'].includes(row.name) ? 2 : density, row.name);
        if (row.vxlPages) assert(row.vxlPages.every(p => p.nearest && !p.mipmaps), row.name);
        if (row.vxlPages) assert.equal(row.vxlActive, true, row.name);
        if (row.shadowMasks) assert(row.shadowMasks.every(v => v === false), row.name);
    }
    for (const [name, r] of Object.entries(s.report.eager)) {
        if (['NAHAND', 'NAREFN', 'NAWEAP', 'NACNST', 'NAYARD', 'NAIRON', 'NALASR', 'NAFLAK', 'TESLA'].includes(name))
            assert.equal(r.density, density, name + ': ' + JSON.stringify(r));
    }
    {
        s.report.comparisons = [];
        for (const name of ['APOC', 'HARV', 'HYD', 'ZEP', 'E2', 'HTNK']) {
            await s.page.evaluate(name => {
                const d = window.__ra2debug, f = window.__allied;
                f.actor = Object.values(f.actors).find(u => u.name === name);
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            }, name);
            await s.page.waitForTimeout(200);
            await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
            for (const legacy of density === 4 && name !== 'HTNK' ? [true, false] : [false]) {
                const data = await s.page.evaluate(legacy => {
                    const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.actor);
                    const hd = r.unitVxlHd;
                    if (hd) { for (const layer of hd.layers) for (const frame of layer.frames)
                        for (const mesh of [frame.source, frame.batch, frame.depth, frame.translucent, ...frame.batch.children])
                            if (mesh.material?.uniforms?.hdMinFootprint)
                                mesh.material.uniforms.hdMinFootprint.value = legacy ? frame.frame.rect[2] / frame.frame.logicalSize[0] : 1;
                    } else if (f.actor.name === 'E2') {
                        const map = r.shpRenderable.builder.getHdPage().base;
                        d.worldScene.scene.traverse(o => {
                            if (o.material?.map === map && o.material.uniforms?.hdMinFootprint)
                                o.material.uniforms.hdMinFootprint.value = legacy ? 4 : 1;
                        });
                    }
                    hd?.update(); d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                    const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                    const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
                    const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
                    const crop = document.createElement('canvas'); crop.width = 420; crop.height = 300;
                    crop.getContext('2d').drawImage(c, Math.round(x - 210), Math.round(y - 180), 420, 300, 0, 0, 420, 300);
                    return { png: crop.toDataURL(), tick: d.game.currentTick, buffer: [c.width, c.height], glError: d.renderer.renderer.getContext().getError() };
                }, legacy);
                const file = `${name}-${legacy ? 'legacy-expanded' : 'actual-footprint'}.png`;
                await fs.writeFile(path.join(s.out, file), Buffer.from(data.png.split(',')[1], 'base64')); delete data.png;
                assert.equal(data.glError, 0);
                s.report.comparisons.push({ name, legacy, file, ...data });
            }
            await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        }
    }
    for (const name of ['GAAIRC', 'NASAM', 'NALASR', 'NAYARD']) {
        await s.page.evaluate(name => {
            const f = window.__allied, d = window.__ra2debug; f.actor = f.buildings.find(u => u.name === name);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await s.page.waitForTimeout(200); await s.stage(name);
    }
    await s.stage('selected-density');
    s.report.demand = await s.page.evaluate(() => window.__ra2debug.sovietUnitsHd.families);
    for (const [name, r] of Object.entries(s.report.demand)) {
        if (name === 'SQD') { assert.equal(r.attempts[0]?.reason, 'USER_REQUESTED_ORIGINAL'); continue; }
        assert(!/FAIL|FALLBACK/.test(r.status), name + ': ' + JSON.stringify(r));
    }
    if (density === 2) {
        await s.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdDensity.value = 4; window.__allied.spawn('SREF', 7); });
        await s.page.waitForFunction(() => window.__ra2debug.sovietUnitsHd.families.SREF?.status === 'READY');
        assert.equal(await s.page.evaluate(() => window.__ra2debug.sovietUnitsHd.families.SREF.density), 2);
        s.report.preferenceChangeDeferred = true;
        await s.page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value = 2);
    }
    s.report.live = await s.page.evaluate(async () => {
        const d = window.__ra2debug, tick = d.game.currentTick, intervals = []; let previous = performance.now();
        for (let i = 0; i < 180; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const now = performance.now(); intervals.push(now - previous); previous = now;
        }
        intervals.sort((a, b) => a - b);
        return { medianFrameIntervalMs: intervals[90], p95FrameIntervalMs: intervals[171],
            ticksAdvanced: d.game.currentTick - tick, contextLost: d.renderer.renderer.getContext().isContextLost() };
    });
    assert(s.report.live.ticksAdvanced > 0); assert.equal(s.report.live.contextLost, false);
    s.report.glError = await s.page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(s.report.glError, 0);
} catch (error) { failure = error; console.error(error); }
await s.close(failure);
if (failure) process.exitCode = 1;
