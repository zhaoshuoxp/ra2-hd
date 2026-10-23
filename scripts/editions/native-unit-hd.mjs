import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateUnitHd(page, report, out) {
    const inventory = JSON.parse(await fs.readFile('docs/m1-7-accepted-resources.json', 'utf8'));
    const excluded = process.argv.includes('--unit-hd-land') ? ['SQD', 'DRED', 'SUB', 'HYD'] : [];
    const ids = inventory.families.filter(f => !excluded.includes(f.id))
        .map(f => ({ id: f.id, type: f.manifest?.endsWith('family.json') ? 3 : 7 }));
    // DRON and SQD are SHP vehicles, not infantry.
    for (const row of ids) if (['DRON', 'SQD'].includes(row.id)) row.type = 7;
    report.unitHd = { excluded, theater: await page.evaluate(() => window.__ra2debug.theater.type),
        disclosure: 'Controlled source/renderer/guard integration, not country buildability or exhaustive action acceptance.' };
    const registered = await page.evaluate(() => Object.keys(window.__ra2debug.sovietUnitsHd?.families ?? {}));
    for (const { id } of ids) assert(registered.includes(id), `${id}: unit HD loader unavailable in theater ${report.unitHd.theater}`);
    report.unitHd.actors = await page.evaluate(ids => {
        const d = window.__ra2debug, g = d.game, home = d.localPlayer.getOwnedObjects()[0].tile;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        g.mapShroudTrait.revealMap(d.localPlayer, g);
        window.hdActors = {};
        const placed = [];
        for (const { id, type } of ids) {
            const rules = g.rules.getObject(id, type);
            const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && !g.map.tileOccupation.getBridgeOnTile(t)
                && g.map.terrain.getPassableSpeed(t, rules.speedType, type === 3, false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain())
                && placed.every(p => Math.hypot(p.rx - t.rx, p.ry - t.ry) > 2));
            tiles.sort((a, b) => Math.hypot(a.rx - home.rx, a.ry - home.ry) - Math.hypot(b.rx - home.rx, b.ry - home.ry));
            if (!tiles.length) throw Error(`No legal tile for ${id}`);
            const u = g.createUnitForPlayer(rules, d.localPlayer);
            g.spawnObject(u, tiles[0]); u.attackTrait?.setDisabled(true);
            window.hdActors[id] = u; placed.push(tiles[0]);
        }
        return Object.values(window.hdActors).map(u => ({ id: u.name, image: u.rules.image, tile: [u.tile.rx, u.tile.ry] }));
    }, ids);
    await page.waitForFunction(() => Object.keys(window.hdActors).every(id =>
        ['READY', 'FAILED', 'BUDGET_FALLBACK'].includes(window.__ra2debug.sovietUnitsHd.families[id]?.status)), undefined, { timeout: 90000 });
    report.unitHd.memory = await page.evaluate(() => window.__ra2debug.sovietUnitsHd);
    for (const { id } of ids) {
        const row = report.unitHd.memory.families[id];
        if (['SQD', 'YURIPR'].includes(id)) assert.equal(row.status, 'FAILED', `${id} keeps its accepted Original exception`);
        else assert.equal(row.status, 'READY', `${id}: ${JSON.stringify(row)}`);
    }
    assert(report.unitHd.memory.gpuBytes <= report.unitHd.memory.budget);
    report.unitHd.bindings = await page.evaluate(() => Object.values(window.hdActors).map(u => {
        const r = window.__ra2debug.renderableManager.getRenderableByGameObject(u);
        return { id: u.name, hd: !!(r.unitVxlHd?.family || r.shpRenderable?.builder?.hdOverride || r.mainObj?.builder?.hdOverride) };
    }));
    for (const row of report.unitHd.bindings) assert.equal(row.hd, !['SQD', 'YURIPR'].includes(row.id), `${row.id} renderer binding`);
    await page.screenshot({ path: path.join(out, 'unit-hd.png') });
    report.unitHd.gl = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(report.unitHd.gl, 0);
    report.unitHd.status = 'PASS_ACCEPTED_FAMILIES_AND_ORIGINAL_EXCEPTIONS';
}
