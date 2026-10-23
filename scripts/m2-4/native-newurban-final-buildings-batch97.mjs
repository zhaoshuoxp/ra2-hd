// Original source maps, complete new families, bounded native states and lifecycle evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';
import { recordTechnologyLinkedCycles } from '../m2/official-maps/native-technology.mjs';
import { checkTerrainSourceRecovery } from './native-terrain-source-recovery-batch97.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-remaining-actors-batch97-20261021';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v4.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const sources = (await read(`${root}/source-v1.json`)).sources;
const cases = [
    { map: 'downtown.map', names: ['CABUNK03', 'CABUNK04', 'CABARR01'] },
    { map: 'manhatta.map', names: ['CANEWY04', 'CASLAB'] },
    { map: 'rushhr.map', names: ['CALA05', 'CALA03', 'CARUS08', 'CARUS10', 'CALA06', 'CALA13', 'CALA01', 'CASANF18'] },
];
for (const row of cases) for (const name of row.names) assert(sources.some(s => s.bindings.some(b =>
    b.id === name && b.role === 'body' && b.mapIds.includes('yr:' + row.map))));
process.argv.push('--map=downtown.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = true; g.hdDensity.value = density;
    }, density);
});

async function switchMap(map, enabled) {
    const { page } = session;
    await page.evaluate(({ map, enabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch97Old = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd };
        const g = d.generalOptions.graphics;
        g.hdEnabled.value = enabled; g.hdDensity.value = density;
        const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        localStorage.setItem('_edition:yr:_r_lastMap', map);
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { map, enabled, density });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), map);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__batch97Old.game, undefined, { timeout: 90000 });
    const released = await page.evaluate(() => ({ terrain: window.__batch97Old.terrain,
        environment: window.__batch97Old.environment }));
    for (const kind of ['terrain', 'environment']) assert(released[kind].disposed && released[kind].worldChargeBytes === 0);
    await page.evaluate(() => window.__installAlliedFixtures());
    await installNativeObjectBindings(page);
    return released;
}

