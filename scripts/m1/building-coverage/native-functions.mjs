import assert from 'node:assert/strict';

export async function validateNewBuildingFunctions(page, report) {
    report.newBuildingFunctions = { fixture: 'Controlled actors; unchanged retail costs, power, enter/fire/exit/destruction orders' };
    const result = report.newBuildingFunctions;
    result.plant = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, plant = window.coverageActors.NAINDP;
        if (!plant) throw Error('Industrial Plant fixture missing');
        return ['HTNK', 'E2', 'ZEP'].map((id, i) => {
            const rules = g.rules.getObject(id, [7, 3, 7][i]);
            return { id, actual: g.sellTrait.computePurchaseValue(rules, p), original: rules.cost,
                factor: plant.rules.productionCostBonuses[p.production.getQueueTypeForObject(rules)] };
        });
    });
    for (const row of result.plant) assert.equal(row.actual, Math.floor(row.original * row.factor), row.id);
    await page.evaluate(() => window.__ra2debug.localPlayer.powerTrait.setBlackoutFor(60, window.__ra2debug.game));
    result.offlineCost = await page.evaluate(() => {
        const d = window.__ra2debug, rules = d.game.rules.getObject('HTNK', 7);
        return { cost: d.game.sellTrait.computePurchaseValue(rules, d.localPlayer), original: rules.cost };
    });
    assert.equal(result.offlineCost.cost, result.offlineCost.original);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, b = window.coverageActors.NABNKR;
        const enemy = g.getCombatants().find(p => p !== d.localPlayer);
        const spawn = (id, type, player, distance) => {
            const rules = g.rules.getObject(id, type);
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && t.z === b.tile.z
                && g.map.terrain.getPassableSpeed(t, rules.speedType, type === 3, false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, c) => Math.hypot(a.rx - b.tile.rx - distance, a.ry - b.tile.ry)
                    - Math.hypot(c.rx - b.tile.rx - distance, c.ry - b.tile.ry))[0];
            const u = g.createUnitForPlayer(rules, player); g.spawnObject(u, tile); return u;
        };
        const occupants = [spawn('E2', 3, d.localPlayer, 3), spawn('E2', 3, d.localPlayer, 4)];
        occupants.forEach(u => u.attackTrait.setDisabled(true));
        window.bunkerFixture = { b, occupants, spawn, enemy, fired: [], owner: b.owner.name };
        g.events.subscribe(e => { if (e.type === 2 && e.gameObject === b) window.bunkerFixture.fired.push(e.weapon.name); });
        d.actionsApi.orderUnits(occupants.map(u => u.id), 8, b.id);
    });
    await page.waitForFunction(() => window.bunkerFixture.b.garrisonTrait.units.length === 2, undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const f = window.bunkerFixture, g = window.__ra2debug.game;
        f.target = f.spawn('HTNK', 7, f.enemy, 4);
        f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
        f.target.invulnerableTrait.setActiveFor(2000, g.currentTick);
    });
    await page.waitForFunction(() => window.bunkerFixture.fired.length > 0, undefined, { timeout: 15000 });
    result.bunker = await page.evaluate(() => {
        const f = window.bunkerFixture, r = window.__ra2debug.renderableManager.getRenderableByGameObject(f.b);
        return { occupants: f.b.garrisonTrait.units.length, fired: [...new Set(f.fired)],
            occupiedFrame: r.mainObj.builder.getFrame(), hd: !!r.mainObj.builder.hdOverride };
    });
    assert(result.bunker.hd);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.bunkerFixture.b.id], 10));
    await page.waitForFunction(() => window.bunkerFixture.b.garrisonTrait.units.length === 0);
    result.bunker.exit = await page.evaluate(() => ({ alive: window.bunkerFixture.occupants.every(u => u.isSpawned && !u.isDestroyed),
        owner: window.bunkerFixture.b.owner.name, initialOwner: window.bunkerFixture.owner }));
    assert(result.bunker.exit.alive);
    assert.equal(result.bunker.exit.owner, result.bunker.exit.initialOwner, 'Built military bunker retains its owner after evacuation');
    await page.evaluate(() => {
        const f = window.bunkerFixture;
        window.__ra2debug.actionsApi.orderUnits(f.occupants.map(u => u.id), 8, f.b.id);
    });
    await page.waitForFunction(() => window.bunkerFixture.b.garrisonTrait.units.length === 2, undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const f = window.bunkerFixture;
        window.__ra2debug.game.destroyObject(f.b, { player: f.enemy });
    });
    await page.waitForFunction(() => window.bunkerFixture.b.isDestroyed);
    result.bunker.destroyed = await page.evaluate(() => ({ occupantsEvacuated: window.bunkerFixture.b.garrisonTrait.units.length === 0,
        survivors: window.bunkerFixture.occupants.filter(u => u.isSpawned && !u.isDestroyed).length }));
    assert(result.bunker.destroyed.occupantsEvacuated);
    result.status = 'PASS_INDUSTRIAL_COST_POWER_AND_BUNKER_LIFECYCLE';
}
