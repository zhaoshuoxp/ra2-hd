import assert from 'node:assert/strict';
export async function validateVirus(page, report) {
    await page.evaluate(() => {
        window.mechanics.quiet();
        const d = window.__ra2debug, m = window.mechanics;
        // Protect unrelated starting infantry from the intended gas chain reaction.
        for (const u of d.game.world.getAllObjects()) if (u.isTechno()) u.invulnerableTrait?.setActiveFor(5000, d.game.currentTick);
        m.virus = m.clear('VIRUS', 3, { rx: m.base.tile.rx - 6, ry: m.base.tile.ry + 2 });
        m.virus.invulnerableTrait.setActiveFor(5000, d.game.currentTick);
        m.virusVictim = m.clear('E2', 3, { rx: m.virus.tile.rx + 5, ry: m.virus.tile.ry }, m.enemy);
        m.gasVictim = m.clear('HTNK', 7, { rx: m.virusVictim.tile.rx, ry: m.virusVictim.tile.ry + 1 }, m.enemy);
        for (const unit of [m.virusVictim, m.gasVictim]) { unit.attackTrait.setDisabled(true); unit.moveTrait.setDisabled(true); }
        m.gasHp = m.gasVictim.healthTrait.getHitPoints();
        m.gasAnimations = [];
        d.game.events.subscribe(e => {
            if (e.name === 'TXGASG' && e.attachment) m.gasAnimations.push({ cloud: e.attachment,
                start: { x: e.attachment.position.x, z: e.attachment.position.z }, art: e.artOverrides });
        });
        d.actionsApi.orderUnits([m.virus.id], 2, m.virusVictim.id);
    });
    await page.waitForFunction(() => window.mechanics.virusVictim.isDestroyed, undefined, { timeout: 15000 });
    report.virus = await page.evaluate(() => ({ death: window.mechanics.virusVictim.infDeathType }));
    assert.equal(report.virus.death, 8);
    await page.evaluate(() => {
        const d = window.__ra2debug, m = window.mechanics;
        d.actionsApi.orderUnits([m.virus.id], 11); m.virus.attackTrait.setDisabled(true);
    });
    await page.waitForFunction(() => window.mechanics.gasVictim.healthTrait.getHitPoints() < window.mechanics.gasHp, undefined, { timeout: 20000 });
    report.virus.persistentDamage = await page.evaluate(() => window.mechanics.gasHp - window.mechanics.gasVictim.healthTrait.getHitPoints());
    assert(report.virus.persistentDamage > 0);
    await page.waitForFunction(() => window.mechanics.gasAnimations.length >= 3);
    await page.waitForFunction(() => window.mechanics.gasAnimations.slice(0, 3).some(a =>
        Math.abs(a.cloud.position.x - a.start.x) + Math.abs(a.cloud.position.z - a.start.z) > 20));
    report.virus.drifting = true;
    await page.waitForFunction(() => window.mechanics.gasAnimations.length >= 6 && window.mechanics.gasAnimations.every(a => !a.cloud.active), undefined, { timeout: 40000 });
    report.virus.animations = await page.evaluate(() => window.mechanics.gasAnimations.map(a => ({ particle: a.cloud.particle, active: a.cloud.active, translucency: a.art.Translucency })));
    assert.equal(report.virus.animations.length, 6);
    assert(report.virus.animations.every(a => a.translucency === '0' && !a.active));
}
