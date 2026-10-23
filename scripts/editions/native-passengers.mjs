import assert from 'node:assert/strict';

export async function validatePassengers(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        m.quiet();
        for (const u of m.targets) if (!u.isDestroyed) d.game.destroyObject(u, { player: d.localPlayer }, true);
        const fort = m.clear('BFRT', 7, { rx: m.base.tile.rx - 6, ry: m.base.tile.ry + 3 });
        fort.attackTrait.setDisabled(true);
        const legionnaire = m.clear('CLEG', 3, { rx: fort.tile.rx + 2, ry: fort.tile.ry });
        window.passengers = { fort, legionnaire };
        d.actionsApi.orderUnits([legionnaire.id], 17, fort.id);
    });
    await page.waitForFunction(() => window.passengers.fort.transportTrait.units.includes(window.passengers.legionnaire), undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const m = window.mechanics, f = window.passengers;
        f.target = m.clear('HTNK', 7, { rx: f.fort.tile.rx + 3, ry: f.fort.tile.ry }, m.enemy);
        f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.passengers.legionnaire.temporalTrait.getTarget() === window.passengers.target, undefined, { timeout: 15000 });
    await page.waitForFunction(() => window.passengers.target.isDestroyed, undefined, { timeout: 20000 });
    report.passengers = { temporalErasure: true };
    await page.evaluate(() => {
        const m = window.mechanics, f = window.passengers;
        f.nextTarget = m.clear('HTNK', 7, { rx: f.fort.tile.rx + 3, ry: f.fort.tile.ry }, m.enemy);
        f.nextTarget.attackTrait.setDisabled(true); f.nextTarget.moveTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.passengers.legionnaire.temporalTrait.getTarget() === window.passengers.nextTarget, undefined, { timeout: 15000 });
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.passengers.fort.id], 10));
    await page.waitForFunction(() => window.passengers.legionnaire.isSpawned, undefined, { timeout: 15000 });
    report.passengers.unloadReleasedBeam = await page.evaluate(() => {
        const f = window.passengers;
        f.legionnaire.attackTrait.setDisabled(true);
        return !f.legionnaire.openTransport && !f.legionnaire.temporalTrait.getTarget();
    });
    assert(report.passengers.unloadReleasedBeam);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics, f = window.passengers;
        if (!f.nextTarget.isDestroyed) d.game.destroyObject(f.nextTarget, { player: d.localPlayer });
        f.yuri = m.clear('YURI', 3, { rx: f.fort.tile.rx + 2, ry: f.fort.tile.ry });
        d.actionsApi.orderUnits([f.yuri.id], 17, f.fort.id);
    });
    await page.waitForFunction(() => window.passengers.fort.transportTrait.units.includes(window.passengers.yuri), undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const m = window.mechanics, f = window.passengers;
        f.controlTarget = m.clear('HTNK', 7, { rx: f.fort.tile.rx + 3, ry: f.fort.tile.ry }, m.enemy);
        f.controlTarget.attackTrait.setDisabled(true); f.controlTarget.moveTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.passengers.controlTarget.owner === window.__ra2debug.localPlayer, undefined, { timeout: 15000 });
    report.passengers.mindControl = true;
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.passengers;
        d.game.destroyObject(f.fort, { player: window.mechanics.enemy }, true);
    });
    report.passengers.transportDeathReleasedControl = await page.evaluate(() => window.passengers.controlTarget.owner === window.mechanics.enemy);
    assert(report.passengers.transportDeathReleasedControl);
}
