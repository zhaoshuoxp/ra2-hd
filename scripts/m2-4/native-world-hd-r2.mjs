import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { checkTerrainSourceRecovery } from './native-terrain-source-recovery-batch97.mjs';

const [target, output] = process.argv.slice(2);
const runtime = JSON.parse(await fs.readFile(target));
if (runtime.uiRoot) process.env.RA2_UI_RESOURCE_ROOT = runtime.uiRoot;
const density = process.argv.includes('--2x') ? 2 : 4;
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
let selected;
const s = await startSession(target, output, edition, false, async ({ page }) => {
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.screens.has(16));
    await page.evaluate(() => window.__ra2debug.mainMenuController.pushScreen(16));
    const select = page.locator('[data-hd-family=all]');
    await select.locator('.select-value').click();
    await select.locator('.option').filter({ hasText: new RegExp(`^${density}×$`) }).click();
    selected = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.serialize());
    assert.equal(selected.split(',')[12], '1');
    assert.equal(Number(selected.split(',')[13]), density);
    await page.screenshot({ path: path.join(output, 'pre-match-graphics.png') });
    await page.evaluate(() => window.__ra2debug.mainMenuController.leaveCurrentScreen());
    await page.waitForSelector('[data-hd-family=all]', { state: 'detached' });
});
const { page, report, out } = s;
report.selectedViaActualMenu = selected;
report.disclosure = 'Isolated native Mac session. HD selected with real menu clicks. Initial MCV deploys and structures/units use native production queues, costs and prerequisites. Controlled starting credit grant, stopped AI and revealed map; no production-speed, rule, camera or asset changes.';
report.production = [];
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.localPlayer.credits += 100000;
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name)).id], 10);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'GACNST'));
    for (const name of ['GAPOWR', 'GAPILE', 'GAREFN', 'GAWEAP', 'AMRADR']) {
        const before = await page.evaluate(name => {
            const d = window.__ra2debug, rule = d.game.rules.getBuilding(name);
            const available = d.localPlayer.production.isAvailableForProduction(rule);
            if (available) d.actionsApi.queueForProduction(0, 2, name, 1);
            return { name, available, cost: rule.cost, tick: d.game.currentTick };
        }, name);
        assert(before.available, `${name} must satisfy native prerequisites`);
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3,
            undefined, { timeout: 120000 });
        await page.evaluate(name => {
            const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(o => o.name === 'GACNST');
            const tiles = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                && d.game.getConstructionWorker(d.localPlayer).canPlaceAt(name, t, { normalizedTile: true }))
                .sort((a, b) => Math.hypot(a.rx - yard.tile.rx, a.ry - yard.tile.ry)
                    - Math.hypot(b.rx - yard.tile.rx, b.ry - yard.tile.ry));
            if (!tiles.length) throw Error(`No legal native placement: ${name}`);
            d.actionsApi.placeBuilding(name, tiles[0].rx, tiles[0].ry);
        }, name);
        await page.waitForFunction(name => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === name), name);
        report.production.push(before);
        console.log(`Native building completed: ${name}`);
    }
    for (const [name, queue, type] of [['E1', 2, 3], ['MTNK', 3, 7]]) {
        const before = await page.evaluate(({ name, queue, type }) => {
            const d = window.__ra2debug, rule = d.game.rules.getObject(name, type);
            const available = d.localPlayer.production.isAvailableForProduction(rule);
            const ids = d.localPlayer.getOwnedObjects().filter(o => o.name === name).map(o => o.id);
            if (available) d.actionsApi.queueForProduction(queue, type, name, 1);
            return { name, available, ids, tick: d.game.currentTick };
        }, { name, queue, type });
        assert(before.available, `${name} native production is unavailable`);
        await page.waitForFunction(({ name, ids }) => window.__ra2debug.localPlayer.getOwnedObjects()
            .some(o => o.name === name && !ids.includes(o.id)), before, { timeout: 120000 });
        report.production.push(before);
        console.log(`Native unit completed: ${name}`);
    }
    await page.waitForFunction(() => {
        const d = window.__ra2debug;
        return ['GACNST', 'GAPILE', 'GAREFN', 'GAWEAP', 'GAAIRC', 'E1', 'MTNK']
            .every(name => d.sovietUnitsHd.families[name]?.status === 'READY');
    }, undefined, { timeout: 60000 });
    report.binding = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        return { settings: d.generalOptions.graphics.serialize(), map: d.game.gameOpts.mapName, tick: d.game.currentTick,
            terrain: structuredClone(d.terrainHd), environment: structuredClone(d.environmentHd),
            demand: structuredClone(d.sovietUnitsHd),
            power: w.powerPlantHd.report,
            actors: d.localPlayer.getOwnedObjects().filter(o => o.isTechno()).map(o => {
                const r = d.renderableManager.getRenderableByGameObject(o);
                const builder = r?.mainObj?.builder ?? r?.shpRenderable?.builder;
                const hdPage = builder?.getHdPage();
                const material = builder?.mesh?.material;
                return { name: o.name, id: o.id, body: r?.mainObj?.builder?.hdOverride?.identity,
                    shp: r?.shpRenderable?.builder?.hdOverride?.identity, vxl: !!r?.unitVxlHd?.active,
                    gpuHd: !!hdPage && material?.type === 'HdSpriteMaterial' && material.map === hdPage.base
                        && material.uniforms.remapMap.value === hdPage.data };
            }),
            prepared: { bytes: d.preparedHdCache.bytes, pendingBytes: d.preparedHdCache.pendingBytes },
            glError: d.renderer.renderer.getContext().getError() };
    });
    for (const name of ['GACNST', 'GAPILE', 'GAREFN', 'GAWEAP', 'GAAIRC', 'E1', 'MTNK'])
        assert.equal(report.binding.demand.families[name].density, density, `${name} density`);
    for (const actor of report.binding.actors.filter(o => ['GACNST', 'GAPOWR', 'GAPILE', 'GAREFN', 'GAWEAP', 'AMRADR', 'E1', 'MTNK'].includes(o.name)))
        assert(actor.gpuHd || actor.vxl, `${actor.name} must bind actual HD rendering material`);
    assert.equal(report.binding.power.density, density);
    assert.equal(report.binding.glError, 0);
    assert(report.binding.demand.gpuBytes <= report.binding.demand.budget);
    assert(report.binding.prepared.bytes + report.binding.prepared.pendingBytes <= 128 * 1024 * 1024);
    await page.screenshot({ path: path.join(out, 'native-base-and-produced-units.png') });
    await checkTerrainSourceRecovery(s);
    report.status = 'PASS_NATIVE_MENU_SELECTION_DEPLOYMENT_PRODUCTION_HD_AND_SOURCE_RECOVERY';
} catch (error) {
    failure = error;
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'world-hd-report.json'), JSON.stringify(report, null, 2) + '\n');
    await s.app.close();
}
if (failure) throw failure;
