import assert from 'node:assert/strict';
export async function validateEconomy(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, game = d.game, owner = d.localPlayer;
        const base = owner.getOwnedObjects().find(u => u.name === 'YACNST');
        const candidates = [...game.map.tiles.getAll()].filter(t => Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 16);
        const worker = game.getConstructionWorker(owner);
        const ore = candidates.filter(t => game.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()));
        const tile = candidates.filter(t => worker.canPlaceAt('YAREFN', t, { ignoreAdjacent: true }))
            .sort((a, b) => Math.min(...ore.map(t => Math.hypot(t.rx - a.rx, t.ry - a.ry))) - Math.min(...ore.map(t => Math.hypot(t.rx - b.rx, t.ry - b.ry))))[0];
        if (!tile || !ore.length) throw new Error('No suitable local ore fixture');
        const [miner] = worker.placeAt('YAREFN', tile);
        window.economy = { miner, initialCredits: owner.credits, start: game.currentTick, workStates: [] };
        window.slaveProbe = setInterval(() => {
            const states = window.economy.miner.slaveMinerTrait.getSlaves().map(u => u.slaveWorkState).filter(Boolean);
            window.economy.workStates.push(...states.filter(s => !window.economy.workStates.includes(s)));
        }, 30);
    });
    await page.waitForFunction(() => window.economy.miner.slaveMinerTrait.getSlaves().length === 5, undefined, { timeout: 30000 });
    report.economy = await page.evaluate(() => ({ workers: window.economy.miner.slaveMinerTrait.getSlaves().map(s => s.id), tick: window.__ra2debug.game.currentTick }));
    await page.waitForFunction(() => window.__ra2debug.localPlayer.credits > window.economy.initialCredits, undefined, { timeout: 60000 });
    report.economy.income = await page.evaluate(() => ({ credits: window.__ra2debug.localPlayer.credits - window.economy.initialCredits, ticks: window.__ra2debug.game.currentTick - window.economy.start }));
    assert(report.economy.income.credits > 0);
    await page.evaluate(() => {
        const d = window.__ra2debug, e = window.economy;
        e.victim = e.miner.slaveMinerTrait.getSlaves()[0].id;
        d.game.destroyObject(e.miner.slaveMinerTrait.getSlaves()[0], { player: d.localPlayer });
        e.deadAt = d.game.currentTick;
    });
    await page.waitForFunction(() => window.economy.miner.slaveMinerTrait.getSlaves().length === 5 && !window.economy.miner.slaveMinerTrait.getSlaves().some(s => s.id === window.economy.victim), undefined, { timeout: 30000 });
    report.economy.replacementTicks = await page.evaluate(() => window.__ra2debug.game.currentTick - window.economy.deadAt);
    assert(report.economy.replacementTicks >= 500);
    await page.evaluate(() => {
        const d = window.__ra2debug, e = window.economy;
        e.miner.healthTrait.health = 61;
        e.miner.veteranTrait.promote(2, d.game);
        e.beforeMorph = e.miner.slaveMinerTrait.getSlaves().map(s => s.id);
        d.actionsApi.orderUnits([e.miner.id], 0, e.miner.tile.rx - 5, e.miner.tile.ry);
    });
    await page.waitForFunction(() => !!window.economy.miner.replacedBy?.isSpawned, undefined, { timeout: 15000 });
    report.economy.morph = await page.evaluate(() => {
        const e = window.economy; e.miner = e.miner.replacedBy;
        return { name: e.miner.name, before: e.beforeMorph, after: e.miner.slaveMinerTrait.getSlaves().map(s => s.id) };
    });
    assert.equal(report.economy.morph.name, 'SMIN');
    assert.deepEqual(report.economy.morph.after, report.economy.morph.before);
    await page.waitForFunction(() => window.economy.miner.replacedBy?.isBuilding() && window.economy.miner.replacedBy.isSpawned, undefined, { timeout: 30000 });
    await page.evaluate(() => { window.economy.miner = window.economy.miner.replacedBy; });
    report.economy.redeployed = true;
    report.economy.morphState = await page.evaluate(() => ({ health: window.economy.miner.healthTrait.health, veteran: window.economy.miner.veteranLevel }));
    assert(report.economy.morphState.health >= 61 && report.economy.morphState.health < 70);
    assert.equal(report.economy.morphState.veteran, 2);
    report.economy.lifecycle = await page.evaluate(() => {
        const d = window.__ra2debug, e = window.economy, g = d.game;
        clearInterval(window.slaveProbe);
        const slaves = e.miner.slaveMinerTrait.getSlaves();
        const enemy = g.getCombatants().find(p => p !== d.localPlayer);
        g.changeObjectOwner(e.miner, enemy);
        const captured = slaves.every(s => s.owner === enemy && s.slaveMaster === e.miner);
        g.destroyObject(e.miner, { player: d.localPlayer });
        return { captured, released: slaves.every(s => s.owner === d.localPlayer && !s.slaveMaster && !s.attackTrait.isDisabled()), states: e.workStates };
    });
    assert(report.economy.lifecycle.captured && report.economy.lifecycle.released);
    assert(['shovel', 'carry'].every(s => report.economy.lifecycle.states.includes(s)));
}
