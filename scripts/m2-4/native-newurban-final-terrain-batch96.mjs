// Validate original source paths on the minimum map cover and retain native camera coordinates.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-final-terrain-reuse-batch96-20261021';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-v2.json`);
const plan = await read(`${root}/native-case-plan-v2.json`);
assert.deepEqual(await read('.local/terrain-newurban-selection.json'), exported.candidate);
const sources = new Map(exported.records.map(row => [row.member, row]));
let reference;
try { reference = await read(`${root}/${density === 4 ? 'native-2x-v1' : 'native-4x-v1'}/report.json`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (reference) assert.equal(reference.status, 'PASS_SELECTED_NATIVE_CASES');
process.argv.push('--map=' + plan.cases[0].mapId.split(':')[1], '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});

async function switchMap(mapName, enabled) {
    await session.page.evaluate(({ mapName, enabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch96Old = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd };
        d.generalOptions.graphics.hdEnabled.value = enabled;
        d.generalOptions.graphics.hdDensity.value = density;
        const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        localStorage.setItem('_edition:yr:_r_lastMap', mapName);
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { mapName, enabled, density });
    await session.page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    assert.equal(await session.page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), mapName);
    await session.page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await session.page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__batch96Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ terrain: window.__batch96Old.terrain,
        environment: window.__batch96Old.environment, currentTerrain: window.__ra2debug.terrainHd,
        currentEnvironment: window.__ra2debug.environmentHd }));
    for (const key of ['terrain', 'environment']) assert(release[key].disposed && release[key].worldChargeBytes === 0);
    await session.page.evaluate(() => window.__installAlliedFixtures());
    return release;
}

