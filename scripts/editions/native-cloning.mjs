import assert from 'node:assert/strict';
export async function validateCloning(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        const worker = g.getConstructionWorker(d.localPlayer);
        const place = name => {
            const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 18 && worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No placement for ${name}`);
            return worker.placeAt(name, tile)[0];
        };
        Array.from({ length: 3 }, () => place('YAPOWR'));
        window.cloning = { barracks: place('YABRCK'), vats: place('NACLON'), grinder: place('YAGRND'), units: [], factories: [] };
        g.events.subscribe(e => { if (e.type === 44 && e.target.owner === d.localPlayer && e.target.name === 'INIT') { window.cloning.units.push(e.target); window.cloning.factories.push(e.factory?.name); } });
    });
    await page.waitForFunction(() => ['barracks', 'vats', 'grinder'].every(k => window.cloning[k].buildStatus === 1));
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'INIT', 1));
    await page.waitForFunction(() => window.cloning.units.length === 2, undefined, { timeout: 30000 });
    report.cloning = await page.evaluate(() => ({ count: window.cloning.units.length, ids: window.cloning.units.map(u => u.id), factories: window.cloning.factories }));
    assert.equal(new Set(report.cloning.ids).size, 2);
    assert.deepEqual(report.cloning.factories.sort(), ['NACLON', 'YABRCK']);
    await page.waitForFunction(() => window.cloning.units.every(u => u.unitOrderTrait.isIdle()), undefined, { timeout: 15000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.cloning;
        f.before = d.localPlayer.credits;
        f.refund = d.game.sellTrait.computeRefundValue(f.units[0]);
        d.actionsApi.orderUnits([f.units[0].id], 8, f.grinder.id);
    });
    await page.waitForFunction(() => !window.cloning.units[0].isSpawned, undefined, { timeout: 20000 });
    report.grinder = await page.evaluate(() => ({ expected: window.cloning.refund, credits: window.__ra2debug.localPlayer.credits - window.cloning.before }));
    assert.equal(report.grinder.credits, report.grinder.expected);
    assert(report.grinder.credits > 0);
}
