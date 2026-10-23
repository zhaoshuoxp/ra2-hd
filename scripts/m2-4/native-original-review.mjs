// Capture the unchanged source map at the same native camera positions as the HD review.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';
import { installTerrainObjectBindings, validateNativeTerrainObjects } from '../m2/official-maps/native-terrain-objects.mjs';
import { recordOilMotion } from '../m2/official-maps/record-oil-motion.mjs';
import { validateLinkedBuildingCycle } from '../m2/official-maps/native-linked-building-cycle.mjs';
import { validateNativeStates } from '../m2/official-maps/native-states.mjs';
import { installNativeObjectBindings } from '../m2/official-maps/native-object-bindings.mjs';
import { recordTechnologyLinkedCycles } from '../m2/official-maps/native-technology.mjs';

const [receipt, hdReport, output] = process.argv.slice(2);
const reference = JSON.parse(await fs.readFile(hdReport, 'utf8'));
const mapName = reference.selectedMap ?? 'xdisaster.map';
assert(/^[a-z0-9_-]+\.map$/i.test(mapName));
process.argv.push(`--map=${mapName}`, '--bot-slot=1');
const session = await startSession(receipt, output, reference.edition, false, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = false; graphics.hdDensity.value = 2;
    });
});
let failure;
try {
    const { page, report } = session;
    if (reference.graphics?.output) {
        const expected = reference.graphics.output;
        await page.waitForTimeout(250);
        const before = await page.evaluate(() => {
            const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
            return { output: [canvas.width, canvas.height], preset: d.generalOptions.graphics.renderResolution.value };
        });
        report.originalResolutionMatch = { before, expected,
            method: 'Wait for initial layout, then await each actual native preset size; no framebuffer scaling.' };
        if (JSON.stringify(before.output) !== JSON.stringify(expected)) {
            assert.equal(expected[1], 1080, 'Matched Original controls use the native 1080p preset');
            await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '720p'; });
            await page.waitForFunction(() => window.__ra2debug.renderer.renderer.domElement.height === 720,
                undefined, { timeout: 15000 });
            await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p'; });
        }
        try {
            await page.waitForFunction(expected => {
                const canvas = window.__ra2debug.renderer.renderer.domElement;
                return canvas.width === expected[0] && canvas.height === expected[1];
            }, expected, { timeout: 15000 });
        } catch (error) {
            report.originalResolutionMatch.failedActual = await page.evaluate(() => {
                const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
                return { output: [canvas.width, canvas.height], logical: [d.renderer.width, d.renderer.height],
                    preset: d.generalOptions.graphics.renderResolution.value, window: [innerWidth, innerHeight],
                    dataset: { ...canvas.dataset } };
            });
            throw error;
        }
        report.matchedOutput = expected;
    }
    report.disclosure = `Original renderer on unchanged ${mapName}, identical seed/output/camera route to the HD sample. Controlled reveal and stopped AI only; screenshots retain framebuffer pixels without scaling.`;
    report.reference = hdReport; report.captureRoute = reference.captureRoute;
    if (process.argv.includes('--match-actor-states')) {
        const actors = reference.newNativeStates?.actors;
        assert(actors?.length && actors.every(actor => actor.samples?.ready?.bodyFrameCount > 0));
        const names = actors.map(actor => actor.name);
        assert(new Set(names).size === names.length);
        const counts = Object.fromEntries(actors.map(actor => [actor.name, actor.samples.ready.bodyFrameCount]));
        await validateNativeStates(session, names, counts, false,
            { originalRenderer: true, recordEachActor: true });
    }
    if (process.argv.includes('--match-wall-standing')) {
        const wall = reference.newNativeWalls;
        assert.equal(wall?.status, 'PASS_NATIVE_WALL_DAMAGE_REMOVAL_ADJACENT_REBINDING');
        report.captureRoute = [{ name: wall.name, tile: wall.before.wall.tile }];
        report.disclosure += ' The Original camera matches the retained HD standing-wall capture, before its native damage/removal actions.';
    }
    if (process.argv.includes('--infantry-actions')) {
        assert.equal(reference.theater, 'SNOW');
        assert.deepEqual(reference.requestedFamilies, ['snow-civsf', 'snow-civsfm', 'snow-civstm']);
        await validateNativeStates(session, ['CIVSF', 'CIVSFM', 'CIVSTM'],
            { CIVSF: 238, CIVSFM: 239, CIVSTM: 236 }, false, { originalRenderer: true });
    }
    if (process.argv.includes('--match-neutral-vehicle-bearings')) {
        assert.equal(reference.newNativeNeutralVehicles?.status,
            'PASS_ORIGINAL_PLACEMENTS_ALL_NATIVE_BEARINGS_MOVE_DAMAGE_AND_DESTRUCTION');
        report.matchedNeutralVehicleBearings = [];
        for (const sample of reference.newNativeNeutralVehicles.cases) {
            const captures = [];
            for (const heading of sample.bearings.map(bearing => bearing.heading)) {
                const png = await page.evaluate(({ name, tile, heading }) => {
                    const d = window.__ra2debug;
                    const object = d.game.getWorld().getAllObjects().find(o => o.name === name
                        && o.tile.rx === tile[0] && o.tile.ry === tile[1]);
                    if (!object?.isSpawned) throw Error('Missing original neutral vehicle placement');
                    const r = d.renderableManager.getRenderableByGameObject(object);
                    if (r.unitVxlHd?.active) throw Error('Original comparison must not bind HD');
                    d.worldInteraction.minimapHandler.panToTile(object.tile);
                    r.updateVxlRotation(heading, true);
                    d.renderer.render();
                    return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
                }, { name: sample.name, tile: sample.original.tile, heading });
                const file = `${sample.name}-heading-${heading}-original-framebuffer.png`;
                await fs.writeFile(path.join(output, file), Buffer.from(png, 'base64'));
                captures.push({ heading, file, rescaled: false });
            }
            report.matchedNeutralVehicleBearings.push({ name: sample.name, tile: sample.original.tile, captures });
        }
        report.disclosure += ' Neutral vehicle comparisons retain original placements and eight graphics-only native bearings, matching the HD controls; native action suites are reused.';
    }
    if (process.argv.includes('--match-linked-building-cycles')) {
        assert(reference.linkedBuildingCycles?.length);
        report.linkedBuildingCycleSource = reference.linkedBuildingCycleSource;
        for (const cycle of reference.linkedBuildingCycles.filter(cycle => !cycle.fixture)) {
            assert(['PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN', 'PASS_ORIGINAL_NEUTRAL_UNPOWERED_IDLE'].includes(cycle.status));
            const phases = cycle.originalLoopPhases ?? cycle.expectedPhases;
            await validateLinkedBuildingCycle(session, cycle.member, cycle.sourceFrameCount, {
                loopStart: Math.min(...phases), loopEnd: Math.max(...phases),
                originalRenderer: true, allowNativePoweredIdle: cycle.nativeIdle });
        }
        const damaged = reference.linkedBuildingCycles.filter(cycle => cycle.fixture && cycle.state === 'damaged');
        if (damaged.length) {
            await installNativeObjectBindings(page);
            const source = JSON.parse(await fs.readFile(reference.linkedBuildingCycleSource.path));
            const names = [...new Set(damaged.map(cycle => cycle.name))], counts = {}, damagedLinkedCycles = {}, poweredLinkedCycles = {};
            for (const name of names) {
                const body = source.sources.find(member => member.bindings.some(binding =>
                    binding.id === name && binding.edition === reference.edition && binding.role === 'body'));
                counts[name] = body.totalFrames / (body.hasShadow ? 2 : 1);
                damagedLinkedCycles[name] = damaged.filter(cycle => cycle.name === name).map(cycle => ({
                    member: cycle.member, frameCount: cycle.sourceFrameCount,
                    loopStart: Math.min(...cycle.expectedPhases), loopEnd: Math.max(...cycle.expectedPhases) }));
                const powered = reference.linkedBuildingCycles.filter(cycle => cycle.name === name
                    && cycle.fixture && cycle.state === 'normal');
                if (powered.length) poweredLinkedCycles[name] = powered.map(cycle => ({
                    member: cycle.member, frameCount: cycle.sourceFrameCount,
                    loopStart: Math.min(...cycle.expectedPhases), loopEnd: Math.max(...cycle.expectedPhases) }));
            }
            await validateNativeStates(session, names, counts, false, {
                originalRenderer: true, originalPalette: 'native', damagedLinkedCycles, poweredLinkedCycles });
        }
    }
    if (process.argv.includes('--match-technology-capture')) {
        assert.equal(reference.newNativeTechnology?.status,
            'PASS_ORIGINAL_PLACEMENTS_NATIVE_CAPTURE_REPAIR_AND_OWNED_ANIMATION');
        report.matchedTechnologyCapture = [];
        for (const sample of reference.newNativeTechnology.cases) {
            const id = await page.evaluate(sample => {
                const d = window.__ra2debug, f = window.__allied;
                const object = d.game.getWorld().getAllObjects().find(o => o.name === sample.name
                    && o.tile.rx === sample.original.tile[0] && o.tile.ry === sample.original.tile[1]);
                if (!object?.owner.isNeutral) throw Error('Missing original neutral technology placement');
                f.originalTechnologyEngineer = f.spawn('ENGINEER', 3, object.tile);
                d.actionsApi.orderUnits([f.originalTechnologyEngineer.id], 7, object.id);
                return object.id;
            }, sample);
            await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
                .find(o => o.id === id)?.owner === window.__allied.player, id, { timeout: 45000 });
            assert(await page.evaluate(() => !window.__allied.originalTechnologyEngineer.isSpawned));
            report.matchedTechnologyCapture.push({ name: sample.name, id, tile: sample.original.tile,
                engineerConsumed: true });
        }
        report.disclosure += ' Original technology ownership matches the reviewed native engineer captures; complete state and animation suites are reused.';
    }
    if (process.argv.includes('--match-technology-linked-cycles')) {
        assert(process.argv.includes('--match-technology-capture'));
        const cycles = reference.linkedBuildingCycles?.filter(cycle => cycle.originalCapturedPlacement);
        assert(cycles?.length && report.matchedTechnologyCapture?.length);
        report.matchedTechnologyLinkedCycles = [];
        for (const target of report.matchedTechnologyCapture) {
            const normal = cycles.filter(cycle => cycle.name === target.name && cycle.state === 'normal');
            const damaged = cycles.filter(cycle => cycle.name === target.name && cycle.state === 'damaged');
            assert(normal.length && normal.length === damaged.length);
            const members = normal.map(cycle => ({ member: cycle.member, frameCount: cycle.sourceFrameCount }));
            await recordTechnologyLinkedCycles(session, target.id, members, 'normal', true);
            await page.evaluate(id => {
                const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(o => o.id === id);
                object.healthTrait.inflictDamage(Math.floor(object.healthTrait.maxHitPoints * .75), object, d.game);
            }, target.id);
            await page.waitForTimeout(180);
            await recordTechnologyLinkedCycles(session, target.id, members, 'damaged', true);
            for (const cycle of report.linkedBuildingCycles.filter(cycle => cycle.id === target.id)) {
                const expected = cycles.find(value => value.name === target.name
                    && value.member === cycle.member && value.state === cycle.state);
                assert.deepEqual(cycle.expectedPhases, expected.expectedPhases);
                assert.deepEqual(cycle.nativeArtObservation, { ...expected.nativeArtObservation,
                    health: cycle.nativeArtObservation.health });
            }
            await page.evaluate(id => {
                const d = window.__ra2debug, f = window.__allied;
                const object = d.game.getWorld().getAllObjects().find(o => o.id === id);
                f.originalCycleRepairEngineer = f.spawn('ENGINEER', 3, object.tile);
                d.actionsApi.orderUnits([f.originalCycleRepairEngineer.id], 15, id);
            }, target.id);
            await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
                .find(o => o.id === id)?.healthTrait.health === 100, target.id, { timeout: 45000 });
            assert(await page.evaluate(() => !window.__allied.originalCycleRepairEngineer.isSpawned));
            report.matchedTechnologyLinkedCycles.push({ name: target.name, id: target.id,
                states: ['normal', 'damaged'], repairEngineerConsumed: true,
                ranges: normal.concat(damaged).map(cycle => ({ member: cycle.member,
                    state: cycle.state, phases: cycle.expectedPhases })) });
        }
        report.disclosure += ' Original captured technology normal/damaged loops use the same actual Art INI ranges as HD; a native engineer repairs the original placement before final scene captures.';
    }
    if (process.argv.includes('--oil-motion')) {
        assert(process.argv.includes('--match-technology-capture'));
        assert.deepEqual(report.matchedTechnologyCapture.map(row => row.name), ['CAOILD']);
        await page.evaluate(id => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = d.game.getWorld().getAllObjects().find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, report.matchedTechnologyCapture[0].id);
        await recordOilMotion(session, 'oil-original-player-normal', 5000);
        await page.evaluate(() => {
            const d = window.__ra2debug, object = window.__allied.actor;
            object.healthTrait.inflictDamage(Math.floor(object.healthTrait.maxHitPoints * .75), object, d.game);
        });
        await page.waitForTimeout(180);
        await recordOilMotion(session, 'oil-original-player-damaged', 5000);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.originalOilRepairEngineer = f.spawn('ENGINEER', 3, f.actor.tile);
            d.actionsApi.orderUnits([f.originalOilRepairEngineer.id], 15, f.actor.id);
        });
        await page.waitForFunction(() => window.__allied.actor.healthTrait.health === 100,
            undefined, { timeout: 45000 });
        assert(await page.evaluate(() => !window.__allied.originalOilRepairEngineer.isSpawned));
        report.disclosure += ' Oil-only Original native recordings cover complete normal/damaged loops and restore full health through a native engineer before matched captures.';
    }
    if (process.argv.includes('--match-initial-bridge-repair')) {
        assert(reference.snowNativeBridges?.length, 'Matched bridge repair needs prior native bridge evidence');
        report.matchedBridgeRepair = [];
        for (const sample of reference.snowNativeBridges.filter(sample => sample.originalInitial)) {
            const setup = await page.evaluate(tile => {
                const d = window.__ra2debug, f = window.__allied;
                const hut = d.game.getWorld().getAllObjects().find(object => object.name === 'CABHUT' &&
                    object.tile.rx === tile[0] && object.tile.ry === tile[1]);
                if (!hut) throw Error('Original source repair hut is missing');
                window.__m24OriginalBridgeHut = hut;
                const needed = hut.cabHutTrait.canRepairBridge();
                if (needed) {
                    f.originalBridgeEngineer = f.spawn('ENGINEER', 3, hut.tile);
                    d.actionsApi.orderUnits([f.originalBridgeEngineer.id], 15, hut.id);
                }
                return { tile, needed };
            }, sample.originalInitial.hut.tile);
            if (setup.needed) await page.waitForFunction(() =>
                !window.__m24OriginalBridgeHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
            report.matchedBridgeRepair.push({ kind: sample.kind, ...setup,
                engineerConsumed: !setup.needed || await page.evaluate(() => !window.__allied.originalBridgeEngineer.isSpawned) });
            assert(report.matchedBridgeRepair.at(-1).engineerConsumed);
        }
        report.disclosure += ' Originally broken source bridges are restored by the same native engineer command before matched standing captures; source files and geometry remain unchanged. Full bridge state suites are reused.';
    }
    if (process.argv.includes('--terrain-object-actions')) {
        await installTerrainObjectBindings(page);
        report.newNativeBindings = await page.evaluate(names => window.__ra2debug.game.getWorld().getAllObjects()
            .filter(object => object.isTerrain() && names.includes(object.name)).map(window.__m23Binding),
        [...new Set(reference.newNativeBindings.map(object => object.name))]);
        await validateNativeTerrainObjects(session, { originalRenderer: true });
    }
    for (const [index, sample] of report.captureRoute.entries()) {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, sample.tile);
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, `${String(index).padStart(2, '0')}-${sample.name}-framebuffer.png`), Buffer.from(png, 'base64'));
    }
    report.fallback = await page.evaluate(() => ({ terrain: window.__ra2debug.terrainHd,
        environment: window.__ra2debug.environmentHd,
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(report.fallback.terrain.worldChargeBytes, 0);
    assert.equal(report.fallback.environment.worldChargeBytes, 0);
    assert.equal(report.fallback.glError, 0);
} catch (error) { failure = error; }
await session.close(failure);
if (failure) throw failure;