async function capture(sample, label) {
    await session.page.evaluate(tile => {
        const d = window.__ra2debug;
        d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
    }, sample.tile);
    await session.page.waitForTimeout(150);
    const result = await session.page.evaluate(() => {
        const d = window.__ra2debug; d.renderer.render();
        const c = d.renderer.renderer.domElement;
        return { png: c.toDataURL('image/png').split(',')[1], size: [c.width, c.height],
            tick: d.game.currentTick, glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(result.glError, 0);
    const file = `${label}-${sample.member}-native.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(result.png, 'base64'));
    delete result.png;
    return { ...result, file, member: sample.member, tile: sample.tile, rescaled: false };
}

async function allocation() {
    const value = await session.page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((n, part) =>
                n + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((n, [, family]) => n + family.report.gpuBytes, 0);
        return { total: d.environmentHd.worldChargeBytes + d.terrainHd.worldChargeBytes + baseline + eager + d.sovietUnitsHd.gpuBytes,
            terrain: d.terrainHd.worldChargeBytes, environment: d.environmentHd.worldChargeBytes,
            budget: d.terrainHd.budget, prepared: { ...d.preparedHdCache } };
    });
    assert.equal(value.budget, (density === 2 ? 512 : 1280) * 1024 ** 2);
    assert(value.total <= value.budget && value.prepared.peakBytes <= 128 * 1024 ** 2);
    return value;
}

let failure;
try {
    const { page, report } = session;
    report.disclosure = '21 complete source members use accepted HD dirt tracks, parking, paving and road surfaces, plus two new source-guided masters. Four wide-road slopes use source-local inverse projection and continuous port-registered paint; original header values remain unchanged. All 98 inherited atlas groups, crops and filter guards remain byte-exact. The timber extra-image edge is newly authored inside its unchanged logical canvas; its main diamond and native depth remain exact. Reveal and stopped AI are controlled inspection fixtures.';
    report.requestedDensity = density;
    report.selectedTerrainRevision = exported.candidate.revision;
    report.maps = [];
    report.sourcePaths = [];
    for (const [index, test] of plan.cases.entries()) {
        const release = index ? await switchMap(test.mapId.split(':')[1], true) : undefined;
        const launch = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { tick: d.game.currentTick, terrain: d.terrainHd, mode: d.game.gameModeType,
                options: d.game.gameOpts, environmentDensity: d.environmentHd.density };
        });
        assert.equal(launch.mode, 0);
        assert.equal(launch.options.gameMode, 1);
        assert.equal(launch.options.credits, 10000);
        if (launch.terrain.density !== density || launch.terrain.groups.some(group => group.status === 'ORIGINAL'))
            report.launchFailure = launch;
        assert.equal(launch.terrain.density, density);
        assert.deepEqual(launch.terrain.groups.filter(group => group.status === 'ORIGINAL'), []);
        for (const name of test.newMembers) {
            const source = sources.get(name);
            assert.equal(launch.terrain.groups.find(group => group.id === source.group)?.status, 'PUBLISHED', name);
            const binding = launch.terrain.placedBindings.find(binding => binding.member === name);
            assert(binding, 'Missing actual original source placement: ' + name);
            assert.equal(binding.sha256, source.sourceSha256);
            report.sourcePaths.push({ mapId: test.mapId, member: name, density,
                group: source.group, sha256: binding.sha256, tile: binding.tile, subTile: binding.subTile });
        }
        const map = { mapId: test.mapId, releaseBeforeLoad: release, launch, captures: [] };
        map.allocation = await allocation();
        const candidates = launch.terrain.placedBindings.filter(binding => test.captureMembers.includes(binding.member));
        const center = [0, 1].map(axis => candidates.reduce((sum, binding) => sum + binding.tile[axis], 0) / candidates.length);
        const route = reference ? reference.maps[index].captures : test.captureMembers.map(member =>
            candidates.filter(binding => binding.member === member).sort((a, b) =>
                (member.startsWith('prslpe') ? Number(b.subTile === 1) - Number(a.subTile === 1) : 0) ||
                Math.hypot(a.tile[0] - center[0], a.tile[1] - center[1])
                - Math.hypot(b.tile[0] - center[0], b.tile[1] - center[1]))[0]);
        for (const sample of route) {
            const binding = launch.terrain.placedBindings.find(binding => binding.member === sample.member
                && binding.tile[0] === sample.tile[0] && binding.tile[1] === sample.tile[1]);
            assert(binding, 'The same original source and camera tile must remain present');
            map.captures.push({ ...await capture(sample, `${index}-${density}x`), sourceSha256: binding.sha256 });
        }
        await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 12,
            launch.tick, { timeout: 15000 });
        map.simulation = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            status: window.__ra2debug.game.status, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
        assert(map.simulation.tick >= launch.tick + 12 && map.simulation.status === 1 && map.simulation.glError === 0);
        report.maps.push(map);
    }
    assert.equal(new Set(report.sourcePaths.map(row => row.member)).size, 21);
    if (density === 4) {
        report.originalRelease = await switchMap(plan.cases[0].mapId.split(':')[1], false);
        report.originalState = await page.evaluate(() => ({ terrain: window.__ra2debug.terrainHd,
            environment: window.__ra2debug.environmentHd }));
        assert.equal(report.originalState.terrain.worldChargeBytes, 0);
        assert.equal(report.originalState.environment.worldChargeBytes, 0);
        report.originalCaptures = [];
        for (const sample of report.maps[0].captures) report.originalCaptures.push(await capture(sample, 'original'));
        report.originalArchitectureRelease = await switchMap('manhatta.map', false);
        report.originalArchitectureCaptures = [];
        for (const sample of report.maps.find(map => map.mapId === 'yr:manhatta.map').captures)
            report.originalArchitectureCaptures.push(await capture(sample, 'original-architecture'));
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
        report.reentry = await switchMap(plan.cases[0].mapId.split(':')[1], true);
        assert.equal(report.reentry.currentTerrain.density, 4);
        report.reentryAllocation = await allocation();
    }
    report.bindingStatus = 'PASS_21_ORIGINAL_SOURCE_PATHS_NATIVE_TICKS_FIXED_BUDGETS_AND_LIFECYCLE';
    report.incrementalScope = 'Four-map minimum source cover, all 21 source paths at each density, all four wide-road orientations, authored masters and inherited-atlas preservation; accepted actor matrices inherit existing evidence.';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: 'PASS_BATCH96_ORIGINAL_SOURCE_BINDINGS', density, output }));
