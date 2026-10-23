import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const receipt = process.argv[2], output = path.resolve(process.argv[3]);
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--2x') ? 2 : 4;
if (!process.argv.some(a => a.startsWith('--map='))) process.argv.push('--map=' + (edition === 'yr' ? 'X' : '') + 'MP03T4.map');
const session = await startSession(receipt, output, edition, false, async ({ page }) => page.evaluate(density => {
    const graphics = window.__ra2debug.generalOptions.graphics;
    graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
}, density));
const { page, report } = session;
let failure;
try {
    await page.evaluate(edition => {
        const f = window.__allied;
        window.__mixedActors = [];
        const buildings = ['GAPOWR', 'GAPILE', 'GAREFN', 'GAWEAP', 'GAAIRC', 'GATECH', 'GADEPT',
            'NAPOWR', 'NAHAND', 'NAREFN', 'NAWEAP', 'NARADR', 'NATECH', 'NADEPT'];
        const infantry = ['E1', 'E2', 'ENGINEER', 'SENGINEER', 'SHK', 'IVAN', 'DESO'];
        const vehicles = ['MTNK', 'HTNK', 'APOC', 'HARV', 'CMIN', 'FV', 'MGTK', 'SREF'];
        if (edition === 'yr') {
            buildings.push('YAPOWR', 'YABRCK', 'YAREFN', 'YAWEAP', 'YATECH', 'YAGGUN');
            infantry.push('YENGINEER', 'GGI', 'YURI', 'BORIS'); vehicles.push('LTNK', 'YTNK', 'ROBO');
        }
        buildings.forEach(name => window.__mixedActors.push(f.building(name)));
        infantry.forEach(name => window.__mixedActors.push(f.spawn(name, 3)));
        vehicles.forEach(name => window.__mixedActors.push(f.spawn(name, 7)));
    }, edition);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__ra2debug.worldView.sovietUnitsHd.idle());
    await page.waitForTimeout(800);
    report.bindings = await page.evaluate(() => {
        const d = window.__ra2debug;
        return window.__mixedActors.map(object => {
            const r = d.renderableManager.getRenderableByGameObject(object);
            const b = object.isBuilding() ? r.mainObj?.builder : r.shpRenderable?.builder;
            return { name: object.name, id: object.id, tile: [object.tile.rx, object.tile.ry],
                kind: object.isBuilding() ? 'building' : object.isInfantry() ? 'infantry' : 'vehicle',
                frame: b?.getFrame(), shp: b?.hdOverride?.identity,
                page: !!b?.getHdPage?.(), material: b?.mesh?.material?.type,
                vxl: r.unitVxlHd?.family?.identity, vxlParts: r.unitVxlHd?.family?.parts?.length,
                rhino: !!r.rhinoHd };
        });
    });
    for (const b of report.bindings) {
        assert(b.shp && b.page && b.material === 'HdSpriteMaterial' || b.vxl && b.vxlParts || b.rhino,
            `${b.name} has no live HD rendering binding: ${JSON.stringify(b)}`);
    }
    report.allocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView, units = d.sovietUnitsHd;
        const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])]
                .reduce((n, p) => n + p.bitmap.width * p.bitmap.height * 5 + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd).filter(([name]) => !units.families[name])
            .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
        return { terrain, environment, baseline, eager, demand: units.gpuBytes,
            total: terrain + environment + baseline + eager + units.gpuBytes,
            limit: d.terrainHd.budget, families: units.families, glError: d.renderer.renderer.getContext().getError() };
    });
    assert(report.allocation.total <= report.allocation.limit);
    assert.equal(report.allocation.glError, 0);
    if (density === 2) {
        assert.equal(report.allocation.limit, 512 * 1024 * 1024);
        assert(!Object.values(report.allocation.families).some(f => ['BUDGET_FALLBACK', 'FAILED'].includes(f.status)));
        assert(Object.values(report.allocation.families).filter(f => f.status === 'READY').every(f => f.density === 2));
    }
    // Actual native bindings and cameras, rather than catalog READY alone.
    for (const name of ['GAWEAP', 'NAWEAP', ...(edition === 'yr' ? ['YAWEAP'] : []), 'E1', 'E2', 'HTNK']) {
        const actor = report.bindings.find(b => b.name === name);
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile));
        }, actor.tile);
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(output, name + '.png') });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug, unit = window.__mixedActors.find(o => o.name === 'MTNK');
        window.__movingMixedUnit = unit;
        const target = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t) && !t.rampType
            && Math.abs(t.rx - unit.tile.rx) + Math.abs(t.ry - unit.tile.ry) > 4
            && Math.abs(t.rx - unit.tile.rx) + Math.abs(t.ry - unit.tile.ry) < 7
            && d.game.map.terrain.getPassableSpeed(t, unit.rules.speedType, false, false) > 0
            && !d.game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()));
        if (!target) throw Error('No legal mixed-unit move target');
        window.__mixedBeforeTile = [unit.tile.rx, unit.tile.ry];
        d.actionsApi.orderUnits([unit.id], 2, target.rx, target.ry);
    });
    await page.waitForFunction(() => {
        const u = window.__movingMixedUnit, before = window.__mixedBeforeTile;
        return u.tile.rx !== before[0] || u.tile.ry !== before[1];
    }, undefined, { timeout: 15000 });
    report.movement = await page.evaluate(() => ({ before: window.__mixedBeforeTile,
        after: [window.__movingMixedUnit.tile.rx, window.__movingMixedUnit.tile.ry],
        hd: !!window.__ra2debug.renderableManager.getRenderableByGameObject(window.__movingMixedUnit).unitVxlHd }));
    assert(report.movement.hd); assert.equal(report.errors.length, 0);
    report.status = 'PASS_NATIVE_MIXED_DENSITY';
    report.density = density;
    report.boundary = 'Legal controlled fixtures; live native render bindings and one native move. Not Windows performance, physical input, or complete roster/state acceptance.';
} catch (error) { failure = error; report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'mixed-result.json'), JSON.stringify(report, null, 2) + '\n'); await session.close(failure); }
console.log(report.status, report.bindings?.length, report.allocation?.total, '/', report.allocation?.limit);
