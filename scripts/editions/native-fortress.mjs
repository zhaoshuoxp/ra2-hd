import assert from 'node:assert/strict';
export async function validateFortress(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, m = window.mechanics;
        m.fort = m.clear('BFRT', 7, { rx: m.base.tile.rx - 6, ry: m.base.tile.ry + 3 });
        m.passenger = m.clear('E1', 3, { rx: m.fort.tile.rx + 2, ry: m.fort.tile.ry });
        m.fort.attackTrait.setDisabled(true);
        d.actionsApi.orderUnits([m.passenger.id], 17, m.fort.id);
    });
    await page.waitForFunction(() => window.mechanics.fort.transportTrait.units.includes(window.mechanics.passenger), undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const m = window.mechanics;
        m.fortTarget = m.clear('E2', 3, { rx: m.fort.tile.rx + 4, ry: m.fort.tile.ry }, m.enemy);
        m.fortTarget.moveTrait.setDisabled(true); m.fortTarget.attackTrait.setDisabled(true);
        m.fortTargetHp = m.fortTarget.healthTrait.getHitPoints();
    });
    await page.waitForFunction(() => window.mechanics.fortTarget.healthTrait.getHitPoints() < window.mechanics.fortTargetHp, undefined, { timeout: 15000 });
    report.fortress = await page.evaluate(() => ({ passengerFired: !window.mechanics.passenger.isSpawned,
        rangeBonus: window.mechanics.passenger.primaryWeapon.range - window.mechanics.passenger.primaryWeapon.rules.range }));
    assert(report.fortress.passengerFired); assert.equal(report.fortress.rangeBonus, 2);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.mechanics.fort.id], 10));
    await page.waitForFunction(() => window.mechanics.passenger.isSpawned, undefined, { timeout: 15000 });
    report.fortress.evacuated = await page.evaluate(() => !window.mechanics.passenger.openTransport &&
        window.mechanics.passenger.primaryWeapon.range === window.mechanics.passenger.primaryWeapon.rules.range);
    assert(report.fortress.evacuated);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        m.crushTarget = m.clear('HTNK', 7, { rx: m.fort.tile.rx + 4, ry: m.fort.tile.ry }, m.enemy);
        m.crushTarget.moveTrait.setDisabled(true); m.crushTarget.attackTrait.setDisabled(true);
        d.actionsApi.orderUnits([m.fort.id], 1, m.crushTarget.id);
    });
    await page.waitForFunction(() => window.mechanics.crushTarget.isDestroyed, undefined, { timeout: 20000 });
    report.fortress.crushedTank = true;
}
