// Bound regression for the shared faction-wall overlay path on the accepted Snow archive.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
const catalog = JSON.parse(await fs.readFile('desktop/allied-building-coverage.json'));
const descriptor = catalog['gawall-snow'];
const familyBytes = await fs.readFile(path.join('.local', descriptor.familyPath));
assert.equal(createHash('sha256').update(familyBytes).digest('hex'), descriptor.familyHash);
const family = JSON.parse(familyBytes);
const [member] = family.members;
const expected = `${member.sha256}/${descriptor.members[0].sha256}/SNOW/tiles/4`;
process.argv.push('--map=official-a4f07f9b927148f871136237.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', true, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = 4;
    });
});
const { page, report, close } = session;
let failure;
try {
    report.disclosure = 'One shared-path regression on the accepted a4 Snow map, not an artwork re-review or faction matrix. Original source, rules, placements and accepted Snow assets remain unchanged. Controlled map reveal and suspended AI are inherited from the session helper.';
    report.sourceSha256 = await page.evaluate(() => window.__ra2debug.game.officialSkirmishSourceSha256);
    assert.equal(report.sourceSha256, 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574');
    report.walls = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().filter(object => object.isOverlay() && object.name === 'GAWALL')
            .map(object => {
                const r = d.renderableManager.getRenderableByGameObject(object);
                const batch = d.mapRenderable.overlayLayer.getObjectHdBinding(object);
                return { id: object.id, tile: [object.tile.rx, object.tile.ry], frame: batch?.frame ?? r?.mainRenderable?.builder.getFrame(),
                    hd: batch?.identity ?? r?.mainRenderable?.builder.hdOverride?.identity };
            });
    });
    assert(report.walls.length > 0 && report.walls.every(wall => wall.hd === expected));
    report.expectedBinding = expected;
    report.nativeTickBefore = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 8, report.nativeTickBefore);
    report.nativeTickAfter = await page.evaluate(() => window.__ra2debug.game.currentTick);
    report.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(report.glError, 0);
    report.wallBeforeReset = await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m24OldSnowWallDemand = d.worldView.sovietUnitsHd;
        window.__m24OldSnowWallAllocation = d.worldView.sovietBuildingsHd.GAWALL;
        window.__m24OldSnowWallGame = d.game;
        return { queued: d.sovietUnitsHd.families.GAWALL,
            overrides: window.__m24OldSnowWallAllocation.overrides.size };
    });
    assert.equal(report.wallBeforeReset.queued.status, 'READY');
    await page.evaluate(() => {
        clearInterval(window.__allied.timer);
        window.__ra2debug.generalOptions.graphics.hdEnabled.value = false;
    });
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__m24OldSnowWallGame, undefined, { timeout: 90000 });
    report.released = await page.evaluate(() => ({ oldFamilies: window.__m24OldSnowWallDemand.families.size,
        oldGpuBytes: window.__m24OldSnowWallDemand.report.gpuBytes,
        oldOverrides: window.__m24OldSnowWallAllocation.overrides.size,
        originalGpuBytes: window.__ra2debug.worldView.sovietUnitsHd.report.gpuBytes }));
    assert.deepEqual(report.released, { oldFamilies: 0, oldGpuBytes: 0, oldOverrides: 0, originalGpuBytes: 0 });
    await page.evaluate(() => window.__installAlliedFixtures());
    assert.equal(report.errors.length, 0);
    report.regressionStatus = 'PASS_ACCEPTED_SNOW_FACTION_WALL_BINDING_NATIVE_TICKS_RELEASE_AND_ORIGINAL_REENTRY';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, regressionStatus: report.regressionStatus, walls: report.walls.length }));
