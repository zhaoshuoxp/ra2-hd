import assert from 'node:assert/strict';
export async function validateSupport(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, m = window.mechanics, g = d.game;
        m.place = (name, owner = d.localPlayer) => {
            const worker = g.getConstructionWorker(owner);
            const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 18 && worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No placement for ${name}`);
            return worker.placeAt(name, tile)[0];
        };
        m.robot = m.clear('ROBO', 7, { rx: m.base.tile.rx - 5, ry: m.base.tile.ry });
    });
    await page.waitForFunction(() => !window.mechanics.robot.poweredUnitTrait.isOnline());
    report.robot = { offlineWithoutController: true };
    await page.evaluate(() => {
        const m = window.mechanics;
        Array.from({ length: 3 }, () => m.place('YAPOWR'));
        m.controller = m.place('GAROBO');
    });
    await page.waitForFunction(() => window.mechanics.robot.poweredUnitTrait.isOnline());
    report.robot.enabled = true;
    await page.evaluate(() => window.__ra2debug.localPlayer.powerTrait.setBlackoutFor(100, window.__ra2debug.game));
    await page.waitForFunction(() => !window.mechanics.robot.poweredUnitTrait.isOnline());
    await page.waitForFunction(() => window.mechanics.robot.poweredUnitTrait.isOnline());
    report.robot.recoveredAfterBlackout = true;
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        m.enemyPower = m.place('NAPOWR', m.enemy);
        m.robot.attackTrait.setDisabled(true);
        m.disc = m.clear('DISK', 7, { rx: m.enemyPower.tile.rx + 4, ry: m.enemyPower.tile.ry });
        window.drainTrace = [];
        const trait = m.disc.drainTrait;
        for (const name of ['start', 'stop']) {
            const original = trait[name];
            trait[name] = function(...args) {
                window.drainTrace.push({ name, tick: d.game.currentTick, target: this.target?.name, interrupted: this.interrupted,
                    moving: m.disc.moveTrait.isMoving(), current: m.disc.attackTrait.currentTarget?.obj?.name });
                return original.apply(this, args);
            };
        }
    });
    await page.waitForFunction(() => window.mechanics.enemyPower.buildStatus === 1);
    await page.evaluate(() => { const d = window.__ra2debug, m = window.mechanics; d.actionsApi.orderUnits([m.disc.id], 2, m.enemyPower.id); });
    await page.waitForFunction(() => window.mechanics.disc.drainTrait.getTarget() === window.mechanics.enemyPower, undefined, { timeout: 25000 });
    report.drain = await page.evaluate(() => ({ blackout: window.mechanics.enemy.powerTrait.isLowPower(), hp: window.mechanics.enemyPower.healthTrait.getHitPoints() }));
    assert(report.drain.blackout);
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.mechanics.disc).plugins.some(p => p.animation?.name === 'DISKRAY'));
    report.drain.originalAnimation = true;
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        d.game.destroyObject(m.disc, { player: m.enemy });
    });
    await page.waitForFunction(() => !window.mechanics.enemy.powerTrait.externalBlackouts.size);
    report.drain.releasedOnDeath = true;
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        m.enemyRefinery = m.place('NAREFN', m.enemy);
        m.moneyDisc = m.clear('DISK', 7, { rx: m.enemyRefinery.tile.rx + 4, ry: m.enemyRefinery.tile.ry });
        m.moneyDisc.attackTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.mechanics.enemyRefinery.buildStatus === 1);
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        for (const u of m.enemy.getOwnedObjects().filter(u => u.rules.harvester)) d.game.destroyObject(u, { player: m.enemy });
        m.moneyDisc.attackTrait.setDisabled(false);
        d.actionsApi.orderUnits([m.moneyDisc.id], 2, m.enemyRefinery.id);
    });
    await page.waitForFunction(() => window.mechanics.moneyDisc.drainTrait.getTarget() === window.mechanics.enemyRefinery, undefined, { timeout: 25000 });
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        m.cashBefore = [d.localPlayer.credits, m.enemy.credits];
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.credits > window.mechanics.cashBefore[0], undefined, { timeout: 10000 });
    report.drain.money = await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        const result = { received: d.localPlayer.credits - m.cashBefore[0], lost: m.cashBefore[1] - m.enemy.credits };
        d.actionsApi.orderUnits([m.moneyDisc.id], 11);
        m.moneyDisc.attackTrait.setDisabled(true);
        return result;
    });
    assert(report.drain.money.received > 0);
    assert.equal(report.drain.money.received, report.drain.money.lost);
    assert.equal(report.drain.money.received % 30, 0);
    await page.waitForFunction(() => !window.mechanics.moneyDisc.drainTrait.getTarget());
    report.drain.releasedOnStop = true;
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        const allTiles = d.game.map.tiles.getAll();
        const site = allTiles.find(t => d.game.map.isWithinBounds(t) &&
            Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 40 &&
            allTiles.filter(n => d.game.map.isWithinBounds(n) && Math.hypot(n.rx - t.rx, n.ry - t.ry) < 4 && d.game.map.terrain.getPassableSpeed(n, d.game.rules.getObject("CAOS", 7).speedType, false, false) > 0).length > 35 &&
            d.game.map.terrain.getPassableSpeed(t, d.game.rules.getObject("CAOS", 7).speedType, false, false) > 0 &&
            d.game.getWorld().getAllObjects().every(u => !u.isTechno() || u.isDestroyed || Math.hypot(u.tile.rx - t.rx, u.tile.ry - t.ry) > 14));
        if (!site) throw new Error('No isolated chaos fixture location');
        const nearby = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) && Math.hypot(t.rx - site.rx, t.ry - site.ry) < 6);
        d.game.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAround(site, 12);
        d.game.mapShroudTrait.getPlayerShroud(m.enemy).revealAround(site, 12);
        m.chaos = m.clear('CAOS', 7, site, d.localPlayer, nearby);
        m.victim = m.clear('HTNK', 7, { rx: m.chaos.tile.rx + 2, ry: m.chaos.tile.ry }, m.enemy, nearby);
        m.friend = m.clear('HTNK', 7, { rx: m.victim.tile.rx + 2, ry: m.victim.tile.ry }, m.enemy, nearby);
        m.victim.moveTrait.setDisabled(true); m.friend.moveTrait.setDisabled(true); m.friend.attackTrait.setDisabled(true);
        m.friendHp = m.friend.healthTrait.getHitPoints();
        d.actionsApi.orderUnits([m.chaos.id], 2, m.victim.id);
    });
    await page.waitForFunction(() => window.mechanics.victim.berserkTrait.isActive(), undefined, { timeout: 25000 });
    report.chaos = { activated: true };
    await page.evaluate(() => {
        const m = window.mechanics, d = window.__ra2debug;
        if (!m.chaos.isDestroyed) d.game.destroyObject(m.chaos, { player: d.localPlayer });
    });
    await page.waitForFunction(() => window.mechanics.friend.healthTrait.getHitPoints() < window.mechanics.friendHp, undefined, { timeout: 12000 });
    report.chaos.attackedOwnAlly = true;
    await page.waitForFunction(() => !window.mechanics.victim.berserkTrait.isActive(), undefined, { timeout: 15000 });
    report.chaos.expired = true;
}
