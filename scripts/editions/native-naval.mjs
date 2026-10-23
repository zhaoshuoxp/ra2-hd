import assert from 'node:assert/strict';
export async function validateNaval(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        const rules = g.rules.getObject('BSUB', 7), worker = g.getConstructionWorker(m.enemy);
        let water, land;
        for (const tile of tiles) {
            if (g.map.getTileZone(tile) !== 2 || g.map.terrain.getPassableSpeed(tile, rules.speedType, false, false) <= 0) continue;
            const target = tiles.find(t => Math.hypot(t.rx - tile.rx, t.ry - tile.ry) >= 5 && Math.hypot(t.rx - tile.rx, t.ry - tile.ry) <= 10 && worker.canPlaceAt('NAPOWR', t, { ignoreAdjacent: true }));
            if (target) { water = tile; land = target; break; }
        }
        if (!water) throw new Error('No coastal missile fixture available');
        const [target] = worker.placeAt('NAPOWR', land);
        m.missileTarget = target;
        const sub = g.createUnitForPlayer(rules, d.localPlayer); g.spawnObject(sub, water); m.sub = sub;
        g.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAround(land, 20);
        m.missiles = [];
        g.events.subscribe(e => { if (e.type === 0 && e.target?.name === 'CMISL') m.missiles.push(e.target.id); });
    });
    await page.waitForFunction(() => window.mechanics.missileTarget.buildStatus === 1);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        m.targetHp = m.missileTarget.healthTrait.getHitPoints();
        d.actionsApi.orderUnits([m.sub.id], 2, m.missileTarget.id);
    });
    await page.waitForFunction(() => window.__ra2debug.game.world.getAllObjects().some(o => o.name === 'CMISL' && o.isSpawned), undefined, { timeout: 20000 });
    report.boomer = { launched: true };
    await page.waitForFunction(() => window.mechanics.missileTarget.healthTrait.getHitPoints() < window.mechanics.targetHp, undefined, { timeout: 25000 });
    report.boomer.damage = await page.evaluate(() => window.mechanics.targetHp - window.mechanics.missileTarget.healthTrait.getHitPoints());
    assert(report.boomer.damage > 0);
}
