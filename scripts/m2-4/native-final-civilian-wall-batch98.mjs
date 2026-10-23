// Validate both final actors and the two actual fortress-wall loading routes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';

const [stage, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const reuseCivilianPrefix = '--reuse-civilian=';
const reuseCivilian = process.argv.find(arg => arg.startsWith(reuseCivilianPrefix))?.slice(reuseCivilianPrefix.length);
const root = '.artifacts/m2-4/newurban-final-actors-batch98-20261021';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const contract = await read(`${root}/final-actors-contract-selected-v4.json`);
const folder = `.local/environment-packs/${contract.selectedPack.revision}`;
const pack = await read(`${folder}/manifest.json`);
const member = name => pack.families[contract.identities.yr[name]].members[0];
const expected = name => `${member(name).sha256}/${contract.sources[member(name).member].sha256}/NEWURBAN/tiles/${density}`;
const coreFamily = await read('.local/hd-packs/yuri-coverage-gafwll-temperate/c1/family.json');
const core = coreFamily.members[0];
const coreExpected = `${core.sha256}/${contract.sources['ggfwll.shp'].sha256}/TEMPERATE/tiles/${density}`;
process.argv.push('--map=manhatta.map', '--bot-slot=1');
const session = await startSession(stage, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});
const { page, report } = session;

async function allocation() {
    const result = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const initial = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        return { total: initial + eager + d.sovietUnitsHd.gpuBytes + d.terrainHd.worldChargeBytes + d.environmentHd.worldChargeBytes,
            limit: d.terrainHd.budget, terrain: d.terrainHd, environment: d.environmentHd,
            prepared: { ...d.preparedHdCache }, glError: d.renderer.renderer.getContext().getError() };
    });
    const fallback = Object.entries(result.environment.families).filter(([, family]) => family.density !== density);
    assert.deepEqual(fallback, [], 'Every selected environment family must retain the requested density');
    return result;
}

async function switchMap(map, enabled) {
    await page.evaluate(({ map, enabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch98Old = { game: d.game, terrain: d.terrainHd, environment: d.environmentHd,
            demand: d.worldView.sovietUnitsHd, fortress: d.worldView.sovietBuildingsHd.GAFWLL };
        d.generalOptions.graphics.hdEnabled.value = enabled;
        d.generalOptions.graphics.hdDensity.value = density;
        const bots = Array(8).fill(null);
        bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        localStorage.setItem('_edition:yr:_r_lastMap', map);
        localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
        d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
    }, { map, enabled, density });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), map);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
        && window.__ra2debug.game !== window.__batch98Old.game, undefined, { timeout: 90000 });
    const released = await page.evaluate(() => ({ terrain: window.__batch98Old.terrain,
        environment: window.__batch98Old.environment, demandBytes: window.__batch98Old.demand.report.gpuBytes,
        demandFamilies: window.__batch98Old.demand.families.size,
        fortressOverrides: window.__batch98Old.fortress?.overrides.size ?? 0 }));
    for (const kind of ['terrain', 'environment']) assert(released[kind].disposed && released[kind].worldChargeBytes === 0);
    assert.equal(released.demandBytes, 0);
    assert.equal(released.demandFamilies, 0);
    assert.equal(released.fortressOverrides, 0);
    await page.evaluate(() => window.__installAlliedFixtures());
    await installNativeObjectBindings(page);
    return released;
}

