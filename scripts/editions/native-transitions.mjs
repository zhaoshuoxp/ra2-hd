import assert from 'node:assert/strict';

export async function validateTransitions(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        const water = tiles.find(t => g.map.getTileZone(t) === 2 && !g.map.tileOccupation.getBridgeOnTile(t) && !g.map.getGroundObjectsOnTile(t).length);
        if (!water) throw new Error('Missing open water for robot transition');
        const robot = g.createUnitForPlayer(g.rules.getObject('ROBO', 7), d.localPlayer);
        g.spawnObject(robot, water);
        m.offlineWaterRobot = robot;
    });
    await page.waitForFunction(() => window.mechanics.offlineWaterRobot.isDestroyed);
    report.transitions = { offlineRobotSinks: true };
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        const water = tiles.find(t => g.map.getTileZone(t) === 2 && !g.map.tileOccupation.getBridgeOnTile(t) && !g.map.getGroundObjectsOnTile(t).length);
        const source = m.clear('TELE', 7, m.base.tile);
        source.attackTrait.setDisabled(true);
        const victim = g.createUnitForPlayer(g.rules.getObject('HTNK', 7), m.enemy);
        victim.position.tileElevation = 6;
        g.spawnObject(victim, water);
        victim.magneticLiftTrait.lift(source, source.primaryWeapon, g);
        victim.magneticLiftTrait.release();
        m.fallingWaterTank = victim;
        m.fallingSource = source;
    });
    await page.waitForFunction(() => window.mechanics.fallingWaterTank.isDestroyed);
    report.transitions.magneticWaterLandingSinks = true;
    report.transitions.collision = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        const target = m.clear('HTNK', 7, { rx: m.base.tile.rx + 5, ry: m.base.tile.ry }, m.enemy);
        target.attackTrait.setDisabled(true); target.moveTrait.setDisabled(true);
        const victim = g.createUnitForPlayer(g.rules.getObject('LTNK', 7), d.localPlayer);
        victim.position.tileElevation = 6;
        g.spawnObject(victim, target.tile);
        victim.magneticLiftTrait.lift(m.fallingSource, m.fallingSource.primaryWeapon, g);
        victim.magneticLiftTrait.release();
        m.collisionVictim = victim; m.collisionTarget = target;
        const settings = g.rules.getIni().getSection('CombatDamage');
        const strength = settings.getBool('CurrentStrengthDamage') ? victim.healthTrait.getHitPoints() : victim.healthTrait.maxHitPoints;
        return { hp: target.healthTrait.getHitPoints(), expectedDamage: Math.floor(strength * settings.getNumber('FallingDamageMultiplier', 1)) };
    });
    await page.waitForFunction(() => window.mechanics.collisionVictim.isDestroyed);
    report.transitions.collision.remainingHp = await page.evaluate(() => window.mechanics.collisionTarget.healthTrait.getHitPoints());
    assert.equal(report.transitions.collision.remainingHp, Math.max(0, report.transitions.collision.hp - report.transitions.collision.expectedDamage));
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        const gun = m.clear('YTNK', 7, { rx: m.base.tile.rx - 4, ry: m.base.tile.ry + 3 });
        const target = m.clear('ZEP', 7, { rx: gun.tile.rx + 4, ry: gun.tile.ry }, m.enemy);
        target.zone = 1; target.position.tileElevation = 6;
        target.attackTrait.setDisabled(true); target.moveTrait.setDisabled(true);
        target.invulnerableTrait.setActiveFor(5000, g.currentTick);
        gun.veteranTrait.promote(2, g);
        m.eliteGun = gun; m.airDummy = target; m.aaShots = [];
        g.events.subscribe(e => { if (e.type === 2 && e.gameObject === gun) m.aaShots.push(e.weapon.name); });
        d.actionsApi.orderUnits([gun.id], 2, target.id);
    });
    await page.waitForFunction(() => window.mechanics.eliteGun.armedTrait.getGattlingStage() === 2 && window.mechanics.aaShots.includes('AAGattling3E'), undefined, { timeout: 25000 });
    report.transitions.eliteAirWeapons = await page.evaluate(() => [...new Set(window.mechanics.aaShots)]);
    assert.deepEqual(report.transitions.eliteAirWeapons, ['AAGattlingE', 'AAGattling2E', 'AAGattling3E']);
    report.transitions.fixtureNote = 'Units and selected transition states supplied; damage, falling, weapon selection and cleanup run through native ticks.';
}
