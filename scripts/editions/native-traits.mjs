import assert from 'node:assert/strict';
export async function validateTraits(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, m = window.mechanics;
        const gun = m.clear('YTNK', 7, { rx: m.base.tile.rx - 5, ry: m.base.tile.ry + 3 });
        const target = m.clear('SMCV', 7, { rx: gun.tile.rx + 4, ry: gun.tile.ry }, m.enemy);
        target.attackTrait?.setDisabled(true); target.moveTrait.setDisabled(true);
        // A damage-immune fixture keeps the continuous-fire target alive across all stages.
        target.invulnerableTrait.setActiveFor(5000, d.game.currentTick);
        m.gun = gun; m.gunTarget = target;
        d.actionsApi.orderUnits([gun.id], 2, target.id);
    });
    await page.waitForFunction(() => window.mechanics.gun.armedTrait.getGattlingStage() === 2, undefined, { timeout: 20000 });
    report.gattling = await page.evaluate(() => ({ primary: window.mechanics.gun.primaryWeapon.name, secondary: window.mechanics.gun.secondaryWeapon.name, heat: window.mechanics.gun.armedTrait.gattlingHeat }));
    assert.equal(report.gattling.primary, 'AGGattling3');
    assert.equal(report.gattling.secondary, 'AAGattling3');
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        d.actionsApi.orderUnits([m.gun.id], 11); m.gun.attackTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.mechanics.gun.armedTrait.getGattlingStage() === 0);
    report.gattling.cooled = true;
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics, g = d.game;
        const worker = g.getConstructionWorker(d.localPlayer);
        const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 12 && worker.canPlaceAt('YAPOWR', t, { ignoreAdjacent: true }));
        const [b] = worker.placeAt('YAPOWR', tile);
        const u = m.clear('INIT', 3, { rx: tile.rx + 3, ry: tile.ry });
        m.reactor = b; m.occupant = u;
    });
    await page.waitForFunction(() => window.mechanics.reactor.buildStatus === 1);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        m.powerBefore = d.localPlayer.powerTrait.debugGetState().power;
        d.actionsApi.orderUnits([m.occupant.id], 8, m.reactor.id);
    });
    await page.waitForFunction(() => window.mechanics.reactor.absorberTrait.units.length === 1, undefined, { timeout: 15000 });
    report.reactor = await page.evaluate(() => ({ extra: window.__ra2debug.localPlayer.powerTrait.debugGetState().power - window.mechanics.powerBefore, hidden: !window.mechanics.occupant.isSpawned }));
    assert.equal(report.reactor.extra, 100);
    assert(report.reactor.hidden);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.reactor.id], 10));
    await page.waitForFunction(() => window.mechanics.occupant.isSpawned, undefined, { timeout: 15000 });
    report.reactor.evacuated = await page.evaluate(() => window.mechanics.reactor.owner === window.__ra2debug.localPlayer && window.mechanics.occupant.owner === window.__ra2debug.localPlayer);
    assert(report.reactor.evacuated);
    report.reactor.emptyAnimation = await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        const renderable = d.renderableManager.getRenderableByGameObject(m.reactor);
        return renderable.animObjects.get(2).map(a => a.get3DObject().visible);
    });
    assert.deepEqual(report.reactor.emptyAnimation.slice(0, 2), [true, false]);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.occupant.id], 8, window.mechanics.reactor.id));
    await page.waitForFunction(() => window.mechanics.reactor.absorberTrait.units.length === 1);
    await page.waitForFunction(() => {
        const d = window.__ra2debug, m = window.mechanics;
        const r = d.renderableManager.getRenderableByGameObject(m.reactor);
        return !r.animObjects.get(2)[0].get3DObject().visible && r.animObjects.get(2)[1].get3DObject().visible;
    });
    report.reactor.occupiedAnimation = true;
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        d.game.destroyObject(m.reactor, { player: m.enemy });
    });
    await page.waitForFunction(() => window.mechanics.occupant.isSpawned && !window.mechanics.occupant.isDestroyed);
    report.reactor.releasedOnDestruction = true;
}
