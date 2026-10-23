// Check each newly complete source once per density on unchanged official placements.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-buildings-batch88-20261020';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v2.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const packRoot = path.join('.local/environment-packs', contract.selectedPack.revision);
const pack = await read(path.join(packRoot, 'manifest.json'));
const sources = (await read(`${root}/source.json`)).sources;
const preparation = await read('.artifacts/m2-4/newurban-building-references-batch88-v1/source-preparation-v1.json');
const remaining = new Set(sources.map(source => source.member)), cases = [];
while (remaining.size) {
    const maps = [...new Set(preparation.records.flatMap(row => row.mapIds))];
    const ranked = maps.map(mapId => ({ mapId, members: preparation.records
        .filter(row => row.mapIds.includes(mapId) && remaining.has(row.member)).map(row => row.member).sort() }))
        .sort((a, b) => b.members.length - a.members.length || a.mapId.localeCompare(b.mapId));
    const chosen = ranked[0];
    assert(chosen.members.length > 0);
    cases.push(chosen);
    for (const name of chosen.members) remaining.delete(name);
}
assert.equal(cases.length, 4);
process.argv.push('--map=' + cases[0].mapId.split(':')[1], '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});

async function switchMap(mapName, hdEnabled = true) {
    await session.page.evaluate(({ mapName, hdEnabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch88Old = { game: d.game, environment: d.environmentHd, terrain: d.terrainHd };
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
        && window.__ra2debug.game !== window.__batch88Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ environment: window.__batch88Old.environment,
        terrain: window.__batch88Old.terrain, currentEnvironment: window.__ra2debug.environmentHd,
        currentTerrain: window.__ra2debug.terrainHd }));
    for (const key of ['environment', 'terrain']) {
        assert(release[key].disposed && release[key].worldChargeBytes === 0);
    }
    await session.page.evaluate(() => window.__installAlliedFixtures());
    await installNativeObjectBindings(session.page);
    return release;
}

let failure;
try {
    const { page, report } = session;
    report.disclosure = 'Four unchanged official maps cover all 39 new complete source paths once at this density. Original placed objects use normal native damage/destruction; initially destroyed objects are observed directly. Original explosion effects finish naturally. CAFARM02 keeps original LeaveRubble disabled. Accepted bodies and shared rubble reuse exact pixel/state evidence. Inherited reveal/stopped AI is a controlled review fixture, not a natural-match claim. No map, rule, source, camera, owner, animation, collision or shadow change.';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.deduplication = { key: ['original member', 'source SHA-256', 'density', 'actual native loader'],
        cases, allPlacementMaps: [...new Set(preparation.records.flatMap(row => row.mapIds))].sort(),
        reason: 'Identical source/runtime paths on multiple placements/maps are covered once; all placement map identities stay recorded.' };
    report.maps = [];
    for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        const test = cases[caseIndex], mapName = test.mapId.split(':')[1];
        const release = caseIndex ? await switchMap(mapName) : undefined;
        await installNativeObjectBindings(page);
        const state = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            window.__batch88Targets = new Map();
            window.__batch88ExplosionNames = () => d.renderableManager.getRenderableContainer().getChildren()
                .filter(child => typeof child.isAnimFinished === 'function' && !child.isAnimFinished()
                    && /^(TWLT|S_(BANG|BRNL|CLSN|TUMU))/i.test(child.name ?? '')).map(child => child.name);
            return { environment: d.environmentHd, terrain: d.terrainHd, modeType: g.gameModeType,
                options: g.gameOpts, tick: g.currentTick, shroudRevealed: true, aiStopped: true };
        });
        assert.equal(state.environment.density, density);
        assert.equal(state.terrain.density, density);
        assert.equal(state.modeType, 0);
        assert.equal(state.options.gameMode, 1);
        assert.equal(state.options.credits, 10000);
        const mapReport = { mapId: test.mapId, releaseBeforeLoad: release,
            environment: state.environment, terrain: state.terrain, launch: state, sources: [] };
        report.maps.push(mapReport);
        for (const member of test.members) {
            const source = sources.find(source => source.member === member);
            const [name] = [...new Set(source.bindings.map(binding => binding.id))];
            const family = contract.identities.yr[name];
            const [entry] = pack.families[family].members;
            assert.equal(entry.member, member);
            const expected = `environment-aggregate/${entry.sha256}/${source.sha256}/NEWURBAN/tiles/${density}`;
            assert.equal(state.environment.families[family].status, 'PUBLISHED_COMPLETE_FAMILY');
            assert.deepEqual(state.environment.families[family].attempts, []);
            const original = await page.evaluate(({ name, member }) => {
                const d = window.__ra2debug;
                const candidates = d.game.getWorld().getAllObjects().filter(object => object.name === name)
                    .filter(object => window.__m23Binding(object).mainMember === member);
                const object = candidates.find(object => object.isSpawned && !object.isDestroyed) ?? candidates[0];
                if (!object) throw Error('Missing unchanged original source placement: ' + name + ' / ' + member);
                window.__batch88Targets.set(name, { object,
                    renderable: d.renderableManager.getRenderableByGameObject(object) });
                return window.__m23Binding(object);
            }, { name, member });
            assert.equal(original.hd, expected);
            mapReport.sources.push({ name, member, family, metadataSha256: entry.sha256,
                sourceSha256: source.sha256, expected, original, alreadyDestroyed: original.destroyed,
                nativeRubbleUsed: member !== 'cnfarm02.shp' });
        }
        mapReport.tickBeforeDestruction = await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const { object } of window.__batch88Targets.values()) {
                if (!object.isDestroyed) {
                    object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
                    d.game.destroyObject(object, { player: d.localPlayer });
                }
            }
            return d.game.currentTick;
        });
        await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 100
            && window.__batch88ExplosionNames().length === 0, mapReport.tickBeforeDestruction, { timeout: 45000 });
        for (const row of mapReport.sources) {
            await page.evaluate(tile => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
            }, row.original.tile);
            await page.waitForTimeout(100);
            const captureHandle = await page.waitForFunction(name => {
                if (window.__batch88ExplosionNames().length) return false;
                const d = window.__ra2debug, target = window.__batch88Targets.get(name);
                d.renderer.render();
                const canvas = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
                const p = target.renderable.getPosition().clone().project(d.worldScene.camera);
                const ratio = canvas.width / d.renderer.width;
                const cx = (viewport.x + (p.x + 1) * viewport.width / 2) * ratio;
                const cy = (viewport.y + (1 - p.y) * viewport.height / 2) * ratio;
                const width = 960, height = 720;
                const left = Math.max(0, Math.min(canvas.width - width, Math.round(cx - width / 2)));
                const top = Math.max(0, Math.min(canvas.height - height, Math.round(cy - height / 2)));
                const detail = document.createElement('canvas'); detail.width = width; detail.height = height;
                detail.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
                const rubble = target.renderable.rubbleObj;
                return { png: detail.toDataURL('image/png').split(',')[1], source: [left, top, width, height],
                    buffer: [canvas.width, canvas.height], tick: d.game.currentTick,
                    destroyed: target.object.isDestroyed, spawned: target.object.isSpawned,
                    rubble: rubble && { visible: rubble.get3DObject()?.visible,
                        frame: rubble.builder.getFrame(), hd: rubble.builder.hdOverride?.identity },
                    activeNativeExplosionEffects: window.__batch88ExplosionNames(),
                    glError: d.renderer.renderer.getContext().getError() };
            }, row.name, { timeout: 30000 });
            const capture = await captureHandle.jsonValue();
            await captureHandle.dispose();
            assert(capture.destroyed && capture.tick >= mapReport.tickBeforeDestruction + 100);
            assert.equal(capture.glError, 0);
            assert.deepEqual(capture.activeNativeExplosionEffects, []);
            if (row.nativeRubbleUsed) {
                assert(capture.rubble?.visible);
                assert.equal(capture.rubble.frame, 3);
                assert.equal(capture.rubble.hd, row.expected);
            } else {
                assert(!capture.spawned && !capture.rubble?.visible);
            }
            const file = `${mapName}-${row.name}-native-detail.png`;
            await fs.writeFile(path.join(session.out, file), Buffer.from(capture.png, 'base64'));
            delete capture.png;
            row.capture = { ...capture, file, rescaled: false };
        }
        mapReport.allocation = await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldView;
            const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
            const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                    sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
            const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
                .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
            return { total: terrain + environment + baseline + eager + d.sovietUnitsHd.gpuBytes,
                limit: d.terrainHd.budget, prepared: { ...d.preparedHdCache } };
        });
        assert.equal(mapReport.allocation.limit, (density === 2 ? 512 : 1280) * 1024 ** 2);
        assert(mapReport.allocation.total <= mapReport.allocation.limit);
        assert(mapReport.allocation.prepared.peakBytes <= 128 * 1024 ** 2);
        console.log(JSON.stringify({ map: test.mapId, density, sourcePaths: test.members.length, status: 'PASS' }));
    }
    assert.equal(report.maps.reduce((sum, row) => sum + row.sources.length, 0), 39);
    if (density === 4) {
        report.originalRelease = await switchMap('turfwar.map', false);
        report.originalFallback = await session.page.evaluate(() => {
            const d = window.__ra2debug;
            return { environment: d.environmentHd,
                objects: d.game.getWorld().getAllObjects().filter(object => object.name === 'CACHIG01')
                    .map(window.__m23Binding) };
        });
        assert.equal(report.originalFallback.environment.worldChargeBytes, 0);
        assert(report.originalFallback.objects.length > 0 && report.originalFallback.objects.every(row => !row.hd));
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
        report.crossTheater.glError = await session.page.evaluate(() =>
            window.__ra2debug.renderer.renderer.getContext().getError());
        assert.equal(report.crossTheater.glError, 0);
    }
    report.bindingStatus = 'PASS_ALL_39_ORIGINAL_SOURCE_PATHS_NATIVE_STATES_TICKS_AND_DENSITY';
    report.userVisualAcceptance = false;
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ output, density, status: 'PASS_BATCH88_COMPLETE_NATIVE_SOURCE_PATHS' }));
