// Native bindings and actions in the selected map, with explicit legal fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { validateShowcaseActions } from './native-showcase-actions.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const control = process.argv.includes('--control');
const original = process.argv.includes('--original');
const baseline = process.argv.includes('--baseline') || original;
const missingEnvironment = process.argv.includes('--missing-environment');
const corruptEnvironment = process.argv.includes('--corrupt-environment');
const corruptManifestHash = corruptEnvironment ? JSON.parse(await fs.readFile(
    '.local/environment-packs/environment-m2-2-complete-v1/manifest.json', 'utf8')).families['environment-ctgas01'].members[0].sha256 : undefined;
const map = control ? 'XMP19T4.map' : edition === 'yr' ? 'XMP03T4.map' : 'MP03T4.map';
process.argv.push('--map=' + map);
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(({ density, original }) => {
        window.__ra2debug.generalOptions.graphics.hdEnabled.value = !original;
        window.__ra2debug.generalOptions.graphics.hdDensity.value = density;
    }, { density, original });
    if (missingEnvironment || corruptEnvironment) await page.evaluate(({ missingEnvironment, corruptEnvironment, corruptManifestHash }) => {
        const fetch = window.fetch;
        window.fetch = async (...args) => {
            const url = String(args[0]);
            if (missingEnvironment && url === '/local-environment/selection.json') return new Response(null, { status: 404 });
            const response = await fetch.apply(window, args);
            if (corruptEnvironment && url.includes('/local-environment/') && url.endsWith('/manifest.json')
                && url.includes('/' + corruptManifestHash + '/')) {
                const bytes = new Uint8Array(await response.arrayBuffer()); bytes[0] ^= 1;
                return new Response(bytes, { status: 200 });
            }
            return response;
        };
    }, { missingEnvironment, corruptEnvironment, corruptManifestHash });
});
const { page, app, report, stage, startClip, stopClip, close } = session;
await page.evaluate(() => {
    const d = window.__ra2debug;
    d.generalOptions.graphics.renderResolution.value = '1080p'; d.renderer.setRenderResolution('1080p');
});
let failure;
const capture = async name => {
    await stage(name);
    const png = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.renderer.render();
        return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
    });
    await fs.writeFile(path.join(output, name + '-framebuffer.png'), Buffer.from(png, 'base64'));
};
const pan = async tile => {
    await page.evaluate(tile => {
        const d = window.__ra2debug;
        d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
    }, tile);
    await page.waitForTimeout(150);
};
try {
    report.disclosure = 'Actual selected map bindings and native orders using unchanged rules, map, camera and speed. Controlled legal actor fixtures, revealed map and suspended bot AI are explicit. Static/art/resource results do not establish natural-match or user visual acceptance.';
    await page.evaluate(() => {
        window.__showcaseBinding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const sprite = r?.mainObj ?? r?.mainRenderable ?? r?.shpRenderable;
            const builder = sprite?.builder;
            const map = d.mapRenderable;
            const batch = [map.terrainLayer, map.overlayLayer, map.smudgeLayer]
                .map(layer => layer?.getObjectHdBinding?.(object)).find(Boolean);
            return { id: object.id, name: object.name, type: object.type, tile: [object.tile.rx, object.tile.ry, object.tile.z],
                spawned: object.isSpawned, destroyed: object.isDestroyed, health: object.healthTrait?.health,
                value: object.value, direction: object.direction, moving: object.isMoving,
                member: builder?.image?.filename, hd: batch?.identity ?? builder?.hdOverride?.identity,
                frame: batch?.frame ?? builder?.getFrame(), batchedHd: !!batch,
                nativeException: object.isBridgePlaceholder?.() && r?.isInvisible
                    ? 'INVISIBLE_NATIVE_BRIDGE_PLACEHOLDER' : undefined,
                vxlHd: !!r?.unitVxlHd?.active, vxlParts: r?.unitVxlHd?.layers?.map(layer => layer.frames[0]?.part.member),
                occupants: object.garrisonTrait?.units.length,
                rubble: r?.rubbleObj && { hd: r.rubbleObj.builder?.hdOverride?.identity,
                    frame: r.rubbleObj.builder?.getFrame(), visible: r.rubbleObj.get3DObject()?.visible } };
        };
    });
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    if (!original) assert.equal(report.terrain.density, density);
    if (!baseline && !missingEnvironment) assert.equal(report.environment.density, density);
    if (!baseline && !missingEnvironment && !corruptEnvironment) assert(Object.values(report.environment.families).every(family => family.status === 'PUBLISHED_COMPLETE_FAMILY'),
        'Every encountered environment family must publish completely');
    report.placed = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(object => object.isBuilding() || object.isUnit() || object.isOverlay() || object.isTerrain())
        .map(window.__showcaseBinding));
    report.placedVehicles = report.placed.filter(object => object.vxlHd);
    if (missingEnvironment) {
        assert.equal(report.environment.worldChargeBytes, 0);
        assert(report.placed.filter(object => [2, 3, 6].includes(object.type)).every(object => !object.hd));
        report.fallback = 'PASS_MISSING_PACK_COMPLETE_ORIGINAL_NATIVE_OBJECTS';
    }
    if (corruptEnvironment) {
        const house = report.placed.find(object => object.name === 'CAGAS01');
        assert(house && !house.hd && !house.rubble?.hd);
        assert(report.placed.some(object => object.type === 2 && object.name !== 'CAGAS01' && object.hd));
        report.fallback = 'PASS_HASH_REJECTION_COMPLETE_BUILDING_FAMILY_ORIGINAL_PEERS_HD';
    }
    if (!control && !baseline) assert(report.placedVehicles.length >= 45, 'All primary native neutral vehicles must bind');
    // Capture actual native placements across categories without changing the map.
    const route = [];
    for (const kind of [2, 3, 7, 6, 4]) {
        const names = new Set();
        for (const object of report.placed.filter(object => object.type === kind)) {
            if (names.has(object.name) || names.size >= 4) continue;
            names.add(object.name); route.push({ name: object.name, tile: object.tile, type: kind });
        }
    }
    for (const group of ['m2-2-shore', 'm2-2-watercontacts', 'm2-2-dirtroads', 'm2-2-pavecrop']) {
        let binding = report.terrain.placedBindings.find(binding => binding.group === group);
        if (!binding && baseline) {
            const routeFile = JSON.parse(await fs.readFile(process.argv.find(arg => arg.startsWith('--route='))?.slice(8)));
            binding = routeFile.route.find(row => row.name === group);
        }
        if (binding) route.push({ name: group, tile: binding.tile });
    }
    report.route = route;
    for (let index = 0; index < route.length; index++) {
        await pan(route[index].tile);
        await capture(`route-${String(index + 1).padStart(2, '0')}-${route[index].name.toLowerCase()}`);
    }
    if (!control && process.argv.includes('--actions')) {
        report.vehicleActions = {};
        const identities = density === 2
            ? ['CAR', 'BUS', 'PICK', 'SUVB', 'STANG', 'TAXI', 'SUVW', 'COP', 'PTRUCK', 'EUROC', 'LIMO', 'CONA', 'TRUCKA']
            : ['CAR', 'STANG', 'COP', 'CONA', 'TRUCKA'];
        for (const identity of identities) {
            await page.evaluate(identity => {
                const d = window.__ra2debug, f = window.__allied;
                f.actor = f.spawn(identity, 7, { rx: f.center.rx - 5, ry: f.center.ry - 5 });
            }, identity);
            await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd,
                undefined, { timeout: 45000 });
            const result = report.vehicleActions[identity] = { before: await page.evaluate(() => window.__showcaseBinding(window.__allied.actor)) };
            await pan(result.before.tile);
            if (['CAR', 'CONA', 'TRUCKA'].includes(identity)) await startClip();
            result.moves = [];
            for (const delta of [[4, 0], [0, 4]]) {
                await page.evaluate(delta => {
                    const d = window.__ra2debug, f = window.__allied, u = f.actor;
                    f.originTile = u.tile;
                    f.destination = d.game.map.tiles.getAll().filter(tile => d.game.map.isWithinBounds(tile) && !tile.rampType
                        && d.game.map.terrain.getPassableSpeed(tile, u.rules.speedType, false, false) > 0
                        && !d.game.map.getGroundObjectsOnTile(tile).some(object => object.isTechno() || object.isTerrain()))
                        .sort((a, b) => Math.hypot(a.rx - u.tile.rx - delta[0], a.ry - u.tile.ry - delta[1])
                            - Math.hypot(b.rx - u.tile.rx - delta[0], b.ry - u.tile.ry - delta[1]))[0];
                    d.actionsApi.orderUnits([u.id], 0, f.destination.rx, f.destination.ry);
                }, delta);
                await page.waitForFunction(() => window.__allied.actor.tile !== window.__allied.originTile,
                    undefined, { timeout: 30000 });
                await page.waitForFunction(() => !window.__allied.actor.isMoving
                    && window.__allied.actor.tile === window.__allied.destination, undefined, { timeout: 30000 });
                const moved = await page.evaluate(() => window.__showcaseBinding(window.__allied.actor));
                assert(moved.vxlHd); result.moves.push(moved);
            }
            await capture(identity.toLowerCase() + '-native-move-turn');
            if (['CAR', 'CONA', 'TRUCKA'].includes(identity)) await stopClip(identity.toLowerCase() + '-native-move-turn');
            await page.evaluate(() => {
                const d = window.__ra2debug, u = window.__allied.actor;
                d.game.destroyObject(u, { player: d.localPlayer }, true);
            });
            await page.waitForTimeout(250);
            result.after = await page.evaluate(() => ({ spawned: window.__allied.actor.isSpawned,
                rendered: !!window.__ra2debug.renderableManager.getRenderableByGameObject(window.__allied.actor) }));
            assert.equal(result.after.spawned, false); assert.equal(result.after.rendered, false);
        }
    }
    if (!control && (process.argv.includes('--actions') || process.argv.includes('--building'))) {
        const building = report.placed.find(object => object.type === 2 && object.rubble?.hd);
        assert(building, 'A placed civilian building must provide its native rubble state');
        await page.evaluate(id => {
            const d = window.__ra2debug;
            window.__showcaseHouse = d.game.getWorld().getAllObjects().find(object => object.id === id);
        }, building.id);
        await pan(building.tile); await startClip();
        report.buildingStates = { normal: await page.evaluate(() => window.__showcaseBinding(window.__showcaseHouse)) };
        await capture('building-normal');
        await page.evaluate(() => {
            const d = window.__ra2debug, house = window.__showcaseHouse;
            house.healthTrait.inflictDamage(Math.floor(house.rules.strength * .85), house, d.game);
        });
        await page.waitForTimeout(350);
        report.buildingStates.damaged = await page.evaluate(() => window.__showcaseBinding(window.__showcaseHouse));
        assert(report.buildingStates.damaged.hd); assert(report.buildingStates.damaged.health < 50);
        assert.notEqual(report.buildingStates.damaged.frame, report.buildingStates.normal.frame);
        await capture('building-native-damaged');
        await page.evaluate(() => {
            const d = window.__ra2debug, house = window.__showcaseHouse;
            d.game.destroyObject(house, { player: d.localPlayer });
        });
        await page.waitForTimeout(600);
        report.buildingStates.destroyed = await page.evaluate(() => window.__showcaseBinding(window.__showcaseHouse));
        assert(report.buildingStates.destroyed.rubble?.hd && report.buildingStates.destroyed.rubble.visible);
        assert.equal(report.buildingStates.destroyed.rubble.frame, 3);
        await capture('building-native-rubble'); await stopClip('building-native-damage-rubble');
    }
    if (process.argv.includes('--environment-actions')) await validateShowcaseActions(session, capture);
    report.graphics = await page.evaluate(() => {
        const d = window.__ra2debug, gl = d.renderer.renderer;
        return { framebuffer: [gl.domElement.width, gl.domElement.height], viewport: [d.renderer.width, d.renderer.height],
            glError: gl.getContext().getError(), textures: gl.info.memory.textures };
    });
    report.combinedWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd?.worldChargeBytes ?? 0, environment = d.environmentHd?.worldChargeBytes ?? 0;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0)
            + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) => sum + part.bitmap.width * part.bitmap.height * 5
                + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand, total: terrain + environment + baseline + eager + demand,
            limit: d.terrainHd?.budget || 256 * 1024 * 1024 };
    });
    assert(report.combinedWorldAllocation.total <= report.combinedWorldAllocation.limit);
    assert.equal(report.graphics.glError, 0);
    report.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(process => ({ type: process.type, memory: process.memory })));
    if (process.argv.includes('--lifecycle')) {
        report.lifecycle = [];
        for (const enabled of [false, true]) {
            await page.evaluate(enabled => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__showcaseOldGame = d.game; window.__showcaseOldEnvironment = d.environmentHd;
                d.generalOptions.graphics.hdEnabled.value = enabled;
            }, enabled);
            await page.evaluate(async () => { await window.r.reset; });
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__showcaseOldGame, undefined, { timeout: 90000 });
            const state = await page.evaluate(() => ({ old: window.__showcaseOldEnvironment,
                current: window.__ra2debug.environmentHd }));
            assert(state.old.disposed && state.old.worldChargeBytes === 0);
            if (enabled) assert.equal(state.current.density, density);
            else assert.equal(state.current.worldChargeBytes, 0);
            report.lifecycle.push({ enabled, ...state });
        }
        await page.evaluate(() => window.__installAlliedFixtures());
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
console.log(path.resolve(output, 'report.json'));
