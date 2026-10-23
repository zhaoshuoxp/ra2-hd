import assert from 'node:assert/strict';
export async function validateAir(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.chopper = m.clear('SCHP', 7, { rx: m.base.tile.rx - 5, ry: m.base.tile.ry + 3 });
        d.actionsApi.orderUnits([m.chopper.id], 10);
    });
    await page.waitForFunction(() => window.mechanics.chopper.deployerTrait.isDeployed(), undefined, { timeout: 20000 });
    report.siege = await page.evaluate(() => {
        const d = window.__ra2debug, u = window.mechanics.chopper;
        return { weapon: u.attackTrait.selectDefaultWeapon(u).name, grounded: u.zone === 0, locked: u.moveTrait.isDisabled() };
    });
    assert.equal(report.siege.weapon, '160mm'); assert(report.siege.grounded && report.siege.locked);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        d.actionsApi.orderUnits([m.chopper.id], 0, m.chopper.tile.rx + 3, m.chopper.tile.ry);
    });
    await page.waitForFunction(() => !window.mechanics.chopper.deployerTrait.isDeployed() && !window.mechanics.chopper.moveTrait.isDisabled(), undefined, { timeout: 20000 });
    report.siege.undeployedToMove = true;
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        const worker = g.getConstructionWorker(m.enemy);
        const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 15 && worker.canPlaceAt('NAPOWR', t, { ignoreAdjacent: true }));
        [m.airTarget] = worker.placeAt('NAPOWR', tile);
        m.boris = m.clear('BORIS', 3, { rx: tile.rx + 7, ry: tile.ry });
        m.boris.invulnerableTrait.setActiveFor(5000, g.currentTick);
        d.actionsApi.orderUnits([m.boris.id], 2, m.airTarget.id);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().filter(u => u.name === 'BPLN').length === 2, undefined, { timeout: 20000 });
    report.airstrike = { planes: 2 };
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.mechanics.boris).plugins.some(p => p.line?.name === 'airstrike_designator'));
    report.airstrike.originalLineStyle = true;
    await page.waitForFunction(() => window.mechanics.airTarget.isDestroyed, undefined, { timeout: 45000 });
    report.airstrike.destroyedTarget = true;
    await page.waitForFunction(() => !window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'BPLN'), undefined, { timeout: 40000 });
    report.airstrike.returned = true;
    await page.waitForFunction(() => !window.__ra2debug.renderableManager.getRenderableByGameObject(window.mechanics.boris).plugins.some(p => p.line));
    report.airstrike.lineCleanedUp = true;
}
