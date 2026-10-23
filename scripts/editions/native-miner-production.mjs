import assert from 'node:assert/strict';
export async function validateMinerProduction(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        const base = owner.getOwnedObjects().find(u => u.rules.constructionYard), worker = g.getConstructionWorker(owner);
        const tiles = g.map.tiles.getAll().filter(t => Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 20);
        const buildings = ['YAPOWR', 'YABRCK', 'YAREFN', 'YAWEAP'].map(name => {
            const tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No legal placement for ${name}`);
            return worker.placeAt(name, tile)[0];
        });
        window.productionMiner = { buildings, samples: [] };
        g.events.subscribe(e => {
            if (e.type === 44 && e.target.owner === owner && e.target.name === 'SMIN') window.productionMiner.unit = e.target;
        });
    });
    await page.waitForFunction(() => window.productionMiner.buildings.every(b => {
        while (b.replacedBy) b = b.replacedBy;
        return b.isSpawned && (b.isVehicle() || b.buildStatus === 1);
    }));
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(3, 7, 'SMIN', 1));
    await page.waitForFunction(() => !!window.productionMiner.unit, undefined, { timeout: 40000 });
    await page.waitForFunction(() => {
        const f = window.productionMiner, u = f.unit;
        f.samples.push({ tick: window.__ra2debug.game.currentTick, tile: [u.tile.rx, u.tile.ry], tasks: u.unitOrderTrait.getTasks().map(t => t.constructor.name), nextScan: u.slaveMinerTrait.nextScan });
        return u.replacedBy?.isSpawned && u.replacedBy.slaveMinerTrait.getSlaves().length === 5;
    }, undefined, { timeout: 60000, polling: 1000 });
    report.productionMiner = await page.evaluate(() => ({ name: window.productionMiner.unit.replacedBy.name, workers: window.productionMiner.unit.replacedBy.slaveMinerTrait.getSlaves().length, samples: window.productionMiner.samples }));
    assert.equal(report.productionMiner.name, 'YAREFN');
    assert.equal(report.productionMiner.workers, 5);
}
