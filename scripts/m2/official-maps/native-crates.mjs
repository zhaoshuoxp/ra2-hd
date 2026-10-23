// Exercise the stock land/water crate generator and pickup in a copied native match.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
assert(process.argv.includes('--crates'), 'Use the ordinary native crates option');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
    }, density);
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'Stock crates option enabled in the ordinary lobby. Controlled legal land and water spawn sites call the native random crate generator and native pickup; no rules or source override.';
    report.nativeOptions = await page.evaluate(() => window.__ra2debug.game.gameOpts);
    assert.equal(report.nativeOptions.cratesAppear, true);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    for (const family of ['environment-crate', 'environment-wcrate'])
        assert.equal(report.environment.families[family].status, 'PUBLISHED_COMPLETE_FAMILY');
    report.crates = [];
    for (const water of [false, true]) {
        const generated = await page.evaluate(water => {
            const d = window.__ra2debug, g = d.game, generator = g.crateGeneratorTrait;
            const tile = g.map.tiles.getAll().find(tile => generator.canPlaceCrateOnTile(g, tile)
                && (g.map.getTileZone(tile, true) === 2) === water);
            if (!tile || !generator.spawnRandomCrateAt(tile, g)) throw Error('No legal native crate site');
            const crate = g.map.getGroundObjectsOnTile(tile).find(object => object.rules?.crate);
            window.__m23Crate = crate;
            return { name: crate.name, tile: [tile.rx, tile.ry], water, nativeValue: crate.value };
        }, water);
        await page.waitForTimeout(200);
        generated.binding = await page.evaluate(() => {
            const d = window.__ra2debug, crate = window.__m23Crate;
            const binding = d.mapRenderable.overlayLayer.getObjectHdBinding(crate);
            d.worldInteraction.minimapHandler.panToTile(crate.tile); d.renderer.render();
            return { ...binding, source: crate.name, spawned: crate.isSpawned };
        });
        assert(generated.binding.identity?.endsWith(`/tiles/${density}`));
        const png = await page.evaluate(() => window.__ra2debug.renderer.renderer.domElement.toDataURL().split(',')[1]);
        await fs.writeFile(path.join(output, `${water ? 'water' : 'land'}-crate-framebuffer.png`), Buffer.from(png, 'base64'));
        generated.pickup = await page.evaluate(water => {
            const d = window.__ra2debug, g = d.game, f = window.__allied, crate = window.__m23Crate;
            const unit = f.spawn(water ? 'DEST' : 'MTNK', 7, crate.tile);
            const before = unit.owner.cratesPickedUp;
            const powerup = g.crateGeneratorTrait.pickupCrate(unit, crate, g);
            return { nativePowerup: powerup, removed: !crate.isSpawned,
                pickups: unit.owner.cratesPickedUp - before, unit: unit.name };
        }, water);
        assert(generated.pickup.removed && generated.pickup.pickups === 1);
        report.crates.push(generated);
    }
    report.output = await page.evaluate(() => window.__ra2debug.renderer.outputMetrics);
    report.prepared = await page.evaluate(() => ({ ...window.__ra2debug.preparedHdCache }));
    report.combinedWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])]
                .reduce((sum, part) => sum + part.bitmap.width * part.bitmap.height * 5
                    + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand,
            total: terrain + environment + baseline + eager + demand, limit: d.terrainHd.budget };
    });
    assert.equal(report.combinedWorldAllocation.limit, (density === 2 ? 512 : 1280) * 1024 * 1024);
    assert(report.combinedWorldAllocation.total <= report.combinedWorldAllocation.limit);
    assert(report.prepared.bytes + report.prepared.pendingBytes <= 128 * 1024 * 1024);
    assert.equal(await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError()), 0);
    assert.equal(report.errors.length, 0);
    report.crateStatus = 'PASS_NATIVE_GENERATED_LAND_AND_WATER_CRATE_BINDING_AND_PICKUP';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, crateStatus: report.crateStatus, density }));
