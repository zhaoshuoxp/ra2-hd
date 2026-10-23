// Load two ordinary selectable maps in one copied-app process and check release/reuse.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
    }, density);
});
const { page, report, close } = session;
let failure;
const snapshot = () => page.evaluate(() => {
    const d = window.__ra2debug;
    return { environment: d.environmentHd, terrain: { density: d.terrainHd.density,
        worldChargeBytes: d.terrainHd.worldChargeBytes, budget: d.terrainHd.budget,
        groups: d.terrainHd.groups.filter(group => group.id.startsWith('m2-3-')) },
        prepared: { ...d.preparedHdCache }, output: d.renderer.outputMetrics,
        glError: d.renderer.renderer.getContext().getError() };
});
try {
    report.disclosure = 'One copied app process and profile; ordinary native menu navigation selects XEB2 then XNEWHGHTS. No map/rules override. Reveal and paused bot fixtures are reinstalled only after each match starts.';
    report.firstMap = await snapshot();
    await page.evaluate(() => {
        const d = window.__ra2debug; clearInterval(window.__allied.timer);
        window.__m23PreviousGame = d.game; window.__m23PreviousEnvironment = d.environmentHd;
        window.__m23PreviousTerrain = d.terrainHd;
        const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        localStorage.setItem('_edition:yr:_r_lastMap', 'XNEWHGHTS.map');
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 90000 });
    report.secondSelection = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts);
    assert.equal(report.secondSelection.mapName.toLowerCase(), 'xnewhghts.map');
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__m23PreviousGame, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__installAlliedFixtures());
    report.secondMap = await snapshot();
    report.release = await page.evaluate(() => ({ environment: window.__m23PreviousEnvironment,
        terrain: window.__m23PreviousTerrain }));
    assert(report.release.environment.disposed && report.release.environment.worldChargeBytes === 0);
    assert(report.release.terrain.disposed && report.release.terrain.worldChargeBytes === 0);
    assert.equal(report.secondMap.environment.density, density);
    assert.equal(report.secondMap.terrain.density, density);
    assert(report.secondMap.terrain.groups.some(group => group.id === 'm2-3-set38' && group.status === 'PUBLISHED'));
    assert(Object.values(report.secondMap.environment.families).every(family => family.status === 'PUBLISHED_COMPLETE_FAMILY'));
    assert(report.secondMap.prepared.bytes + report.secondMap.prepared.pendingBytes <= 128 * 1024 * 1024);
    assert.equal(report.secondMap.glError, 0); assert.equal(report.errors.length, 0);
    await page.screenshot({ path: path.join(output, 'second-map-native.png') });
    report.reuseStatus = 'PASS_SAME_PROCESS_SECOND_MAP_AND_PREVIOUS_WORLD_RELEASE';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, reuseStatus: report.reuseStatus, density }));
