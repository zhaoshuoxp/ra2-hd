// Check only new source registration and affected native states; retain accepted artwork evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { validateNativeTechnology } from '../m2/official-maps/native-technology.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const root = '.artifacts/m2-4/newurban-anchored-buildings-batch91-20261020';
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const exported = await read(`${root}/export-and-preservation-v2.json`);
const contract = await read('desktop/environment-newurban-hd-contract.json');
assert.deepEqual(contract.selectedPack, exported.candidate);
const pack = await read(path.join('.local/environment-packs', contract.selectedPack.revision, 'manifest.json'));
const nativeSources = (await read(`${root}/source.json`)).sources;
const cases = [
    { mapId: 'yr:rushhr.map', names: ['CANWY24', 'CATEXS06', 'CATEXS07', 'CAOILD', 'CATHOSP'] },
    { mapId: 'yr:austintx.map', names: ['CAAIRP'] },
];
for (const test of cases) for (const name of test.names) assert(nativeSources.some(source =>
    source.bindings.some(binding => binding.id === name && binding.role === 'body' && binding.mapIds.includes(test.mapId))),
    'The original source catalog must contain every requested fixture name on its selected map');
process.argv.push('--map=rushhr.map', '--bot-slot=1');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
});

async function capture(name, state, original = false) {
    const { page } = session;
    await page.evaluate(name => {
        const d = window.__ra2debug, target = window.__batch91Targets.get(name);
        d.worldInteraction.minimapHandler.panToTile(target.object.tile);
    }, name);
    await page.waitForTimeout(100);
    const result = await page.evaluate(({ name, original }) => {
        const d = window.__ra2debug, target = window.__batch91Targets.get(name);
        d.renderer.render();
        const source = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        const p = target.renderable.getPosition().clone().project(d.worldScene.camera);
        const ratio = source.width / d.renderer.width;
        const width = 720, height = 640;
        const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
        const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
        const left = Math.max(0, Math.min(source.width - width, Math.round(x - width / 2)));
        const top = Math.max(0, Math.min(source.height - height, Math.round(y - height * .65)));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(source, left, top, width, height, 0, 0, width, height);
        const rubble = target.renderable.rubbleObj;
        return { png: canvas.toDataURL().split(',')[1], sourceRect: [left, top, width, height],
            framebuffer: [source.width, source.height], tick: d.game.currentTick,
            binding: window.__m23Binding(target.object), original,
            rubble: rubble && { visible: rubble.get3DObject().visible, frame: rubble.builder.getFrame(),
                hd: rubble.builder.hdOverride?.identity }, glError: d.renderer.renderer.getContext().getError() };
    }, { name, original });
    const file = `${name}-${state}-native.png`;
    await fs.writeFile(path.join(session.out, file), Buffer.from(result.png, 'base64'));
    delete result.png;
    assert.equal(result.glError, 0);
    return { ...result, file, rescaled: false };
}

