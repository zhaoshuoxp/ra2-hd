import assert from 'node:assert/strict';

export async function validateCivilianExit(page, report) {
    report.civilianExit = { cycles: [] };
    report.civilianExit.fixture = await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__garrisonErrors = [];
        const original = d.gameScreen.handleError;
        d.gameScreen.handleError = function(error, ...args) {
            window.__garrisonErrors.push(error?.stack ?? String(error));
            return original.call(this, error, ...args);
        };
        const houses = [...d.game.world.getAllObjects()].filter(u => u.garrisonTrait?.canBeOccupied());
        const home = d.localPlayer.getOwnedObjects()[0].tile;
        houses.sort((a, b) => Math.hypot(a.tile.rx-home.rx, a.tile.ry-home.ry)-Math.hypot(b.tile.rx-home.rx,b.tile.ry-home.ry));
        const house = houses[0];
        if (!house) throw Error('No occupiable civilian building on default map');
        const units = [];
        const offsets = [];
        for (let x=-5;x<=5;x++) for(let y=-5;y<=5;y++) offsets.push([x,y]);
        offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
        for (const [x,y] of offsets) {
            if (units.length===3) break;
            const tile = d.game.map.tiles.getByMapCoords(house.tile.rx+x,house.tile.ry+y);
            if (!tile) continue;
            const u = d.game.createObject(3, 'E2');
            d.game.changeObjectOwner(u,d.localPlayer);
            if (d.game.map.terrain.getPassableSpeed(tile,u.rules.speedType,true,false) <= 0 || d.game.map.terrain.findObstacles({ tile,onBridge:undefined },u).length) continue;
            d.game.spawnObject(u,tile); units.push(u);
        }
        window.__garrisonFixture = { house, units };
        return { description: 'Three spawned Conscripts near an existing map house; unchanged native occupy and evacuate orders', house: { id:house.id,name:house.name,tile:[house.tile.rx,house.tile.ry] }, units:units.map(u=>u.id) };
    });
    await page.waitForTimeout(1500);
    for (let cycle = 0; cycle < 5; cycle++) {
        await page.evaluate(() => { const q=window.__garrisonFixture; window.__ra2debug.actionsApi.orderUnits(q.units.map(u=>u.id),8,q.house.id); });
        await page.waitForFunction(() => window.__garrisonFixture.house.garrisonTrait.units.length===3 || window.__garrisonErrors.length, undefined, {timeout:45000});
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__garrisonFixture.house.id],10));
        await page.waitForTimeout(1500);
        const row = await page.evaluate(() => { const d=window.__ra2debug,q=window.__garrisonFixture; return { tick:d.game.currentTick, occupants:q.house.garrisonTrait.units.length, civilianOwner:q.house.owner===d.game.getCivilianPlayer(), errors:window.__garrisonErrors, units:q.units.map(u=>({id:u.id,limbo:!!u.limboData,renderable:!!d.renderableManager.getRenderableByGameObject(u)})) }; });
        report.civilianExit.cycles.push(row);
        assert.deepEqual(row.errors, []);
        assert.equal(row.occupants,0);
        assert.equal(row.civilianOwner,true);
        assert(row.units.every(u=>!u.limbo && u.renderable));
    }
    report.civilianExit.status = 'PASS_NATIVE_CONSCRIPT_CIVILIAN_ENTRY_EXIT_FIVE_CYCLES';
}
