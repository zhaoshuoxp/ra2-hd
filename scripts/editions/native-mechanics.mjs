import assert from 'node:assert/strict';
export async function validateMechanics(page, report) {
    report.fixtureIsolation = 'AI decisions paused for deterministic mechanism fixtures; AI and natural matches run separately';
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
        const enemy = g.getCombatants().find(p => p !== owner), base = owner.getOwnedObjects().find(u => u.name === 'YACNST');
        g.mapShroudTrait.getPlayerShroud(owner).revealAround(base.tile, 25);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 20);
        const clear = (name, type, desired, player = owner, searchTiles = tiles) => {
            const rules = g.rules.getObject(name, type);
            const tile = searchTiles.filter(t => g.map.terrain.getPassableSpeed(t, rules.speedType, type === 3, false) > 0 && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.hypot(a.rx - desired.rx, a.ry - desired.ry) - Math.hypot(b.rx - desired.rx, b.ry - desired.ry))[0];
            if (!tile) throw new Error(`No clear fixture tile for ${name}`);
            const u = g.createUnitForPlayer(rules, player); g.spawnObject(u, tile); return u;
        };
        const quiet = () => {
            for (const unit of g.getWorld().getAllObjects()) {
                if (unit.isUnit()) { unit.attackTrait?.setDisabled(true); unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks(); }
            }
        };
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        quiet();
        window.mechanics = { clear, enemy, base, quiet };
        const magnet = clear('TELE', 7, { rx: base.tile.rx - 7, ry: base.tile.ry + 3 });
        const tank = clear('HTNK', 7, { rx: magnet.tile.rx, ry: magnet.tile.ry + 8 }, enemy);
        tank.attackTrait.setDisabled(true); tank.moveTrait.setDisabled(true);
        Object.assign(window.mechanics, { magnet, tank, start: { x: tank.tile.rx, y: tank.tile.ry, hp: tank.healthTrait.getHitPoints() } });
        d.actionsApi.orderUnits([magnet.id], 2, tank.id);
    });
    await page.waitForFunction(() => window.mechanics.tank.magneticLiftTrait?.isActive() && window.mechanics.tank.tileElevation > 1, undefined, { timeout: 20000 });
    report.magnet = await page.evaluate(() => ({ height: window.mechanics.tank.tileElevation, zone: window.mechanics.tank.zone, hp: window.mechanics.tank.healthTrait.getHitPoints(), initial: window.mechanics.start }));
    assert.equal(report.magnet.hp, report.magnet.initial.hp, 'MagneticBeam damage is not conventional damage');
    await page.waitForFunction(() => {
        const m = window.mechanics; return Math.hypot(m.tank.tile.rx - m.start.x, m.tank.tile.ry - m.start.y) >= 1;
    }, undefined, { timeout: 20000 });
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.magnet.id], 11));
    await page.waitForFunction(() => !window.mechanics.tank.magneticLiftTrait.isActive(), undefined, { timeout: 20000 });
    report.magnet.landing = await page.evaluate(() => ({ destroyed: window.mechanics.tank.isDestroyed, height: window.mechanics.tank.tileElevation, zone: window.mechanics.tank.zone }));
    assert.equal(report.magnet.landing.height, 0);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        d.game.destroyObject(m.magnet, { player: d.localPlayer });
        if (!m.tank.isDestroyed) d.game.destroyObject(m.tank, { player: d.localPlayer });
        const master = m.clear('MIND', 7, { rx: m.base.tile.rx - 5, ry: m.base.tile.ry + 4 });
        const targets = Array.from({ length: 4 }, (_, i) => m.clear('E2', 3, { rx: master.tile.rx + 2 + i, ry: master.tile.ry }, m.enemy));
        targets.forEach(t => { t.attackTrait.setDisabled(true); t.moveTrait.setDisabled(true); });
        Object.assign(m, { master, targets });
    });
    await page.waitForFunction(() => window.mechanics.master.mindControllerTrait.getTargets().length === 4, undefined, { timeout: 25000 });
    await page.waitForFunction(() => window.mechanics.master.healthTrait.getHitPoints() < window.mechanics.master.rules.strength, undefined, { timeout: 10000 });
    report.control = await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        const count = m.master.mindControllerTrait.getTargets().length, hp = m.master.healthTrait.getHitPoints();
        d.game.destroyObject(m.master, { player: m.enemy });
        return { count, hp, restored: m.targets.every(u => u.owner === m.enemy && !u.mindControllableTrait.isActive()) };
    });
    assert.equal(report.control.restored, true);
}
