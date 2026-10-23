// Observe all eight original rock placements and both ordinary stock crate pickups.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNewUrbanOverlayObjects } from './native-newurban-overlay-objects-batch90.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-rock-crates-batch90-20261020';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v1.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const packRoot = path.join('.local/environment-packs', contract.selectedPack.revision);
const pack = await read(path.join(packRoot, 'manifest.json'));
process.argv.push('--map=rushhr.map', '--bot-slot=1', '--crates');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});

async function switchMap(mapName, hdEnabled) {
    await session.page.evaluate(({ mapName, hdEnabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch90Old = { game: d.game, environment: d.environmentHd, terrain: d.terrainHd };
        d.generalOptions.graphics.hdEnabled.value = hdEnabled;
        d.generalOptions.graphics.hdDensity.value = density;
        const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        localStorage.setItem('_edition:yr:_r_lastMap', mapName);
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { mapName, hdEnabled, density });
    await session.page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    assert.equal(await session.page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), mapName);
    await session.page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await session.page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__batch90Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ environment: window.__batch90Old.environment,
        terrain: window.__batch90Old.terrain, currentEnvironment: window.__ra2debug.environmentHd,
        currentTerrain: window.__ra2debug.terrainHd }));
    for (const key of ['environment', 'terrain']) assert(release[key].disposed && release[key].worldChargeBytes === 0);
    await session.page.evaluate(() => window.__installAlliedFixtures());
    await installNativeObjectBindings(session.page);
    return release;
}

let failure;
try {
    const { page, report } = session;
    await installNativeObjectBindings(page);
    report.theater = 'NEWURBAN';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.disclosure = 'One unchanged Rush Hour map covers all eight original rock sources. Both crates use the stock generator, existing Money powerup and ordinary CMIN/DLPH Move orders. All other map placements with identical original member/SHA/palette/loader share this tested path. Reveal and stopped AI are controlled review fixtures; no natural-match claim. Native logical dimensions, shadows, rules, camera scale and clocks remain unchanged.';
    report.launch = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { environment: d.environmentHd, terrain: d.terrainHd,
            modeType: d.game.gameModeType, options: d.game.gameOpts, tick: d.game.currentTick };
    });
    assert.equal(report.launch.modeType, 0);
    assert.equal(report.launch.options.gameMode, 1);
    assert.equal(report.launch.options.credits, 10000);
    assert.equal(report.launch.options.cratesAppear, true);
    assert.equal(report.launch.environment.density, density);
    const expected = {};
    report.sourcePaths = [];
    for (const row of exported.records) {
        const family = report.launch.environment.families[row.family];
        assert.equal(family.status, 'PUBLISHED_COMPLETE_FAMILY');
        assert.equal(family.density, density);
        const [entry] = pack.families[row.family].members;
        assert.equal(entry.member, row.member);
        expected[row.identity] = `${entry.sha256}/${row.sourceSha256}/NEWURBAN/tiles/${density}`;
        report.sourcePaths.push({ member: row.member, sourceSha256: row.sourceSha256, density,
            metadataSha256: entry.sha256, mapId: 'yr:rushhr.map', expected: expected[row.identity],
            allPlacementMaps: row.maps });
    }
    assert.equal(Object.keys(expected).length, 10);
    await validateNewUrbanOverlayObjects(session, expected);
    report.tickAfterPickups = await page.evaluate(() => window.__ra2debug.game.currentTick);
    assert(report.tickAfterPickups > report.launch.tick + 8);
    report.allocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        return { total: d.terrainHd.worldChargeBytes + d.environmentHd.worldChargeBytes + baseline + eager + d.sovietUnitsHd.gpuBytes,
            limit: d.terrainHd.budget, prepared: { ...d.preparedHdCache }, glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(report.allocation.limit, (density === 2 ? 512 : 1280) * 1024 ** 2);
    assert(report.allocation.total <= report.allocation.limit && report.allocation.glError === 0);
    assert(report.allocation.prepared.peakBytes <= 128 * 1024 ** 2);
    if (density === 4) {
        report.originalRelease = await switchMap('rushhr.map', false);
        report.originalFallback = await page.evaluate(names => {
            const d = window.__ra2debug;
            return { environment: d.environmentHd, terrain: d.terrainHd,
                rocks: d.game.getWorld().getAllObjects().filter(object => names.includes(object.name))
                    .map(window.__m23Binding) };
        }, Object.keys(expected).filter(name => /ROCK/.test(name)));
        assert.equal(report.originalFallback.environment.worldChargeBytes, 0);
        assert.equal(report.originalFallback.terrain.worldChargeBytes, 0);
        assert(report.originalFallback.rocks.length >= 8 && report.originalFallback.rocks.every(row => !row.hd));
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
        report.crossTheater.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
        assert.equal(report.crossTheater.glError, 0);
    }
    report.bindingStatus = 'PASS_ALL_TEN_ORIGINAL_MEMBER_PATHS_EIGHT_PLACED_ROCKS_AND_STOCK_CRATE_PICKUPS';
    report.userVisualAcceptance = false;
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ output, density, status: 'PASS_BATCH90_NATIVE_OBJECTS_PICKUPS_AND_SOURCE_PATHS' }));
