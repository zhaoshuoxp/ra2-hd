// Capture one HD density on an existing native review route without repeating state suites.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, referenceFile, output] = process.argv.slice(2);
const reference = JSON.parse(await fs.readFile(referenceFile, 'utf8'));
const density = process.argv.includes('--density=2') ? 2 : 4;
assert.equal(reference.status, 'PASS_SELECTED_NATIVE_CASES');
assert(/^[a-z0-9_-]+\.map$/i.test(reference.selectedMap));
process.argv.push(`--map=${reference.selectedMap}`, '--bot-slot=1');
const session = await startSession(receipt, output, reference.edition, false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = `HD ${density}X on the unchanged source map and existing native camera route. Controlled reveal and suspended bot AI; native cosmetic variants may differ between sessions. Prior native state and allocation suites are reused, not repeated.`;
    report.reference = referenceFile;
    report.captureRoute = reference.captureRoute;
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    assert.equal(report.terrain.density, density);
    assert.equal(report.environment.density, density);
    for (const [index, sample] of reference.captureRoute.entries()) {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, sample.tile);
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug;
            d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, `${String(index).padStart(2, '0')}-${sample.name}-framebuffer.png`), Buffer.from(png, 'base64'));
    }
    report.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(report.glError, 0);
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
