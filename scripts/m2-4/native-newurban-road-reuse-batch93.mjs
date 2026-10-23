// Cover every new road source on the smallest original-map set, without long repeated matches.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v7.json`);
const plan = await read(`${root}/native-case-plan-v1.json`);
assert.deepEqual(await read('.local/terrain-newurban-selection.json'), exported.candidate);
const sourceByMember = new Map(exported.records.map(row => [row.member, row]));
const changedSlopes = process.argv.includes('--changed-slopes-only');
const safeFallback = process.argv.includes('--explicit-slope-fallback');
const cases = safeFallback ? [{ ...plan.cases[0], newMembers: ['proad01.ubn', 'proad10.ubn', 'proad14.ubn', 'proad18.ubn', 'proadc13.ubn', 'proadc14.ubn'], captureMembers: ['proad01.ubn', 'proad10.ubn', 'proad14.ubn', 'proad18.ubn', 'prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn'] }] : changedSlopes ? [{ ...plan.cases[0], newMembers: ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn'], captureMembers: ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn', 'proad01.ubn', 'proad02.ubn', 'proad10.ubn'] }] : plan.cases;
const reference = density === 4 ? await read(`${root}/${safeFallback ? 'native-safe-2x-v1' : changedSlopes ? 'native-slopes-2x-v2' : 'native-2x-v1'}/report.json`) : undefined;
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
        window.__batch93Old = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd };
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
        && window.__ra2debug.game !== window.__batch93Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ terrain: window.__batch93Old.terrain,
        environment: window.__batch93Old.environment, currentTerrain: window.__ra2debug.terrainHd,
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
    report.disclosure = 'Four unchanged original maps cover all 34 new road sources once per density. Accepted Urban paved-junction forms and Temperate curves/ends/slopes share the accepted NewUrban bridge-contact asphalt. Original source geometry/depth, native clocks/rules and all 22 prior terrain groups remain unchanged. Reveal and stopped AI are controlled inspection fixtures, not a natural-match claim.';
    if (safeFallback) report.disclosure = 'Final safe selection: thirty new complete road sources retain exact two-density payload/native evidence. Four unresolved slope sources intentionally use complete Original rendering and remain coverage gaps. This actual selected-app case checks representative roads, original slope sources, native ticks, budgets and lifecycle. No map or original mechanism changes.';
    report.requestedDensity = density;
    report.selectedTerrainRevision = exported.candidate.revision;
    report.maps = [];
    report.sourcePaths = [];
    for (const [index, test] of cases.entries()) {
        const release = index ? await switchMap(test.mapId.split(':')[1], true) : undefined;
        const launch = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { tick: d.game.currentTick, terrain: d.terrainHd, mode: d.game.gameModeType,
                options: d.game.gameOpts, environmentDensity: d.environmentHd.density };
        });
        assert.equal(launch.mode, 0);
        assert.equal(launch.options.gameMode, 1);
        assert.equal(launch.options.credits, 10000);
        assert.equal(launch.terrain.density, density);
        for (const name of test.newMembers) {
            const source = sourceByMember.get(name);
            assert(source);
            const published = launch.terrain.groups.find(group => group.id === source.group);
            assert.equal(published?.status, 'PUBLISHED', name + ' complete load family');
            const binding = launch.terrain.placedBindings.find(binding => binding.member === name);
            assert(binding, 'Missing original road source placement: ' + name);
            assert.equal(binding.sha256, source.sourceSha256);
            report.sourcePaths.push({ mapId: test.mapId, member: name, density,
                group: source.group, sha256: binding.sha256, tile: binding.tile, subTile: binding.subTile });
        }
        const map = { mapId: test.mapId, releaseBeforeLoad: release, launch, captures: [] };
        let fallback = [];
        if (safeFallback) {
            fallback = await page.evaluate(async () => {
                const layer = window.__ra2debug.mapRenderable.tileLayer, sets = layer.theater.tileSets;
                const rows = [];
                for (const name of ['prslpe01.ubn', 'prslpe02.ubn', 'prslpe03.ubn', 'prslpe04.ubn']) {
                    let file, tileNum;
                    for (let i = 0; i < sets.readMaxTileNum(); i++) {
                        const match = sets.getTile(i)?.files?.find(file => file?.filename === name);
                        if (match) { file = match; tileNum = i; break; }
                    }
                    if (!file) throw Error('Original slope source missing: ' + name);
                    const tile = layer.allTiles.find(tile => tile.tileNum === tileNum);
                    if (!tile) throw Error('Original slope placement missing: ' + name);
                    const hd = file.images.some(image => layer.theater.terrainHd.bindings.has(image));
                    const digest = await crypto.subtle.digest('SHA-256', file.sourceBytes);
                    rows.push({ member: name, tile: [tile.rx, tile.ry, tile.z, tile.tileNum, tile.subTile],
                        sha256: Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join(''),
                        hasAnyHdBinding: hd, group: 'EXPLICIT_COMPLETE_ORIGINAL_FALLBACK' });
                }
                return rows;
            });
            assert(fallback.length === 4 && fallback.every(row => !row.hasAnyHdBinding));
            assert(!launch.terrain.placedBindings.some(row => row.member.startsWith('prslpe')));
            map.originalSlopeFallback = fallback;
        }
        const candidates = [...launch.terrain.placedBindings.filter(binding => test.newMembers.includes(binding.member) || test.captureMembers.includes(binding.member)), ...fallback];
        const center = [0, 1].map(axis => candidates.reduce((sum, binding) => sum + binding.tile[axis], 0) / candidates.length);
        const route = reference ? reference.maps[index].captures : test.captureMembers.map(member =>
            candidates.filter(binding => binding.member === member).sort((a, b) =>
                Math.hypot(a.tile[0] - center[0], a.tile[1] - center[1])
                - Math.hypot(b.tile[0] - center[0], b.tile[1] - center[1]))[0]);
        for (const sample of route) {
            const sameTile = [...launch.terrain.placedBindings, ...fallback].filter(binding => binding.tile[0] === sample.tile[0] && binding.tile[1] === sample.tile[1]);
            const actual = sameTile.find(binding => binding.member === sample.member)
                ?? sameTile.find(binding => /^proad0[12][abc]?\.ubn$/.test(binding.member)
                    && binding.member.replace(/[abc]?(?=\.ubn$)/, '') === sample.member.replace(/[abc]?(?=\.ubn$)/, ''));
            assert(actual, 'Same original camera tile must retain the target source or an accepted straight-road visual variant');
            const saved = await capture(sample, `${index}-${density}x`);
            map.captures.push({ ...saved, actualMember: actual.member, sourceSha256: actual.sha256 });
        }
        await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 12,
            launch.tick, { timeout: 15000 });
        map.simulation = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            status: window.__ra2debug.game.status, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
        assert(map.simulation.tick >= launch.tick + 12 && map.simulation.status === 1 && map.simulation.glError === 0);
        map.allocation = await allocation();
        report.maps.push(map);
    }
    assert.equal(new Set(report.sourcePaths.map(row => row.member)).size, safeFallback ? 6 : changedSlopes ? 4 : 34);
    if (density === 4) {
        report.originalRelease = await switchMap(plan.cases[0].mapId.split(':')[1], false);
        report.originalState = await page.evaluate(() => ({ terrain: window.__ra2debug.terrainHd,
            environment: window.__ra2debug.environmentHd }));
        assert.equal(report.originalState.terrain.worldChargeBytes, 0);
        assert.equal(report.originalState.environment.worldChargeBytes, 0);
        report.originalCaptures = [];
        for (const sample of reference.maps[0].captures) report.originalCaptures.push(await capture(sample, 'original'));
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
    }
    report.bindingStatus = safeFallback ? 'PASS_SELECTED_ROADS_AND_FOUR_EXPLICIT_COMPLETE_ORIGINAL_SLOPE_FALLBACKS' : changedSlopes ? 'PASS_FOUR_UPDATED_SLOPE_SOURCE_PATHS_NATIVE_JOINTS_AND_FIXED_BUDGET' : 'PASS_34_ORIGINAL_ROAD_SOURCE_PATHS_FOUR_MAPS_NATIVE_TICKS_AND_FIXED_BUDGET';
    report.incrementalScope = safeFallback ? 'Six representative selected road paths and four complete Original source fallbacks; thirty unchanged new source paths inherit the prior two-density matrix. The four slopes remain counted as missing.' : changedSlopes ? 'Four updated slope sources and unchanged actual straight/curve neighbours; thirty other source paths retain exact payloads and previous two-density native evidence.' : 'All thirty-four source paths.';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: 'PASS_BATCH93_ORIGINAL_ROAD_BINDINGS', density, output }));
