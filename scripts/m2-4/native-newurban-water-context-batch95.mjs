// Inspect the original water-cliff placement with the unchanged native camera bounds.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
const [stage, output] = process.argv.slice(2);
process.argv.push('--map=manhatta.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = 4;
    });
});
let failure;
try {
    const inspection = await session.page.evaluate(() => {
        const d = window.__ra2debug, handler = d.worldInteraction.minimapHandler;
        const bindings = d.terrainHd.placedBindings.filter(b => b.member === 'wclifx10.ubn');
        const placements = bindings.map(binding => {
            const tile = d.game.map.tiles.getByMapCoords(binding.tile[0], binding.tile[1]);
            handler.panToTile(tile);
            return { binding, nativeTile: { rx: tile.rx, ry: tile.ry, dx: tile.dx, dy: tile.dy, z: tile.z },
                visible: handler.isTileWithinViewport(tile, 0),
                cameraPan: handler.worldScene.cameraPan.getPan(),
                viewport: handler.worldScene.viewport,
                origin: handler.mapPanningHelper.getScreenPanOrigin(),
                computedPan: handler.mapPanningHelper.computeCameraPanFromTile(tile.rx, tile.ry) };
        });
        return { placements, map: { size: d.game.map.size, bounds: d.game.map.bounds },
            terrainDensity: d.terrainHd.density, groups: d.terrainHd.groups };
    });
    assert.equal(inspection.terrainDensity, 4);
    assert(inspection.placements.length > 0);
    const visible = inspection.placements.find(p => p.visible);
    if (visible) await session.page.evaluate(tile => {
        const d = window.__ra2debug;
        d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile));
    }, visible.binding.tile.slice(0, 2));
    await session.page.waitForTimeout(250);
    const png = await session.page.evaluate(() => {
        const d = window.__ra2debug; d.renderer.render();
        return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await fs.writeFile(path.join(session.out, 'water-cliff-context-native.png'), Buffer.from(png, 'base64'));
    session.report.inspection = inspection;
    session.report.disclosure = 'Additional visibility inspection only. Preserve native camera defaults, legal panning bounds, source placement, maps and all artwork. Source publication is already covered by both density cases.';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
