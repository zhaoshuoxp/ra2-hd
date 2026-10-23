// Validate changed registration/semantics and retain accepted full-matrix evidence elsewhere.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';
import { validateNativeWalls } from '../m2/official-maps/native-walls.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-cross-name-reuse-batch92-20261020';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v2.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const pack = await read(path.join('.local/environment-packs', contract.selectedPack.revision, 'manifest.json'));
const sources = (await read(`${root}/source.json`)).sources;
const names = ['CAPARS05', 'CAMIAM07', 'CAMSC10', 'CARUS11'];
for (const name of names) assert(sources.some(source => source.bindings.some(binding => binding.id === name
    && binding.role === 'body' && binding.mapIds.includes('yr:rushhr.map'))));
assert(sources.some(source => source.bindings.some(binding => binding.id === 'CAFNCP'
    && binding.mapIds.includes('yr:manhatta.map'))));
process.argv.push('--map=rushhr.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});

async function capture(name, label) {
    await session.page.evaluate(name => {
        const d = window.__ra2debug, object = window.__batch92Targets.get(name);
        d.worldInteraction.minimapHandler.panToTile(object.tile);
    }, name);
    await session.page.waitForTimeout(120);
    const result = await session.page.evaluate(name => {
        const d = window.__ra2debug, object = window.__batch92Targets.get(name);
        const r = d.renderableManager.getRenderableByGameObject(object);
        d.renderer.render();
        const source = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        const p = r.getPosition().clone().project(d.worldScene.camera), ratio = source.width / d.renderer.width;
        const w = 720, h = 640, x = (v.x + (p.x + 1) * v.width / 2) * ratio;
        const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const left = Math.max(0, Math.min(source.width - w, Math.round(x - w / 2)));
        const top = Math.max(0, Math.min(source.height - h, Math.round(y - h * .65)));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(source, left, top, w, h, 0, 0, w, h);
        return { png: c.toDataURL().split(',')[1], sourceRect: [left, top, w, h],
            framebuffer: [source.width, source.height], tick: d.game.currentTick,
            binding: window.__m23Binding(object), glError: d.renderer.renderer.getContext().getError() };
    }, name);
    const file = `${name}-${label}-native.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(result.png, 'base64'));
    delete result.png;
    assert.equal(result.glError, 0);
    return { ...result, file, rescaled: false };
}

async function allocation() {
    const value = await session.page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        return { total: d.environmentHd.worldChargeBytes + d.terrainHd.worldChargeBytes + baseline + eager + d.sovietUnitsHd.gpuBytes,
            limit: d.terrainHd.budget, prepared: { ...d.preparedHdCache }, glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(value.limit, (density === 2 ? 512 : 1280) * 1024 ** 2);
    assert(value.total <= value.limit && value.prepared.peakBytes <= 128 * 1024 ** 2 && value.glError === 0);
    return value;
}

async function switchMap(mapName, enabled) {
    await session.page.evaluate(({ mapName, enabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch92Old = { game: d.game, environment: d.environmentHd, terrain: d.terrainHd };
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
        && window.__ra2debug.game !== window.__batch92Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ environment: window.__batch92Old.environment,
        terrain: window.__batch92Old.terrain, currentEnvironment: window.__ra2debug.environmentHd,
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
    report.disclosure = 'Accepted authored structures are reused. Four untouched Rush Hour building placements and Manhattan prison fences cover all five new source paths. Controlled reveal, stopped AI and separate legal garrison fixtures are disclosed; native rules/clocks/maps remain unchanged. Three affected native state families are exercised; accepted unrelated full loops/matrices are not repeated.';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.sourcePaths = [];
    report.launch = await page.evaluate(names => {
        const d = window.__ra2debug;
        window.__batch92Targets = new Map(names.map(name => {
            const object = d.game.getWorld().getAllObjects().find(o => o.name === name && o.isSpawned && !o.isDestroyed);
            if (!object) throw Error('Missing original Rush Hour placement: ' + name);
            return [name, object];
        }));
        return { map: d.game.gameOpts.mapName, mode: d.game.gameModeType, options: d.game.gameOpts,
            environment: d.environmentHd, objects: [...window.__batch92Targets.values()].map(window.__m23Binding) };
    }, names);
    assert.equal(report.launch.mode, 0);
    assert.equal(report.launch.options.gameMode, 1);
    assert.equal(report.launch.options.credits, 10000);
    const expected = {};
    for (const row of exported.records) {
        const [entry] = pack.families[row.family].members;
        const binding = `${entry.sha256}/${row.sourceSha256}/NEWURBAN/tiles/${density}`;
        expected[row.identities[0]] = row.member === 'cnfncp.shp' ? binding : `environment-aggregate/${binding}`;
        report.sourcePaths.push({ member: row.member, density, sourceSha256: row.sourceSha256,
            metadataSha256: entry.sha256, mapId: row.member === 'cnfncp.shp' ? 'yr:manhatta.map' : 'yr:rushhr.map' });
    }
    report.normal = [];
    for (const object of report.launch.objects) {
        assert.equal(object.hd, expected[object.name]);
        const family = report.launch.environment.families[contract.identities.yr[object.name]];
        assert.equal(family.status, 'PUBLISHED_COMPLETE_FAMILY');
        report.normal.push({ name: object.name, capture: await capture(object.name, 'normal') });
    }
    await validateNativeStates(session, ['CAPARS05', 'CAMIAM07', 'CAMSC10'], {});
    assert.equal(report.newNativeStates.status, 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES');
    assert.equal(report.newNativeStates.buildings.length, 3);
    report.damagedTick = await page.evaluate(() => {
        const d = window.__ra2debug;
        for (const object of window.__batch92Targets.values()) object.healthTrait.inflictDamage(
            object.healthTrait.getHitPoints() - Math.floor(object.healthTrait.maxHitPoints * .2), object, d.game);
        return d.game.currentTick;
    });
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 10, report.damagedTick);
    report.damaged = [];
    for (const name of names) {
        const result = await capture(name, 'damaged');
        assert.equal(result.binding.frame, 1);
        assert.equal(result.binding.hd, expected[name]);
        report.damaged.push({ name, capture: result });
    }
    report.destructionTick = await page.evaluate(() => {
        const d = window.__ra2debug;
        for (const object of window.__batch92Targets.values()) {
            object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
            d.game.destroyObject(object, { player: d.localPlayer });
        }
        return d.game.currentTick;
    });
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 100,
        report.destructionTick, { timeout: 45000 });
    report.rubble = [];
    for (const name of names) {
        const result = await capture(name, 'rubble');
        assert(result.binding.destroyed && result.binding.rubble.visible);
        assert.equal(result.binding.rubble.frame, 3);
        assert.equal(result.binding.rubble.hd, expected[name]);
        report.rubble.push({ name, capture: result });
    }
    report.rushHourAllocation = await allocation();
    report.manhattanRelease = await switchMap('manhatta.map', true);
    await validateNativeWalls(session, 'CAFNCP', expected.CAFNCP, 1);
    report.manhattanAllocation = await allocation();
    if (density === 4) {
        report.originalRelease = await switchMap('rushhr.map', false);
        await page.evaluate(names => {
            const d = window.__ra2debug;
            window.__batch92Targets = new Map(names.map(name => [name,
                d.game.getWorld().getAllObjects().find(o => o.name === name && o.isSpawned && !o.isDestroyed)]));
        }, names);
        report.original = [];
        for (const name of names) {
            const result = await capture(name, 'original');
            assert(!result.binding.hd);
            report.original.push({ name, capture: result });
        }
        report.originalAllocation = await page.evaluate(() => ({ environment: window.__ra2debug.environmentHd,
            terrain: window.__ra2debug.terrainHd }));
        assert.equal(report.originalAllocation.environment.worldChargeBytes, 0);
        assert.equal(report.originalAllocation.terrain.worldChargeBytes, 0);
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
    }
    report.bindingStatus = 'PASS_FIVE_ORIGINAL_SOURCE_PATHS_NATIVE_OWNER_CONTACT_RUBBLE_AND_FENCE_ADJACENCY';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: 'PASS_BATCH92_NATIVE_INCREMENTAL_REUSE', density, output }));