async function switchMap(mapName, hdEnabled) {
    await session.page.evaluate(({ mapName, hdEnabled, density }) => {
        const d = window.__ra2debug;
        clearInterval(window.__allied.timer);
        window.__batch91Old = { game: d.game, environment: d.environmentHd, terrain: d.terrainHd };
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
        && window.__ra2debug.game !== window.__batch91Old.game, undefined, { timeout: 90000 });
    const release = await session.page.evaluate(() => ({ environment: window.__batch91Old.environment,
        terrain: window.__batch91Old.terrain, currentEnvironment: window.__ra2debug.environmentHd,
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
    report.disclosure = 'All artwork is reused accepted material. Rush Hour and Austin cover six complete original source families; Turfwar covers the CAHOSP rule-identity alias on the same source path. Native headers, original sources, separate shadows and rules remain authoritative. Controlled reveal, stopped AI, legal engineers and one representative garrison fixture are disclosed; no natural-match claim. No accepted full actor matrix or complete linked-loop matrix is repeated.';
    report.requestedDensity = density;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    report.maps = [];
    report.sourcePaths = [];
    const expected = {};
    for (const [caseIndex, test] of cases.entries()) {
        const names = test.names;
        const release = caseIndex ? await switchMap(test.mapId.split(':')[1], true) : undefined;
        const launch = await page.evaluate(names => {
            const d = window.__ra2debug;
            window.__batch91Targets = new Map(names.map(name => {
                const choices = d.game.getWorld().getAllObjects().filter(object => object.name === name);
                const object = choices.find(object => object.isSpawned && !object.isDestroyed) ?? choices[0];
                if (!object) throw Error('Missing original source placement: ' + name);
                return [name, { object, renderable: d.renderableManager.getRenderableByGameObject(object) }];
            }));
            window.__batch91ExplosionNames = () => d.renderableManager.getRenderableContainer().getChildren()
                .filter(child => typeof child.isAnimFinished === 'function' && !child.isAnimFinished()
                    && /^(TWLT|S_(BANG|BRNL|CLSN|TUMU))/i.test(child.name ?? '')).map(child => child.name);
            return { environment: d.environmentHd, terrain: d.terrainHd, modeType: d.game.gameModeType,
                options: d.game.gameOpts, tick: d.game.currentTick,
                objects: [...window.__batch91Targets].map(([name, target]) => ({ name, ...window.__m23Binding(target.object) })) };
        }, names);
        assert.equal(launch.modeType, 0);
        assert.equal(launch.options.gameMode, 1);
        assert.equal(launch.options.credits, 10000);
        assert.equal(launch.environment.density, density);
        const mapReport = { mapId: test.mapId, releaseBeforeLoad: release, launch };
        report.maps.push(mapReport);
        for (const original of launch.objects) {
            const family = contract.identities.yr[original.name];
            const published = launch.environment.families[family];
            assert.equal(published.status, 'PUBLISHED_COMPLETE_FAMILY');
            assert.equal(published.density, density);
            const entries = pack.families[family].members;
            const ordered = original.sourceMembers.map(name => entries.find(entry => entry.member === name)).filter(Boolean);
            assert.deepEqual(ordered.map(entry => entry.member).sort(), entries.map(entry => entry.member).sort());
            expected[original.name] = 'environment-aggregate/' + ordered.map(entry => {
                const source = nativeSources.find(source => source.member === entry.member);
                report.sourcePaths.push({ member: entry.member, sourceSha256: source.sha256,
                    metadataSha256: entry.sha256, density, mapId: test.mapId, originalObjectId: original.id });
                return `${entry.sha256}/${source.sha256}/NEWURBAN/tiles/${density}`;
            }).join('|');
            assert.equal(original.hd, expected[original.name]);
        }
        mapReport.normal = [];
        for (const name of names) mapReport.normal.push({ name, capture: await capture(name, 'normal') });
        const technology = names.filter(name => ['CAOILD', 'CAAIRP', 'CATHOSP'].includes(name));
        await validateNativeTechnology(session, technology);
        assert.equal(report.newNativeTechnology.cases.length, technology.length);
        mapReport.technology = report.newNativeTechnology;
        for (const test of report.newNativeTechnology.cases) {
            for (const state of ['neutral', 'captured', 'damaged', 'repaired']) assert.equal(test[state].hd, expected[test.name]);
        }
        if (density === 2 && caseIndex === 0) {
            await validateNativeStates(session, ['CANWY24'], {});
            assert.equal(report.newNativeStates.status, 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES');
            mapReport.garrison = report.newNativeStates;
            report.garrisonReuse = 'One source-rebased representative exercises native garrison/evacuation/destruction. Other two normal/damaged/occupied body and owner payloads and anchored source geometry are exact accepted reuse; previous full garrison evidence remains authoritative.';
        }
        const damageTick = await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const { object } of window.__batch91Targets.values()) if (!object.isDestroyed)
                object.healthTrait.inflictDamage(Math.max(0, object.healthTrait.getHitPoints()
                    - Math.floor(object.healthTrait.maxHitPoints * .2)), object, d.game);
            return d.game.currentTick;
        });
        await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 10,
            damageTick, { timeout: 10000 });
        mapReport.damaged = [];
        for (const name of names) {
            const sample = await capture(name, 'damaged');
            assert.equal(sample.binding.hd, expected[name]);
            if (!sample.binding.destroyed) assert.equal(sample.binding.frame, 1);
            mapReport.damaged.push({ name, capture: sample });
        }
        mapReport.tickBeforeDestruction = await page.evaluate(() => {
            const d = window.__ra2debug;
            for (const { object } of window.__batch91Targets.values()) if (!object.isDestroyed) {
                object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
                d.game.destroyObject(object, { player: d.localPlayer });
            }
            return d.game.currentTick;
        });
        await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 100
            && window.__batch91ExplosionNames().length === 0, mapReport.tickBeforeDestruction, { timeout: 45000 });
        mapReport.rubble = [];
        for (const name of names) {
            const sample = await capture(name, 'rubble');
            assert(sample.binding.destroyed && sample.rubble.visible);
            assert.equal(sample.rubble.frame, 3);
            assert.equal(sample.rubble.hd, expected[name]);
            mapReport.rubble.push({ name, capture: sample });
        }
        mapReport.allocation = await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldView;
            const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
                + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                    sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
            const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
                .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
            return { total: d.environmentHd.worldChargeBytes + d.terrainHd.worldChargeBytes + baseline + eager + d.sovietUnitsHd.gpuBytes,
                limit: d.terrainHd.budget, prepared: { ...d.preparedHdCache }, glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(mapReport.allocation.limit, (density === 2 ? 512 : 1280) * 1024 ** 2);
        assert(mapReport.allocation.total <= mapReport.allocation.limit && mapReport.allocation.glError === 0);
        assert(mapReport.allocation.prepared.peakBytes <= 128 * 1024 ** 2);
    }
    assert.equal(report.sourcePaths.length, 12);
    report.aliasRelease = await switchMap('turfwar.map', true);
    report.hospitalAlias = await page.evaluate(() => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(object => object.name === 'CAHOSP');
        if (!object) throw Error('Missing original CAHOSP alias placement');
        window.__batch91Targets = new Map([['CAHOSP', { object,
            renderable: d.renderableManager.getRenderableByGameObject(object) }]]);
        return window.__m23Binding(object);
    });
    assert.equal(report.hospitalAlias.hd, expected.CATHOSP);
    report.hospitalAliasCapture = await capture('CAHOSP', 'alias-normal');
    if (density === 4) {
        report.originalRelease = await switchMap('turfwar.map', false);
        report.originalFallback = await page.evaluate(() => {
            const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(object => object.name === 'CAHOSP');
            window.__batch91Targets = new Map([['CAHOSP', { object,
                renderable: d.renderableManager.getRenderableByGameObject(object) }]]);
            return { environment: d.environmentHd, terrain: d.terrainHd, object: window.__m23Binding(object) };
        });
        assert(!report.originalFallback.object.hd && report.originalFallback.environment.worldChargeBytes === 0);
        report.originalCapture = await capture('CAHOSP', 'original', true);
        report.crossTheater = await switchMap('saharami.map', true);
        assert.equal(report.crossTheater.currentEnvironment.density, 4);
        assert.equal(report.crossTheater.currentTerrain.density, 4);
    }
    report.bindingStatus = 'PASS_12_SOURCE_PATHS_SIX_ORIGINAL_FAMILIES_NATIVE_STATES_AND_HOSPITAL_ALIAS';
    report.artwork = 'REUSED_ACCEPTED_NO_NEW_MOTHERS';
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
console.log(JSON.stringify({ density, output, status: 'PASS_BATCH91_ACCEPTED_REUSE_NATIVE_REGISTRATION' }));
