import assert from 'node:assert/strict';
export async function validatePowers(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer;
        const enemy = g.getCombatants().find(x => x !== p), base = p.getOwnedObjects().find(u => u.name === 'YACNST');
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 22);
        const place = name => {
            const worker = g.getConstructionWorker(p), tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No placement for ${name}`);
            const [b] = worker.placeAt(name, tile); return b;
        };
        const lab = place('YATECH');
        place('YAPPET'); place('YAGNTC'); place('NAPSIS'); place('NARADR');
        Array.from({ length: 8 }, () => place('YAPOWR'));
        window.powers = { lab, enemy, base, place };
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.superWeaponsTrait.getAll().length >= 5, undefined, { timeout: 15000 });
    report.powers = await page.evaluate(() => ({ grants: window.__ra2debug.localPlayer.superWeaponsTrait.getAll().map(s => s.name) }));
    for (const expected of ['ForceShieldSpecial', 'PsychicDominatorSpecial', 'GeneticConverterSpecial', 'PsychicRevealSpecial', 'SpyPlaneSpecial']) assert(report.powers.grants.includes(expected));
    await page.evaluate(() => {
        const d = window.__ra2debug;
        for (const sw of d.localPlayer.superWeaponsTrait.getAll()) { sw.chargeTicks = 0; sw.status = 2; }
        d.actionsApi.activateSuperWeapon(10, window.powers.lab.tile);
    });
    await page.waitForFunction(() => window.powers.lab.invulnerableTrait.isActive());
    report.powers.shield = await page.evaluate(() => ({ protected: window.powers.lab.invulnerableTrait.isActive(), blackout: window.__ra2debug.localPlayer.powerTrait.getBlackoutDuration() }));
    assert(report.powers.shield.blackout > 900);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, f = window.powers;
        p.powerTrait.setBlackoutFor(0, g);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && Math.hypot(t.rx - f.base.tile.rx, t.ry - f.base.tile.ry) < 20);
        const clear = tiles.find(t => !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()) && g.map.terrain.getPassableSpeed(t, g.rules.getObject('E2', 3).speedType, true, false) > 0);
        const target = g.createUnitForPlayer(g.rules.getObject('E2', 3), f.enemy); g.spawnObject(target, clear);
        target.moveTrait.setDisabled(true); target.attackTrait.setDisabled(true);
        f.mutatee = target;
        const sw = p.superWeaponsTrait.get('GeneticConverterSpecial'); sw.chargeTicks = 0; sw.status = 2;
        d.actionsApi.activateSuperWeapon(9, clear);
    });
    await page.waitForFunction(() => window.powers.mutatee.isDestroyed);
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === "BRUTE" && u.tile === window.powers.mutatee.tile));
    report.powers.mutation = await page.evaluate(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'BRUTE' && u.tile === window.powers.mutatee.tile));
    assert(report.powers.mutation);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, f = window.powers;
        const tile = f.mutatee.tile, target = g.createUnitForPlayer(g.rules.getObject('E2', 3), f.enemy);
        target.position.subCell = 1; g.spawnObject(target, tile); target.moveTrait.setDisabled(true); target.attackTrait.setDisabled(true);
        f.capturee = target;
        const sw = d.localPlayer.superWeaponsTrait.get('PsychicDominatorSpecial'); sw.chargeTicks = 0; sw.status = 2;
        d.actionsApi.activateSuperWeapon(7, tile);
    });
    await page.waitForFunction(() => window.powers.capturee.owner === window.__ra2debug.localPlayer, undefined, { timeout: 15000 });
    report.powers.dominator = await page.evaluate(() => ({ alive: !window.powers.capturee.isDestroyed, permanent: window.powers.capturee.mindControllableTrait.isActive() }));
    assert(report.powers.dominator.alive && report.powers.dominator.permanent);
    await page.evaluate(() => {
        const d = window.__ra2debug, p = window.powers;
        const sw = d.localPlayer.superWeaponsTrait.get('SpyPlaneSpecial'); sw.chargeTicks = 0; sw.status = 2;
        d.actionsApi.activateSuperWeapon(8, p.base.tile);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'SPYP'), undefined, { timeout: 15000 });
    report.powers.spyPlane = true;
    report.powers.reveal = await page.evaluate(async () => {
        const d = window.__ra2debug, g = d.game, shroud = g.mapShroudTrait.getPlayerShroud(d.localPlayer);
        const tile = g.map.tiles.getAll().find(t => g.map.isWithinBounds(t) && shroud.isShrouded(t, 0));
        if (!tile) throw new Error('No shrouded reveal target');
        const sw = d.localPlayer.superWeaponsTrait.get('PsychicRevealSpecial'); sw.chargeTicks = 0; sw.status = 2;
        d.actionsApi.activateSuperWeapon(11, tile);
        await new Promise(r => setTimeout(r, 500));
        return !shroud.isShrouded(tile, 0);
    });
    assert(report.powers.reveal);
    await page.waitForFunction(() => !window.__ra2debug.localPlayer.getOwnedObjects().some(u => u.name === 'SPYP'), undefined, { timeout: 60000 });
    report.powers.spyPlaneCompletedFlyby = true;
    await page.waitForFunction(() => !window.powers.lab.invulnerableTrait.isActive(), undefined, { timeout: 30000 });
    report.powers.shieldExpired = true;
}
