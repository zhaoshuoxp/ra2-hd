import assert from 'node:assert/strict';

export async function validateBridges(page, report) {
    report.bridge = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        const tile = g.map.tiles.getAll().find(t => {
            const b = g.map.tileOccupation.getBridgeOnTile(t);
            return b && b.isHighBridge() && !g.map.getGroundObjectsOnTile(t).some(u => u.isTechno());
        });
        if (!tile) throw new Error('This scenario needs an unoccupied original high bridge');
        const bridge = g.map.tileOccupation.getBridgeOnTile(tile);
        const tank = g.createUnitForPlayer(g.rules.getObject('HTNK', 7), d.localPlayer);
        tank.position.tileElevation = bridge.tileElevation + 6;
        g.spawnObject(tank, tile);
        const source = m.clear('TELE', 7, m.base.tile);
        tank.magneticLiftTrait.lift(source, source.primaryWeapon, g);
        tank.magneticLiftTrait.release();
        m.bridgeTank = tank; m.bridgeTile = tile; m.bridgeElevation = bridge.tileElevation;
        return { tile: [tile.rx, tile.ry], deck: bridge.tileElevation };
    });
    await page.waitForFunction(() => !window.mechanics.bridgeTank.magneticLiftTrait.isActive());
    report.bridge.landing = await page.evaluate(() => {
        const m = window.mechanics, tank = m.bridgeTank;
        return { alive: !tank.isDestroyed, onBridge: tank.onBridge, height: tank.tileElevation, zone: tank.zone, mobile: !tank.moveTrait.isDisabled() };
    });
    assert.deepEqual(report.bridge.landing, { alive: true, onBridge: true, height: report.bridge.deck, zone: 0, mobile: true });
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        g.destroyObject(m.bridgeTank, { player: d.localPlayer });
        const robot = g.createUnitForPlayer(g.rules.getObject('ROBO', 7), d.localPlayer);
        robot.onBridge = true; robot.position.tileElevation = m.bridgeElevation;
        g.spawnObject(robot, m.bridgeTile);
        m.bridgeRobot = robot; m.bridgeTick = g.currentTick;
    });
    await page.waitForFunction(() => window.__ra2debug.game.currentTick >= window.mechanics.bridgeTick + 90);
    report.bridge.robot = await page.evaluate(() => ({ alive: !window.mechanics.bridgeRobot.isDestroyed,
        onBridge: window.mechanics.bridgeRobot.onBridge, offline: !window.mechanics.bridgeRobot.poweredUnitTrait.isOnline() }));
    assert.deepEqual(report.bridge.robot, { alive: true, onBridge: true, offline: true });
    report.bridge.fixture = 'Supplied falling tank and unpowered robot on an original map high bridge; native landing and powered-unit ticks.';
}
