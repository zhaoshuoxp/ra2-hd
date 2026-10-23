// Exercise only changed rubble rendering on original map objects, with normal native destruction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const root = '.artifacts/m2-4/newurban-rubble-continuous-r1-20261020';
const exported = await read(`${root}/export-and-preservation-v2.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const packRoot = path.join('.local/environment-packs', contract.selectedPack.revision);
const pack = await read(path.join(packRoot, 'manifest.json'));
const sources = (await read('.artifacts/m2-4/newurban-building-rubble-native-batch87-v1/source.json')).sources;
process.argv.push('--map=manhatta.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});
let failure;
try {
    const { page, report } = session;
    await installNativeObjectBindings(page);
    report.disclosure = 'Unchanged official manhatta.map. Actual original placements identify every changed source; eighteen intact original objects use native damage/destruction and two original objects already start as rubble. No source, rule, spawn, owner, frame, collision or camera changes. Inherited reveal and stopped-AI fixture; not a natural-match claim.';
    report.theater = 'NEWURBAN';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    assert.equal(report.environment.density, density);
    assert.equal(report.terrain.density, density);
    report.correctedRubble = [];
    for (const source of sources) {
        const [name] = [...new Set(source.bindings.map(binding => binding.id))];
        const family = contract.identities.yr[name];
        const [entry] = pack.families[family].members;
        assert.equal(entry.member, source.member);
        const metadata = await read(path.join(packRoot, entry.path));
        const expected = `environment-aggregate/${entry.sha256}/${source.sha256}/NEWURBAN/tiles/${density}`;
        const published = report.environment.families[family];
        assert.equal(published.status, 'PUBLISHED_COMPLETE_FAMILY');
        assert.deepEqual(published.attempts, []);
        const original = await page.evaluate(({ name, member }) => {
            const d = window.__ra2debug;
            const candidates = d.game.getWorld().getAllObjects().filter(object => object.name === name)
                .filter(object => window.__m23Binding(object).mainMember === member);
            const object = candidates.find(object => object.isSpawned && !object.isDestroyed) ?? candidates[0];
            if (!object) throw Error('Missing unchanged original source placement: ' + name);
            window.__r1RubbleTarget = { object, renderable: d.renderableManager.getRenderableByGameObject(object) };
            return window.__m23Binding(object);
        }, { name, member: source.member });
        assert.equal(original.hd, expected);
        const alreadyDestroyed = original.destroyed;
        if (alreadyDestroyed) {
            assert(!original.spawned && original.health === 0 && original.rubble?.visible);
        } else {
            await page.evaluate(() => {
                const d = window.__ra2debug, object = window.__r1RubbleTarget.object;
                object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
                d.game.destroyObject(object, { player: d.localPlayer });
            });
        }
        await page.waitForFunction(expected => {
            const r = window.__r1RubbleTarget.renderable;
            return r.rubbleObj?.builder?.hdOverride?.identity === expected && r.rubbleObj.get3DObject()?.visible;
        }, expected, { timeout: 30000 });
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, original.tile);
        const before = await page.evaluate(() => window.__ra2debug.game.currentTick);
        await page.waitForFunction(before => window.__ra2debug.game.currentTick > before + 8, before);
        const capture = await page.evaluate(() => {
            const d = window.__ra2debug, target = window.__r1RubbleTarget;
            d.renderer.render();
            const canvas = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
            const p = target.renderable.getPosition().clone().project(d.worldScene.camera);
            const ratio = canvas.width / d.renderer.width;
            const cx = (viewport.x + (p.x + 1) * viewport.width / 2) * ratio;
            const cy = (viewport.y + (1 - p.y) * viewport.height / 2) * ratio;
            const width = 960, height = 720;
            const left = Math.max(0, Math.min(canvas.width - width, Math.round(cx - width / 2)));
            const top = Math.max(0, Math.min(canvas.height - height, Math.round(cy - height / 2)));
            const detail = document.createElement('canvas');
            detail.width = width; detail.height = height;
            detail.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height);
            const rubble = target.renderable.rubbleObj;
            return { png: detail.toDataURL('image/png').split(',')[1], source: [left, top, width, height],
                buffer: [canvas.width, canvas.height], tick: d.game.currentTick,
                destroyed: target.object.isDestroyed, health: target.object.healthTrait.health,
                rubble: { visible: rubble.get3DObject()?.visible, frame: rubble.builder.getFrame(),
                    hd: rubble.builder.hdOverride?.identity }, glError: d.renderer.renderer.getContext().getError() };
        });
        assert(capture.destroyed && capture.rubble.visible);
        assert.equal(capture.rubble.frame, 3);
        assert.equal(capture.rubble.hd, expected);
        assert.equal(capture.glError, 0);
        assert(capture.tick > before + 8);
        const file = `${name}-rubble-r1-native-detail.png`;
        await fs.writeFile(path.join(session.out, file), Buffer.from(capture.png, 'base64'));
        delete capture.png;
        report.correctedRubble.push({ name, member: source.member, family, metadataSha256: entry.sha256,
            sourceSha256: source.sha256, original, alreadyDestroyed, tickBefore: before,
            capture: { ...capture, file, rescaled: false } });
        console.log(JSON.stringify({ density, name, alreadyDestroyed, nativeRubble: 'PASS' }));
    }
    assert.equal(report.correctedRubble.length, 20);
    assert.equal(report.correctedRubble.filter(row => row.alreadyDestroyed).length, 2);
    report.combinedWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand,
            total: terrain + environment + baseline + eager + demand, limit: d.terrainHd.budget };
    });
    assert.equal(report.combinedWorldAllocation.limit, (density === 2 ? 512 : 1280) * 1024 ** 2);
    assert(report.combinedWorldAllocation.total <= report.combinedWorldAllocation.limit);
    report.graphics = await page.evaluate(() => ({ prepared: { ...window.__ra2debug.preparedHdCache },
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert(report.graphics.prepared.peakBytes <= 128 * 1024 ** 2 && report.graphics.glError === 0);
    if (density === 4) {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            clearInterval(window.__allied.timer);
            window.__r1OldGame = d.game;
            window.__r1OldEnvironment = d.environmentHd;
            window.__r1OldTerrain = d.terrainHd;
            d.generalOptions.graphics.hdEnabled.value = false;
        });
        await page.evaluate(async () => { await window.r.reset; });
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
            && window.__ra2debug.game !== window.__r1OldGame, undefined, { timeout: 90000 });
        report.release = await page.evaluate(() => ({ environment: window.__r1OldEnvironment,
            terrain: window.__r1OldTerrain, currentEnvironment: window.__ra2debug.environmentHd,
            currentTerrain: window.__ra2debug.terrainHd }));
        for (const key of ['environment', 'terrain']) {
            assert(report.release[key].disposed && report.release[key].worldChargeBytes === 0);
        }
        assert.equal(report.release.currentEnvironment.worldChargeBytes, 0);
        await installNativeObjectBindings(page);
        report.originalFallback = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
            .filter(object => ['CANEWY10', 'CANEWY11'].includes(object.name)).map(window.__m23Binding));
        assert(report.originalFallback.length > 0 && report.originalFallback.every(row => row.rubble?.visible && !row.rubble.hd));
        await page.evaluate(() => {
            const d = window.__ra2debug;
            window.__r1ExitGame = d.game;
            window.__r1ExitEnvironment = d.environmentHd;
            window.__r1ExitTerrain = d.terrainHd;
            d.generalOptions.graphics.hdEnabled.value = true;
            d.generalOptions.graphics.hdDensity.value = 4;
            const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
            localStorage.setItem('_edition:yr:_r_lastMap', 'saharami.map');
            localStorage.setItem('_edition:yr:_r_lastBots', JSON.stringify(bots));
            d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
        });
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), 'saharami.map');
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
            && window.__ra2debug.game !== window.__r1ExitGame, undefined, { timeout: 90000 });
        report.crossTheater = await page.evaluate(() => ({ environment: window.__r1ExitEnvironment,
            terrain: window.__r1ExitTerrain, currentEnvironment: window.__ra2debug.environmentHd,
            currentTerrain: window.__ra2debug.terrainHd, glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
        assert(report.crossTheater.environment.disposed && report.crossTheater.environment.worldChargeBytes === 0);
        assert(report.crossTheater.terrain.disposed && report.crossTheater.terrain.worldChargeBytes === 0);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
        assert.equal(report.crossTheater.glError, 0);
    }
    report.bindingStatus = 'PASS_ALL_20_ORIGINAL_SOURCE_RUBBLE_PATHS_NATIVE_TICKS_AND_DENSITY_BINDINGS';
    report.userVisualAcceptance = false;
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ output, density, status: 'PASS_FOCUSED_CORRECTED_RUBBLE_NATIVE_CASES' }));
