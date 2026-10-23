import assert from 'node:assert/strict';
export async function validateAiPowers(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, owner = g.getCombatants().find(p => p !== d.localPlayer);
        const base = [...owner.buildings].find(b => b.rules.constructionYard), worker = g.getConstructionWorker(owner);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 20);
        const place = name => {
            const tile = tiles.find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No AI power fixture tile for ${name}`);
            return worker.placeAt(name, tile)[0];
        };
        const lab = place('YATECH'); lab.invulnerableTrait.setActiveFor(10000, g.currentTick); place('YAPPET'); place('YAGNTC'); place('NAPSIS'); place('NARADR');
        Array.from({ length: 9 }, () => place('YAPOWR'));
        const create = (name, type, tile) => {
            const unit = g.createUnitForPlayer(g.rules.getObject(name, type), d.localPlayer);
            g.spawnObject(unit, tile); unit.attackTrait?.setDisabled(true); unit.moveTrait.setDisabled(true);
            unit.invulnerableTrait.setActiveFor(10000, g.currentTick); return unit;
        };
        const vacant = tiles.filter(t => !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()) && g.map.terrain.getPassableSpeed(t, g.rules.getObject('E2', 3).speedType, true, false) > 0);
        vacant.sort((a, b) => Math.hypot(a.rx - lab.tile.rx, a.ry - lab.tile.ry) - Math.hypot(b.rx - lab.tile.rx, b.ry - lab.tile.ry));
        for (const tile of vacant.slice(0, 4)) create('E2', 3, tile);
        create('HTNK', 7, vacant[5]);
        g.mapShroudTrait.getPlayerShroud(owner).revealAround(base.tile, 40);
        window.aiPowers = { owner, lab, fired: [] };
        g.events.subscribe(event => { if (event.type === 53 && event.owner === owner) window.aiPowers.fired.push(event.target); });
    });
    await page.waitForFunction(() => window.aiPowers.owner.superWeaponsTrait.getAll().length >= 5, undefined, { timeout: 15000 });
    await page.evaluate(() => {
        const g = window.__ra2debug.game, f = window.aiPowers;
        for (const sw of f.owner.superWeaponsTrait.getAll()) { sw.chargeTicks = 0; sw.status = 2; }
    });
    await page.waitForFunction(() => window.aiPowers.fired.length >= 4, undefined, { timeout: 30000 });
    await page.evaluate(() => {
        const g = window.__ra2debug.game, f = window.aiPowers;
        f.lab.healthTrait.inflictDamage(Math.floor(f.lab.healthTrait.maxHitPoints * .5), { player: window.__ra2debug.localPlayer }, g);
    });
    await page.waitForFunction(() => window.aiPowers.fired.length >= 5, undefined, { timeout: 30000 });
    report.aiPowers = await page.evaluate(() => [...new Set(window.aiPowers.fired)]);
    for (const name of [10, 7, 9, 11, 8]) assert(report.aiPowers.includes(name), `AI must activate ${name}`);
}
