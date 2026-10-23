import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateSovietBuildingCoverage(page, report, out) {
    const inventory = JSON.parse(await fs.readFile('.artifacts/m1-6c/source-v2/inventory.json', 'utf8'));
    const theater = await page.evaluate(() => window.__ra2debug.theater.type);
    const name = ({ 1: 'TEMPERATE', 2: 'URBAN', 4: 'SNOW', 8: 'LUNAR', 16: 'DESERT', 32: 'NEWURBAN' })[theater];
    const rows = inventory.matrix.filter(r => r.edition === report.edition && r.theater === name);
    assert.equal(rows.length, 18);
    const result = report.buildingCoverage = { edition: report.edition, theater: name, disclosure: 'Retail skirmish map with controlled building placement/state fixtures' };
    result.families = await page.evaluate(async rows => {
        const d = window.__ra2debug, w = d.worldView;
        const families = { NAPOWR: w.napowrHd, ...w.sovietBuildingsHd };
        const unit = d.localPlayer.getOwnedObjects().find(u => u.isUnit());
        const finder = d.renderableManager.getRenderableByGameObject(unit).pipOverlay.imageFinder;
        const vfs = finder.images.vfs;
        const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))).map(b => b.toString(16).padStart(2, '0')).join('');
        const result = [];
        for (const row of rows) {
            const loaded = families[row.id];
            const members = [];
            for (const [image, override] of loaded?.overrides ?? []) {
                members.push({ member: image.filename, sha256: await digest(vfs.openFile(image.filename).getBytes()),
                    canvas: [image.width, image.height], authoredFrames: override.frames.length,
                    declaredFramesValid: override.frames.every(f => !!f && !!override.pages[f.page]) });
            }
            result.push({ id: row.id, report: loaded?.report, members });
        }
        return result;
    }, rows);
    for (const row of rows) {
        const actual = result.families.find(f => f.id === row.id);
        assert.equal(actual.report?.density, row.id === 'NAPOWR' ? 4 : 2, `${row.id}: ${JSON.stringify(actual.report)}`);
        assert.equal(actual.members.length, row.members.length, row.id);
        for (const member of actual.members) {
            const expected = row.members.find(m => m.source.member === member.member);
            assert(expected, `${row.id}/${member.member}`);
            assert.equal(member.sha256, expected.source.sha256);
            assert.deepEqual(member.canvas, expected.canvas);
            assert(member.declaredFramesValid);
        }
    }
    result.placements = await page.evaluate(ids => {
        const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        for (const u of g.getWorld().getAllObjects()) if (u.isUnit()) {
            u.attackTrait?.setDisabled(true); u.unitOrderTrait.clearOrders(); u.unitOrderTrait.cancelAllTasks();
        }
        g.mapShroudTrait.revealMap(owner, g);
        const home = owner.getOwnedObjects().find(u => u.rules.constructionYard).tile;
        const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)).sort((a, b) =>
            Math.hypot(a.rx - home.rx, a.ry - home.ry) - Math.hypot(b.rx - home.rx, b.ry - home.ry));
        const worker = g.getConstructionWorker(owner);
        window.coverageActors = {};
        return ids.map(id => {
            const tile = tiles.find(t => worker.canPlaceAt(id, t, { ignoreAdjacent: true }));
            if (!tile) return { id, status: 'NO_LEGAL_PLACEMENT_ON_THIS_MAP' };
            const u = worker.placeAt(id, tile)[0];
            window.coverageActors[id] = u;
            return { id, status: 'PLACED', tile: [tile.rx, tile.ry] };
        });
    }, rows.map(r => r.id));
    await page.waitForFunction(() => Object.values(window.coverageActors).every(u => u.buildStatus === undefined || u.buildStatus === 1), undefined, { timeout: 20000 });
    await page.waitForTimeout(250);
    result.bindings = await page.evaluate(() => Object.entries(window.coverageActors).map(([id, u]) => {
        const r = window.__ra2debug.renderableManager.getRenderableByGameObject(u);
        return { id, constructor: r?.constructor.name, hd: !!(r?.mainObj?.builder?.hdOverride || r?.shpRenderable?.builder?.hdOverride),
            keys: r && Object.keys(r).filter(k => /shp|obj|sprite|hd/i.test(k)) };
    }));
    for (const binding of result.bindings.filter(b => b.id !== 'NAWALL')) assert(binding.hd, `${binding.id} world renderer binding`);
    await page.screenshot({ path: path.join(out, 'soviet-buildings-normal.png') });
    await page.evaluate(() => {
        for (const u of Object.values(window.coverageActors)) if (u.healthTrait) u.healthTrait.setHitPoints(Math.ceil(u.rules.strength * .4));
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, 'soviet-buildings-damaged.png') });
    await page.evaluate(() => {
        for (const u of Object.values(window.coverageActors)) if (u.healthTrait) u.healthTrait.setHitPoints(u.rules.strength);
    });
    result.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(result.glError, 0);
    if (process.argv.includes('--lunar-probe')) {
        await page.evaluate(await fs.readFile('.artifacts/m1-6c/runtime-probe.js', 'utf8'));
        result.lunar = await page.evaluate(async ids => {
            const d = window.__ra2debug;
            const used = d.sovietUnitsHd ? 256 * 1024 * 1024 - d.sovietUnitsHd.budget + d.sovietUnitsHd.gpuBytes : 0;
            return window.__coverageProbe(ids, 256 * 1024 * 1024 - used);
        }, rows.map(r => r.id));
        for (const row of result.lunar.results) assert.equal(row.report?.density, row.id === 'NAPOWR' ? 4 : 2, JSON.stringify(row));
        assert.equal(result.lunar.glError, 0);
    }
    result.status = 'PASS_ACTUAL_NATIVE_RESOLUTION_HD_BINDINGS_AND_DAMAGE';
}
