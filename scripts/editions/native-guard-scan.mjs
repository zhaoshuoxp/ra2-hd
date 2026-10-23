import assert from 'node:assert/strict';
import path from 'node:path';

export async function validateGuardScan(page, report, out) {
    report.guardScan = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        const units = d.localPlayer.getOwnedObjects().filter(u => u.armedTrait?.primaryWeapon && !u.armedTrait.secondaryWeapon);
        if (!units.length) throw Error('The fixture needs native single-weapon starting units');
        window.guardScans = [];
        for (const unit of units) {
            const armed = unit.armedTrait, original = armed.computeGuardScanRange;
            armed.computeGuardScanRange = function (weapon) {
                const range = original.call(this, weapon);
                window.guardScans.push({ tick: g.currentTick, unit: unit.name, weapon: weapon?.name, range });
                return range;
            };
        }
        d.actionsApi.orderUnits(units.map(u => u.id), 5);
        return { startTick: g.currentTick, units: units.map(u => u.name), trigger: 'Native Guard order followed by passive acquisition ticks' };
    });
    await page.waitForFunction(() => window.guardScans.length >= 10 || window.__ra2debug.game.status !== 1, undefined, { timeout: 15000 });
    report.guardScan.result = await page.evaluate(() => ({ status: window.__ra2debug.game.status, scans: window.guardScans.slice(0, 30) }));
    assert.equal(report.guardScan.result.status, 1, 'Guard scans must leave simulation running');
    assert(report.guardScan.result.scans.length >= 10);
    assert(report.guardScan.result.scans.every(s => Number.isFinite(s.range)));
    report.guardScan.promoted = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const units = d.localPlayer.getOwnedObjects().filter(u => u.veteranTrait && u.armedTrait?.primaryWeapon && !u.armedTrait.secondaryWeapon);
        window.guardScans = [];
        for (const u of units) u.veteranTrait.promote(2, g);
        return units.map(u => ({ name: u.name, rank: u.veteranLevel, defaultGuard: u.defaultToGuardArea }));
    });
    await page.waitForFunction(() => window.guardScans.length >= 10, undefined, { timeout: 15000 });
    report.guardScan.promotedScans = await page.evaluate(() => window.guardScans.slice(0, 30));
    await page.screenshot({ path: path.join(out, 'guard-scans.png') });
}
