// Verify isolated Mac Snow resource lifecycle without repeating native state suites.
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const selectedMap = process.argv.find(arg => arg.startsWith('--map='))?.slice(6) ?? 'mp31s2.map';
const families = process.argv.find(arg => arg.startsWith('--families='))?.slice(11).split(',')
    ?? ['snow-bridge-low-wood'];
assert(/^[a-z0-9_-]+\.map$/i.test(selectedMap) && families.length);
const rejectionMap = process.argv.find(arg => arg.startsWith('--scope-rejection-map='))?.slice(22);
assert(!rejectionMap || /^[a-z0-9_-]+\.map$/i.test(rejectionMap));
process.argv.push(`--map=${selectedMap}`, '--bot-slot=1');
const session = await startSession(receipt, output, 'ra2', false, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = 4;
    });
});
let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Short lifecycle check on the isolated packaged Mac app. Original source maps remain unchanged; controlled reveal/stopped AI follows the shared harness. Prior exact native family state suites are reused separately.';
    report.requestedFamilies = families;
    report.initial = await page.evaluate(() => ({ environment: window.__ra2debug.environmentHd,
        terrain: window.__ra2debug.terrainHd, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(report.initial.environment.density, 4);
    assert.equal(report.initial.terrain.density, 4);
    for (const family of families)
        assert.equal(report.initial.environment.families[family].status, 'PUBLISHED_COMPLETE_FAMILY');
    assert.equal(report.initial.glError, 0);
    await page.evaluate(() => {
        const d = window.__ra2debug; clearInterval(window.__allied.timer);
        window.__bridgeOldGame = d.game; window.__bridgeOldEnvironment = d.environmentHd;
        window.__bridgeOldTerrain = d.terrainHd; d.generalOptions.graphics.hdEnabled.value = false;
    });
    await page.evaluate(async () => { await window.r.reset; });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 &&
        window.__ra2debug.game !== window.__bridgeOldGame, undefined, { timeout: 90000 });
    report.original = await page.evaluate(() => ({ oldEnvironment: window.__bridgeOldEnvironment,
        oldTerrain: window.__bridgeOldTerrain, environment: window.__ra2debug.environmentHd,
        terrain: window.__ra2debug.terrainHd, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert(report.original.oldEnvironment.disposed && report.original.oldTerrain.disposed);
    assert.equal(report.original.oldEnvironment.worldChargeBytes, 0);
    assert.equal(report.original.oldTerrain.worldChargeBytes, 0);
    assert.equal(report.original.environment.worldChargeBytes, 0);
    assert.equal(report.original.terrain.worldChargeBytes, 0);
    assert.equal(report.original.glError, 0);
    if (rejectionMap) {
        await page.evaluate(mapName => {
            const d = window.__ra2debug;
            window.__scopeOriginalGame = d.game;
            d.generalOptions.graphics.hdEnabled.value = true;
            localStorage.setItem('_edition:ra2:_r_lastMap', mapName);
            d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
        }, rejectionMap);
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), rejectionMap);
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000002));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 &&
            window.__ra2debug.game !== window.__scopeOriginalGame, undefined, { timeout: 90000 });
        report.scopeRejection = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { sourceSha256: d.game.officialSkirmishSourceSha256,
                adaptation: d.game.officialVisualAdaptations, environment: d.environmentHd,
                glError: d.renderer.renderer.getContext().getError() };
        });
        assert.notEqual(report.scopeRejection.sourceSha256, 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574');
        report.scopeRejection.familyChecks = [];
        for (const family of families) {
            const result = report.scopeRejection.environment.families[family];
            if (result) {
                assert.equal(result.status, 'ORIGINAL');
                assert.match(result.reason, /official-map-source-scope-mismatch/);
            }
            report.scopeRejection.familyChecks.push({ family, status: result ? 'ORIGINAL_SCOPE_REFUSED' : 'NOT_ENCOUNTERED_BY_NATIVE_MAP' });
        }
        report.scopeRejection.disclosure = 'An absent family is not requested by this original map. Real-loader refusal before native/payload reads is tested separately; this native check proves fresh per-game context and release.';
        assert.equal(report.scopeRejection.glError, 0);
    }
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__bridgeOriginalGame = d.game; window.__bridgeOriginalEnvironment = d.environmentHd;
        window.__bridgeOriginalTerrain = d.terrainHd;
        d.generalOptions.graphics.hdEnabled.value = true; d.generalOptions.graphics.hdDensity.value = 4;
        localStorage.setItem('_edition:ra2:_r_lastMap', 'mp03t4.map');
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), 'mp03t4.map');
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 &&
        window.__ra2debug.game !== window.__bridgeOriginalGame, undefined, { timeout: 90000 });
    report.temperate = await page.evaluate(() => ({ oldEnvironment: window.__bridgeOriginalEnvironment,
        oldTerrain: window.__bridgeOriginalTerrain, environment: window.__ra2debug.environmentHd,
        terrain: window.__ra2debug.terrainHd, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert(report.temperate.oldEnvironment.disposed && report.temperate.oldTerrain.disposed);
    assert.equal(report.temperate.oldEnvironment.worldChargeBytes, 0);
    assert.equal(report.temperate.oldTerrain.worldChargeBytes, 0);
    assert.equal(report.temperate.environment.density, 4);
    assert.equal(report.temperate.terrain.density, 4);
    assert(report.temperate.environment.worldChargeBytes > 0 && report.temperate.terrain.worldChargeBytes > 0);
    assert.equal(report.temperate.glError, 0);
    assert.equal(report.errors.length, 0);
    report.lifecycleStatus = 'PASS_SNOW_4X_ORIGINAL_REENTRY_TEMP_4X_RELEASE';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
