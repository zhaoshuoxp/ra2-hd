import assert from 'node:assert/strict';

export async function validateTechBuildings(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        const worker = g.getConstructionWorker(d.localPlayer);
        const tiles = g.map.tiles.getAll().filter(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 25);
        const buildings = ['CATHOSP', 'CAMACH', 'CASLAB', 'YABRCK'].map(name => {
            const tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No legal fixture position for ${name}`);
            return worker.placeAt(name, tile)[0];
        });
        const infantry = m.clear('INIT', 3, m.base.tile), tank = m.clear('HTNK', 7, m.base.tile);
        infantry.attackTrait.setDisabled(true); tank.attackTrait.setDisabled(true);
        window.techBuildings = { buildings, infantry, tank, increments: [] };
        g.events.subscribe(e => {
            if (e.type === 44 && e.target.owner === d.localPlayer && e.target.name === 'DESO') window.techBuildings.reward = e.target;
        });
    });
    await page.waitForFunction(() => window.techBuildings.buildings.every(b => b.buildStatus === 1));
    report.techBuildings = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.techBuildings;
        f.infantry.healthTrait.health = 40; f.tank.healthTrait.health = 40;
        f.start = [f.infantry.healthTrait.getHitPoints(), f.tank.healthTrait.getHitPoints()];
        f.buildings[2].secretProduction = 'DESO';
        return { start: f.start, available: d.localPlayer.production.getAvailableObjects().some(r => r.name === 'DESO') };
    });
    assert.equal(report.techBuildings.available, true);
    await page.waitForFunction(() => {
        const f = window.techBuildings;
        return f.infantry.healthTrait.getHitPoints() > f.start[0] && f.tank.healthTrait.getHitPoints() > f.start[1];
    });
    report.techBuildings.healed = await page.evaluate(() => {
        const f = window.techBuildings;
        return [f.infantry.healthTrait.getHitPoints(), f.tank.healthTrait.getHitPoints()];
    });
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(2, 3, 'DESO', 1));
    await page.waitForFunction(() => window.techBuildings.reward?.isSpawned, undefined, { timeout: 40000 });
    report.techBuildings.reward = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, f = window.techBuildings;
        for (const b of f.buildings.slice(0, 3)) g.changeObjectOwner(b, window.mechanics.enemy);
        f.infantry.healthTrait.health = 40; f.tank.healthTrait.health = 40;
        f.lostAt = g.currentTick;
        return { name: f.reward.name, availableAfterLoss: d.localPlayer.production.getAvailableObjects().some(r => r.name === 'DESO') };
    });
    assert.equal(report.techBuildings.reward.name, 'DESO');
    assert.equal(report.techBuildings.reward.availableAfterLoss, false);
    await page.waitForFunction(() => window.__ra2debug.game.currentTick >= window.techBuildings.lostAt + 160);
    report.techBuildings.afterLoss = await page.evaluate(() => {
        const f = window.techBuildings;
        return [f.infantry.healthTrait.getHitPoints(), f.tank.healthTrait.getHitPoints()];
    });
    assert.deepEqual(report.techBuildings.afterLoss, report.techBuildings.start);
    report.techBuildings.fixture = 'Structures, damaged units, a DESO lab boon and ownership transfer supplied; native ticks heal and the ordinary paid infantry queue produces the foreign reward.';
}