async function capture(name, label) {
    const { page } = session;
    await page.evaluate(name => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.name === name && o.isSpawned && !o.isDestroyed);
        d.worldInteraction.minimapHandler.panToTile(object.tile);
    }, name);
    await page.waitForTimeout(140);
    const sample = await page.evaluate(name => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.name === name && o.isSpawned && !o.isDestroyed);
        const r = d.renderableManager.getRenderableByGameObject(object), c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        d.renderer.render();
        const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
        const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const width = 960, height = 720, left = Math.max(0, Math.min(c.width - width, Math.round(x - width / 2)));
        const top = Math.max(0, Math.min(c.height - height, Math.round(y - height * .7)));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(c, left, top, width, height, 0, 0, width, height);
        return { png: canvas.toDataURL().split(',')[1], binding: window.__m23Binding(object),
            source: [left, top, width, height], framebuffer: [c.width, c.height], tick: d.game.currentTick,
            glError: d.renderer.renderer.getContext().getError() };
    }, name);
    const file = `${name}-${label}-native.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(sample.png, 'base64'));
    delete sample.png;
    assert.equal(sample.glError, 0);
    return { ...sample, file, rescaled: false };
}

async function allocation() {
    return session.page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const initial = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, p) =>
                sum + p.bitmap.width * p.bitmap.height * 5 + p.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        return { total: d.terrainHd.worldChargeBytes + d.environmentHd.worldChargeBytes + initial + eager + d.sovietUnitsHd.gpuBytes,
            limit: d.terrainHd.budget, terrain: d.terrainHd, environment: d.environmentHd,
            prepared: { ...d.preparedHdCache }, glError: d.renderer.renderer.getContext().getError() };
    });
}

async function secretLab() {
    const { page, report } = session;
    const result = report.secretLab = {};
    const sample = () => page.evaluate(() => {
        const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === window.__batch97LabId);
        return { ...window.__m23Binding(o), owned: o.owner === window.__allied.player,
            capturable: o.rules.capturable, needsEngineer: o.rules.needsEngineer, secretLab: o.rules.secretLab,
            secretProduction: o.secretProduction, engineerConsumed: !window.__batch97LabEngineer?.isSpawned };
    });
    const id = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const o = d.game.getWorld().getAllObjects().find(o => o.name === 'CASLAB' && o.owner.isNeutral && o.isSpawned);
        if (!o) throw Error('Missing original neutral Secret Lab');
        window.__batch97LabId = o.id;
        window.__batch97LabEngineer = f.spawn('ENGINEER', 3, o.tile);
        d.actionsApi.orderUnits([window.__batch97LabEngineer.id], 7, o.id);
        return o.id;
    });
    await page.waitForFunction(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().find(o => o.id === window.__batch97LabId)?.owner === window.__allied.player;
    }, undefined, { timeout: 45000 });
    result.captured = await sample();
    assert(result.captured.owned && result.captured.engineerConsumed && result.captured.secretLab && result.captured.hd);
    result.capturedCapture = await capture('CASLAB', 'captured');
    const cycles = [{ member: 'cgslab_f.shp', frameCount: 32 }];
    await recordTechnologyLinkedCycles(session, id, cycles, 'normal');
    await page.evaluate(id => {
        const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
        o.healthTrait.inflictDamage(Math.floor(o.healthTrait.maxHitPoints * .75), o, d.game);
    }, id);
    await page.waitForTimeout(200);
    result.damaged = await sample();
    assert.equal(result.damaged.frame, 1);
    await recordTechnologyLinkedCycles(session, id, cycles, 'damaged');
    await page.evaluate(id => {
        const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === id);
        window.__batch97RepairEngineer = window.__allied.spawn('ENGINEER', 3, o.tile);
        d.actionsApi.orderUnits([window.__batch97RepairEngineer.id], 7, id);
    }, id);
    await page.waitForFunction(() => {
        const d = window.__ra2debug, o = d.game.getWorld().getAllObjects().find(o => o.id === window.__batch97LabId);
        return o.healthTrait.health === 100;
    }, undefined, { timeout: 45000 });
    result.repaired = await sample();
    assert.equal(result.repaired.frame, 0);
    assert(result.repaired.owned && result.repaired.secretProduction === result.captured.secretProduction);
}

let failure;
try {
    const { page, report } = session;
    await installNativeObjectBindings(page);
    report.candidate = exported.candidate; report.requestedDensity = density;
    report.disclosure = 'Three original maps are a minimum cover of all fourteen physical source paths. Original placements prove loading; separate legal native foundations and native orders exercise new artwork states. No map/archive/rule edits, forced animation phase, repeated accepted actor matrix or natural-match claim.';
    report.maps = []; report.sourcePaths = [];
    const counts = Object.fromEntries(sources.filter(s => s.member !== 'cgslab_f.shp').map(s => [s.bindings[0].id,
        s.totalFrames / (s.hasShadow ? 2 : 1)]));
    for (const [index, row] of cases.entries()) {
        const release = index ? await switchMap(row.map, true) : undefined;
        const before = await allocation();
        assert.equal(before.glError, 0);
        assert(before.total <= before.limit && before.prepared.peakBytes <= 128 * 1024 ** 2);
        assert(before.terrain.groups.every(g => g.status === 'PUBLISHED'));
        const state = await page.evaluate(() => ({ type: window.__ra2debug.game.gameModeType,
            options: window.__ra2debug.game.gameOpts, tick: window.__ra2debug.game.currentTick }));
        assert.equal(state.type, 0); assert.equal(state.options.gameMode, 1); assert.equal(state.options.credits, 10000);
        const record = { map: row.map, names: row.names, releaseBefore: release, launch: state, allocationBefore: before, normal: [] };
        report.maps.push(record);
        if (!index && density === 2) await checkTerrainSourceRecovery(session);
        for (const name of row.names) {
            const family = contract.identities.yr[name];
            assert.equal(before.environment.families[family].status, 'PUBLISHED_COMPLETE_FAMILY');
            assert.equal(before.environment.families[family].density, density);
            const captured = await capture(name, 'original-placement');
            assert(captured.binding.hd);
            record.normal.push({ name, capture: captured });
            for (const member of contract.families[family].members) report.sourcePaths.push({ member, density, map: row.map,
                sourceSha256: contract.sources[member].sha256, objectId: captured.binding.id });
        }
        if (row.names.includes('CASLAB')) await secretLab();
        await validateNativeStates(session, row.names, counts);
        record.nativeStates = report.newNativeStates;
        assert.equal(record.nativeStates.status, 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES');
        record.allocationAfter = await allocation();
        assert(record.allocationAfter.total <= before.limit);
    }
    assert.equal(new Set(report.sourcePaths.map(r => r.member)).size, 14);
    report.originalControls = [];
    if (density === 4) for (const row of cases) {
        const release = await switchMap(row.map, false), captures = [];
        for (const name of row.names) {
            const captureResult = await capture(name, 'original-control');
            assert(!captureResult.binding.hd); captures.push({ name, capture: captureResult });
        }
        report.originalControls.push({ map: row.map, release, captures });
        const current = await allocation();
        assert(current.terrain.worldChargeBytes === 0 && current.environment.worldChargeBytes === 0);
    }
    report.crossTheater = await switchMap('saharami.map', true);
    report.desertAllocation = await allocation();
    assert(report.desertAllocation.total <= report.desertAllocation.limit);
    report.reentry = await switchMap('downtown.map', true);
    const reentry = await allocation();
    assert(reentry.terrain.groups.every(g => g.status === 'PUBLISHED'));
    report.bindingStatus = 'PASS_14_ORIGINAL_SOURCE_PATHS_13_COMPLETE_FAMILIES_NATIVE_STATES_AND_RELEASE';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ density, output, status: 'PASS_BATCH97_NEWURBAN_FINAL_BUILDINGS' }));
