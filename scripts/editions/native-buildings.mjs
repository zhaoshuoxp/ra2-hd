import assert from 'node:assert/strict';
export async function validateBuildings(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, m = window.mechanics, g = d.game;
        m.place = name => {
            const worker = g.getConstructionWorker(d.localPlayer);
            const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 18 && worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No placement for ${name}`);
            return worker.placeAt(name, tile)[0];
        };
        m.bunkerBuilding = m.place('NATBNK');
        m.bunkerTank = m.clear('LTNK', 7, { rx: m.bunkerBuilding.tile.rx + 4, ry: m.bunkerBuilding.tile.ry });
        m.bunkerRange = m.bunkerTank.primaryWeapon.range;
    });
    await page.waitForFunction(() => window.mechanics.bunkerBuilding.buildStatus === 1);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.bunkerTank.id], 8, window.mechanics.bunkerBuilding.id));
    await page.waitForFunction(() => window.mechanics.bunkerBuilding.bunkerTrait.unit === window.mechanics.bunkerTank, undefined, { timeout: 20000 });
    report.bunker = await page.evaluate(() => {
        const m = window.mechanics;
        return { rangeBonus: m.bunkerTank.primaryWeapon.range - m.bunkerRange, unitVisible: m.bunkerTank.isSpawned, movementLocked: m.bunkerTank.moveTrait.isDisabled() };
    });
    assert.equal(report.bunker.rangeBonus, 2);
    assert(report.bunker.unitVisible && report.bunker.movementLocked);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.bunkerBuilding.id], 10));
    await page.waitForFunction(() => !window.mechanics.bunkerTank.bunker && !window.mechanics.bunkerTank.moveTrait.isDisabled());
    report.bunker.evacuated = true;
    await page.evaluate(() => {
        const m = window.mechanics;
        Array.from({ length: 4 }, () => m.place('YAPOWR'));
        m.plant = m.place('NAINDP');
    });
    await page.waitForFunction(() => window.mechanics.plant.buildStatus === 1);
    report.plant = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer;
        const vehicle = g.rules.getObject('HTNK', 7), infantry = g.rules.getObject('E2', 3);
        return { vehicle: g.sellTrait.computePurchaseValue(vehicle, p), original: vehicle.cost, infantry: g.sellTrait.computePurchaseValue(infantry, p), infantryOriginal: infantry.cost };
    });
    assert.equal(report.plant.vehicle, Math.floor(report.plant.original * .75));
    assert.equal(report.plant.infantry, report.plant.infantryOriginal);
    await page.evaluate(() => window.__ra2debug.localPlayer.powerTrait.setBlackoutFor(100, window.__ra2debug.game));
    report.plant.offlineCost = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.sellTrait.computePurchaseValue(d.game.rules.getObject('HTNK', 7), d.localPlayer);
    });
    assert.equal(report.plant.offlineCost, report.plant.original);
}
