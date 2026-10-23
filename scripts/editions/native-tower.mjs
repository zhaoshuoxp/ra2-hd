import assert from 'node:assert/strict';

export async function validateTower(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        for (const u of m.targets) if (!u.isDestroyed) g.destroyObject(u, { player: d.localPlayer }, true);
        const worker = g.getConstructionWorker(d.localPlayer);
        const tiles = g.map.tiles.getAll().filter(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 20);
        const buildings = ['YAPOWR', 'YAPSYT'].map(name => {
            const tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No legal tower fixture position for ${name}`);
            return worker.placeAt(name, tile)[0];
        });
        window.towerTest = { buildings, tower: buildings[1] };
    });
    await page.waitForFunction(() => window.towerTest.buildings.every(b => b.buildStatus === 1));
    await page.evaluate(() => {
        const m = window.mechanics, f = window.towerTest;
        f.victims = Array.from({ length: 3 }, (_, i) => {
            const u = m.clear('E2', 3, { rx: f.tower.tile.rx + 3 + i, ry: f.tower.tile.ry }, m.enemy);
            u.attackTrait.setDisabled(true); u.moveTrait.setDisabled(true);
            return u;
        });
    });
    await page.waitForFunction(() => window.towerTest.victims.every(u => u.owner === window.__ra2debug.localPlayer), undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.localPlayer.powerTrait.setBlackoutFor(150, d.game);
    });
    await page.waitForFunction(() => window.towerTest.tower.mindControllerTrait.getTargets().length === 0 &&
        window.towerTest.victims.every(u => u.owner === window.mechanics.enemy));
    report.tower = { powerLossReleasedVictims: true };
    await page.waitForFunction(() => window.towerTest.victims.every(u => u.owner === window.__ra2debug.localPlayer), undefined, { timeout: 20000 });
    report.tower.restoredPowerReacquiredVictims = true;
    report.tower.destroyReleasedVictims = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.towerTest;
        d.game.destroyObject(f.tower, { player: window.mechanics.enemy }, true);
        return f.victims.every(u => u.owner === window.mechanics.enemy);
    });
    assert(report.tower.destroyReleasedVictims);
    report.tower.fixture = 'Supplied legal power plant/tower and immobile victims; native target acquisition, temporary blackout, reacquisition and destruction cleanup.';
}