async function capture(id, label) {
    await page.evaluate(id => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.id === id);
        d.worldInteraction.minimapHandler.panToTile(object.tile);
    }, id);
    await page.waitForTimeout(120);
    const sample = await page.evaluate(id => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.id === id);
        const r = d.renderableManager.getRenderableByGameObject(object), c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        d.renderer.render();
        const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
        const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const width = Math.min(800, c.width), height = Math.min(640, c.height);
        const left = Math.max(0, Math.min(c.width - width, Math.round(x - width / 2)));
        const top = Math.max(0, Math.min(c.height - height, Math.round(y - height * .7)));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(c, left, top, width, height, 0, 0, width, height);
        return { png: canvas.toDataURL().split(',')[1], binding: window.__m23Binding(object),
            source: [left, top, width, height], framebuffer: [c.width, c.height], tick: d.game.currentTick,
            glError: d.renderer.renderer.getContext().getError() };
    }, id);
    const file = `${label}.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(sample.png, 'base64'));
    delete sample.png;
    assert.equal(sample.glError, 0);
    return { ...sample, file, rescaled: false };
}

async function launch() {
    const result = await page.evaluate(() => ({ mode: window.__ra2debug.game.gameModeType,
        options: window.__ra2debug.game.gameOpts,
        sourceSha256: window.__ra2debug.game.officialSkirmishSourceSha256,
        tick: window.__ra2debug.game.currentTick }));
    assert.equal(result.mode, 0);
    assert.equal(result.options.gameMode, 1);
    assert.equal(result.options.credits, 10000);
    return result;
}

let failure;
try {
    report.disclosure = 'Original Manhattan, Rush Hour and Ground Zero sources and native simulation. Controlled reveal/stopped AI and bounded legal fixtures use the accepted helper. New actor bodies, exact accepted wall reuse and one missing Yuri wall demand lease are checked; no faction matrix, Windows or visual-acceptance claim.';
    report.candidate = contract.selectedPack;
    report.requestedDensity = density;
    await installNativeObjectBindings(page);
    report.manhattan = { launch: await launch(), before: await allocation() };
    const civilian = await page.evaluate(() => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.name === 'CIV1' && o.isSpawned);
        return window.__m23Binding(object);
    });
    assert.equal(civilian.hd, expected('CIV1'));
    report.manhattan.originalPlacement = await capture(civilian.id, 'CIV1-original-placement');
    if (reuseCivilian) {
        const bytes = await fs.readFile(reuseCivilian), prior = JSON.parse(bytes);
        assert.equal(prior.requestedDensity, density);
        assert.deepEqual(prior.candidate, contract.selectedPack);
        const actor = prior.manhattan.nativeStates.actors[0];
        assert.equal(actor.name, 'CIV1');
        assert.equal(actor.samples.ready.bodyFrameCount, 238);
        assert(actor.samples.walk.moving && actor.samples.death.destroyed && actor.trace.length > 0);
        assert.equal(actor.samples.ready.hd, expected('CIV1'));
        report.manhattan.nativeStates = prior.manhattan.nativeStates;
        report.manhattan.reusedCivilianEvidence = { file: reuseCivilian,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            scope: 'Completed CIV1 state subcase only; the enclosing failed wall fixture is not passing evidence.' };
    } else {
        await validateNativeStates(session, ['CIV1'], { CIV1: 238 }, false, { recordEachActor: true });
        report.manhattan.nativeStates = report.newNativeStates;
    }
    report.lateOverlayFortress = await page.evaluate(() => {
        const d = window.__ra2debug, game = d.game;
        const tile = game.map.tiles.getAll().find(t => game.map.isWithinBounds(t)
            && !t.rampType && game.map.getTileZone(t, true) === 0 && !game.map.getObjectsOnTile(t).length);
        if (!tile) throw Error('No legal late wall overlay tile');
        const object = game.createObject(4, 'GAFWLL');
        object.overlayId = game.rules.getOverlayId('GAFWLL');
        object.value = 0;
        game.spawnObject(object, tile);
        window.__batch98ConstructedFortress = object;
        return { id: object.id, environmentPreloaded: !!d.environmentHd.families['newurban-gafwll'] };
    });
    assert.equal(report.lateOverlayFortress.environmentPreloaded, false);
    try {
        await page.waitForFunction(expected => window.__m23Binding(window.__batch98ConstructedFortress).hd === expected,
            coreExpected, { timeout: 30000 });
    } catch (error) {
        report.lateOverlayFortress.failureState = await page.evaluate(() => ({
            binding: window.__m23Binding(window.__batch98ConstructedFortress),
            queue: window.__ra2debug.sovietUnitsHd.families.GAFWLL }));
        throw error;
    }
    report.lateOverlayFortress.capture = await capture(report.lateOverlayFortress.id, 'GAFWLL-accepted-demand-route');
    report.lateOverlayFortress.queue = await page.evaluate(() => window.__ra2debug.worldView.sovietUnitsHd.report.families.GAFWLL);
    assert.equal(report.lateOverlayFortress.queue.status, 'READY');
    report.constructedFortress = await page.evaluate(() => {
        const d = window.__ra2debug, worker = d.game.getConstructionWorker(d.localPlayer);
        const tile = d.game.map.tiles.getAll().find(t => worker.canPlaceAt('GAFWLL', t,
            { normalizedTile: true, ignoreAdjacent: true }));
        if (!tile) throw Error('No legal native fortress wall foundation');
        const [object] = worker.placeAt('GAFWLL', tile, true);
        window.__batch98BuiltFortress = object;
        return { id: object.id, tile: [object.tile.rx, object.tile.ry], route: 'ConstructionWorker.placeAt' };
    });
    await page.waitForFunction(expected => window.__m23Binding(window.__batch98BuiltFortress).hd === 'gafwll/0:' + expected,
        coreExpected, { timeout: 30000 });
    report.constructedFortress.capture = await capture(report.constructedFortress.id, 'GAFWLL-native-construction-route');
    report.manhattan.after = await allocation();
    assert(report.manhattan.after.total <= report.manhattan.after.limit);
    report.dinosaur = { releaseBefore: await switchMap('rushhr.map', true), launch: await launch(), before: await allocation() };
    const dinosaur = await page.evaluate(() => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.name === 'DNOA' && o.isSpawned);
        return window.__m23Binding(object);
    });
    assert.equal(dinosaur.hd, expected('DNOA'));
    report.dinosaur.originalPlacement = await capture(dinosaur.id, 'DNOA-original-placement');
    await validateNativeStates(session, ['DNOA'], { DNOA: 424 }, false,
        { recordEachActor: true, nativeWoundDamageByActor: { DNOA: 40 } });
    report.dinosaur.nativeStates = report.newNativeStates;
    assert(report.dinosaur.nativeStates.actors[0].trace.filter(sample => !sample.pending).every(sample => sample.frame < 212));
    report.dinosaur.after = await allocation();
    assert(report.dinosaur.after.total <= report.dinosaur.after.limit);
    report.groundZero = { releaseBefore: await switchMap('groundze.map', true), launch: await launch(), before: await allocation() };
    report.groundZero.walls = await page.evaluate(() => {
        const d = window.__ra2debug;
        return d.game.getWorld().getAllObjects().filter(o => o.name === 'GAFWLL' && o.isSpawned).map(o => window.__m23Binding(o));
    });
    assert(report.groundZero.walls.length > 0 && report.groundZero.walls.every(wall => wall.hd === expected('GAFWLL')));
    const wall = report.groundZero.walls[0];
    report.groundZero.normal = await capture(wall.id, 'GAFWLL-original-wall-normal');
    await page.evaluate(id => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.id === id);
        window.__batch98DamagedWall = object;
        object.healthTrait.inflictDamage(Math.ceil(object.healthTrait.maxHitPoints * .65), undefined, d.game);
    }, wall.id);
    await page.waitForFunction(() => window.__m23Binding(window.__batch98DamagedWall).frame >= 16, undefined, { timeout: 15000 });
    report.groundZero.damaged = await capture(wall.id, 'GAFWLL-native-wall-damaged');
    assert.equal(report.groundZero.damaged.binding.hd, expected('GAFWLL'));
    await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__batch98DamagedWall;
        object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, undefined, d.game);
        if (!object.isDestroyed) d.game.destroyObject(object, { player: d.localPlayer });
    });
    await page.waitForFunction(() => !window.__batch98DamagedWall.isSpawned || window.__batch98DamagedWall.isDestroyed);
    report.groundZero.destroyed = await page.evaluate(() => ({ destroyed: window.__batch98DamagedWall.isDestroyed,
        spawned: window.__batch98DamagedWall.isSpawned }));
    const tick = await page.evaluate(() => window.__ra2debug.game.currentTick);
    await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 16, tick);
    report.groundZero.nativeTicksAdvanced = 16;
    report.groundZero.after = await allocation();
    assert(report.groundZero.after.total <= report.groundZero.after.limit);
    report.original = { releaseBefore: await switchMap('groundze.map', false), launch: await launch() };
    const originalWall = await page.evaluate(() => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.name === 'GAFWLL' && o.isSpawned);
        return window.__m23Binding(object);
    });
    assert(!originalWall.hd);
    report.original.capture = await capture(originalWall.id, 'GAFWLL-original-fallback');
    report.originalDinosaur = { releaseBefore: await switchMap('rushhr.map', false), launch: await launch() };
    const originalDinosaur = await page.evaluate(() => window.__m23Binding(window.__ra2debug.game.getWorld()
        .getAllObjects().find(o => o.name === 'DNOA' && o.isSpawned)));
    assert(!originalDinosaur.hd);
    report.originalDinosaur.capture = await capture(originalDinosaur.id, 'DNOA-original-fallback');
    report.originalCivilian = { releaseBefore: await switchMap('manhatta.map', false), launch: await launch() };
    const originalCivilian = await page.evaluate(() => window.__m23Binding(window.__ra2debug.game.getWorld()
        .getAllObjects().find(o => o.name === 'CIV1' && o.isSpawned)));
    assert(!originalCivilian.hd);
    report.originalCivilian.capture = await capture(originalCivilian.id, 'CIV1-original-fallback');
    if (density === 2) {
        report.crossTheater = { releaseBefore: await switchMap('xmp26s6.map', true),
            launch: await launch(), allocation: await allocation() };
    }
    report.reentry = { releaseBefore: await switchMap('manhatta.map', true), launch: await launch(), allocation: await allocation() };
    assert.equal(report.reentry.allocation.environment.families['newurban-civ1'].density, density);
    assert(report.reentry.allocation.total <= report.reentry.allocation.limit);
    assert.equal(report.errors.length, 0);
    report.technicalStatus = 'PASS_BOTH_ACTORS_AND_WALL_ROUTES_NATIVE_STATES_RELEASE_ORIGINAL_AND_REENTRY';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, technical: report.technicalStatus, density }));
