import assert from 'node:assert/strict';

export async function validateLoadingAi(page, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, local = d.localPlayer;
        const enemy = g.getCombatants().find(p => p !== local);
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
        const place = (name, owner) => {
            const existing = owner.getOwnedObjects().find(u => u.name === name);
            if (existing) return existing;
            const base = owner.getOwnedObjects().find(u => u.rules.constructionYard);
            const worker = g.getConstructionWorker(owner);
            const tile = tiles.filter(t => Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 18)
                .sort((a, b) => Math.hypot(a.rx - base.tile.rx, a.ry - base.tile.ry) - Math.hypot(b.rx - base.tile.rx, b.ry - base.tile.ry))
                .find(t => worker.canPlaceAt(name, t, { ignoreAdjacent: true }));
            if (!tile) throw new Error(`No legal placement for ${name}`);
            return worker.placeAt(name, tile)[0];
        };
        place('GAPOWR', local); place('GAPILE', local);
        const reactor = place('YAPOWR', enemy);
        place('YABRCK', enemy); place('NAPSIS', enemy); place('YATECH', enemy);
        const base = local.getOwnedObjects().find(u => u.rules.constructionYard);
        const rules = g.rules.getObject('BFRT', 7);
        const fort = g.createUnitForPlayer(rules, local);
        const tile = tiles.filter(t => Math.hypot(t.rx - base.tile.rx, t.ry - base.tile.ry) < 8)
            .find(t => g.map.terrain.getPassableSpeed(t, rules.speedType, false, false) > 0 && !g.map.terrain.findObstacles({ tile: t, onBridge: false }, fort).length);
        if (!tile) throw new Error('No legal Fortress tile');
        g.spawnObject(fort, tile);
        window.loadingAi = { fort, reactor, samples: [], created: [] };
        g.events.subscribe(e => {
            if (e.type === 44 && ['GGI', 'E1', 'INIT'].includes(e.target.name)) window.loadingAi.created.push(e.target.name);
        });
    });
    await page.waitForFunction(() => {
        const f = window.loadingAi;
        f.samples.push({ tick: window.__ra2debug.game.currentTick, occupants: f.reactor.absorberTrait.units.length, passengers: f.fort.transportTrait.units.length });
        return f.reactor.absorberTrait.units.length > 0 && f.fort.transportTrait.units.length === 5;
    }, undefined, { timeout: 120000, polling: 1000 });
    report.loadingAi = await page.evaluate(() => {
        const f = window.loadingAi;
        return { reactorOccupants: f.reactor.absorberTrait.units.map(u => u.name), passengers: f.fort.transportTrait.units.map(u => u.name), created: f.created };
    });
    assert(report.loadingAi.reactorOccupants.includes('INIT'));
    assert.equal(report.loadingAi.passengers.filter(n => n === 'GGI').length, 3);
    assert.equal(report.loadingAi.passengers.filter(n => n === 'E1').length, 2);
    report.loadingAi.fixture = 'Legal barracks/power/technology structures and empty Fortress supplied; normal AI chooses production, reserves infantry and issues boarding orders';
}
