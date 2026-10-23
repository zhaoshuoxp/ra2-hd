import assert from 'node:assert/strict';
export async function validateNavalAi(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = g.getCombatants().find(p => p !== d.localPlayer);
        g.mapShroudTrait.getPlayerShroud(owner).revealAll();
        g.mapShroudTrait.getPlayerShroud(d.localPlayer).revealAll();
        const worker = g.getConstructionWorker(owner), defender = g.getConstructionWorker(d.localPlayer);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        let water, land;
        for (const tile of tiles) {
            if (!worker.canPlaceAt('YAYARD', tile, { ignoreAdjacent: true })) continue;
            const target = tiles.find(t => Math.hypot(t.rx - tile.rx, t.ry - tile.ry) >= 6 && Math.hypot(t.rx - tile.rx, t.ry - tile.ry) <= 10 && defender.canPlaceAt('NAPOWR', t, { ignoreAdjacent: true }));
            if (target) { water = tile; land = target; break; }
        }
        if (!water) throw new Error('No legal coast for naval AI fixture');
        const yard = worker.placeAt('YAYARD', water)[0], target = defender.placeAt('NAPOWR', land)[0];
        g.mapShroudTrait.getPlayerShroud(owner).revealAround(water, 20);
        window.navalAi = { owner, yard, target, produced: [] };
        g.events.subscribe(e => { if (e.type === 44 && e.target.owner === owner && e.target.rules.naval) window.navalAi.produced.push(e.target.name); });
    });
    await page.waitForFunction(() => window.navalAi.target.buildStatus === 1);
    const hp = await page.evaluate(() => window.navalAi.target.healthTrait.getHitPoints());
    await page.waitForFunction(() => window.navalAi.produced.includes('BSUB'), undefined, { timeout: 90000 });
    await page.waitForFunction(hp => window.navalAi.target.healthTrait.getHitPoints() < hp, hp, { timeout: 90000 });
    report.navalAi = await page.evaluate(() => ({ produced: window.navalAi.produced, targetHp: window.navalAi.target.healthTrait.getHitPoints() }));
    assert(report.navalAi.targetHp < hp);
    report.navalAi.fixture = 'Legal shipyard and coastal target supplied on revealed map; AI queues, produces and attacks without scripted ship orders';
}
