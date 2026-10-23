import assert from 'node:assert/strict';
export async function validateGarrison(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, m = window.mechanics;
        m.quiet();
        const worker = g.getConstructionWorker(d.localPlayer);
        const tile = g.map.tiles.getAll().find(t => Math.hypot(t.rx - m.base.tile.rx, t.ry - m.base.tile.ry) < 18 && worker.canPlaceAt('CABUNK01', t, { ignoreAdjacent: true }));
        if (!tile) throw new Error('No garrison placement');
        const building = worker.placeAt('CABUNK01', tile)[0];
        const infantry = ['E1', 'INIT'].map((name, i) => m.clear(name, 3, { rx: tile.rx + 2 + i, ry: tile.ry + 2 }));
        infantry.forEach(u => u.attackTrait.setDisabled(true));
        window.garrison = { building, infantry, fired: [] };
        g.events.subscribe(e => { if (e.type === 2 && e.gameObject === building) window.garrison.fired.push(e.weapon.name); });
    });
    await page.waitForFunction(() => window.garrison.building.buildStatus === 1);
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits(window.garrison.infantry.map(u => u.id), 8, window.garrison.building.id));
    await page.waitForFunction(() => window.garrison.building.garrisonTrait.units.length === 2, undefined, { timeout: 20000 });
    await page.evaluate(() => {
        const m = window.mechanics, f = window.garrison;
        f.target = m.clear('HTNK', 7, { rx: f.building.tile.rx + 3, ry: f.building.tile.ry + 2 }, m.enemy);
        f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
        f.target.invulnerableTrait.setActiveFor(5000, window.__ra2debug.game.currentTick);
    });
    await page.waitForFunction(() => ['UCPara', 'UCPsychicJab'].every(w => window.garrison.fired.includes(w)), undefined, { timeout: 15000 });
    report.garrison = await page.evaluate(() => ({ occupants: window.garrison.building.garrisonTrait.units.map(u => u.name), weapons: [...new Set(window.garrison.fired)] }));
    await page.evaluate(() => window.garrison.infantry[1].veteranTrait.promote(2, window.__ra2debug.game));
    await page.waitForFunction(() => window.garrison.fired.includes('UCElitePsychicJab'), undefined, { timeout: 15000 });
    report.garrison.eliteWeapon = true;
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.garrison.building.id], 10));
    await page.waitForFunction(() => window.garrison.building.garrisonTrait.units.length === 0);
    await page.waitForTimeout(100);
    report.garrison.evacuated = await page.evaluate(() => window.garrison.infantry.every(u => u.isSpawned) && window.garrison.building.armedTrait.garrisonWeapons.size === 0);
    assert(report.garrison.evacuated);
}
