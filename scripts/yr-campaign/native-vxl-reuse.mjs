import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';
import { observeProgramLifetime } from '../windows-hd/observe-program-lifetime.mjs';
import { closeCampaignMenuPaused } from '../campaign-completion/named-save-restart.mjs';
import { NativeCampaignPilot } from './native-pilot.mjs';

const [output, mission, identity, requestedDensity] = process.argv.slice(2);
const releaseOnly = process.argv.includes('--release-only');
const checkRelease = releaseOnly || process.argv.includes('--check-scene-release');
const out = path.resolve(output), density = Number(requestedDensity);
const replayFile = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
assert([2, 4].includes(density));
if (!replayFile) await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identity, density, errors: [], failedResources: [], poses: [],
    scope: 'Fresh original YR placement and complete accepted VXL family. Only the frozen renderer bearing and camera change. Original actor direction, world, health, tick, RNG, tasks and objectives remain unchanged.' };
let app, page, pilot;
try {
    if (replayFile) {
        assert(process.argv.includes(`--density=${density}`), 'Input replay must request the same observer density');
        assert(process.argv.includes('--trace-programs'), 'Input replay must trace its actual scene preparation');
        pilot = new NativeCampaignPilot(out, mission);
        pilot.report.errors = report.errors; pilot.report.failedResources = report.failedResources;
        pilot.report.consoleErrors = report.consoleErrors = [];
        await pilot.open(); ({ app, page } = pilot.session);
        report.originalInputReplay = pilot.report.ordinaryInputReplay;
        report.originalCreationIdentity = pilot.report.originalCreationIdentity;
        report.scope = 'Historical ordinary inputs enter a fresh original source world at its recorded creation identity. Only the diagnostic renderer bearing and camera change after the replay. No saved world, running RNG, actor, health, task, source rule or result is assigned. This is source-event/art evidence, separate from fresh public initialization.';
    } else {
        ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
        await observeProgramLifetime(page);
        const checkpointFile = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
        if (checkpointFile) {
            const checkpoint = JSON.parse(await fs.readFile(checkpointFile));
            assert.equal(checkpoint.identity.edition, 'yr'); assert.equal(checkpoint.identity.mission, mission);
            report.sourceCheckpoint = { file: path.resolve(checkpointFile), tick: checkpoint.tick, checksum: checkpoint.checksum };
            await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
                .launchDiagnostic(checkpoint, checkpoint.identity.mission), checkpoint);
            const progress = setInterval(async () => {
                const observation = await page.evaluate(() => window.__ra2debug?.campaignRestore).catch(() => undefined);
                if (observation) await fs.writeFile(path.join(out, 'restore-progress.json'), JSON.stringify(observation, null, 2) + '\n');
            }, 5000);
            try {
                await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
                    && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 600000 });
            } finally { clearInterval(progress); }
            report.restored = await worldState(page);
            assert.deepEqual({ worldHash: report.restored.hash, rng: report.restored.rng, mission: report.restored.mission,
                world: report.restored.world, pendingCallbacks: report.restored.pendingCallbacks }, checkpoint.expected);
            await closeCampaignMenuPaused(page);
            report.scope = 'Exact legitimate original-source checkpoint restoration with its stored interpreter policy. Frozen diagnostic renderer bearings do not establish a fresh public mission start. Original actors, direction, health, tick, RNG, tasks and objectives remain unchanged.';
        } else {
            await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
            await waitWorld(page, mission);
        }
    }
    report.originalActor = await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source actor absent: ' + identity);
        window.__sourceVxlActor = actor;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
        return { id: actor.id, name: actor.name, health: actor.healthTrait?.health, direction: actor.direction,
            tile: [actor.tile.rx, actor.tile.ry], launch: g.campaign.launch };
    }, identity);
    await page.waitForFunction(() => !!window.__ra2debug.renderableManager
        .getRenderableByGameObject(window.__sourceVxlActor)?.unitVxlHd, undefined, { timeout: 30000 });
    report.before = await worldState(page);
    report.binding = await page.evaluate(density => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__sourceVxlActor);
        d.gameScreen.gameAnimationLoop.stop();
        window.__sourceVxlBearing = { tilt: r.tiltObj.rotation.y, wrap: r.dirWrapObj?.rotation.y };
        const family = r.unitVxlHd.family;
        return { family: family.identity, active: !r.unitVxlHd.disposed, completeNativeMeshes: r.unitVxlHd.meshes.length,
            parts: family.parts.map(part => ({ member: part.member, section: part.section,
                identity: part.override.identity, poses: part.frames.map(frame => ({ heading: frame.heading,
                    logicalSize: frame.logicalSize, sampleSize: frame.rect.slice(2),
                    matchesDensity: frame.rect[2] === frame.logicalSize[0] * density
                        && frame.rect[3] === frame.logicalSize[1] * density })) })),
            report: d.sovietUnitsHd.families[family.identity] };
    }, density);
    assert.equal(report.binding.family, identity); assert(report.binding.active);
    assert.equal(report.binding.report.density, density); assert.equal(report.binding.report.status, 'READY');
    assert(report.binding.parts.length && report.binding.parts.every(part => part.poses.length === 8
        && part.poses.every(pose => pose.matchesDensity)));
    for (const bearing of releaseOnly ? [0] : [0, 45, 90, 135, 180, 225, 270, 315]) {
        const pose = await page.evaluate(({ bearing, density }) => {
            const d = window.__ra2debug, w = d.worldScene, actor = window.__sourceVxlActor;
            const r = d.renderableManager.getRenderableByGameObject(actor), gl = d.renderer.renderer;
            r.tiltObj.rotation.y = bearing * Math.PI / 180;
            r.tiltObj.updateMatrix();
            if (r.dirWrapObj) { r.dirWrapObj.rotation.y = 0; r.dirWrapObj.updateMatrix(); }
            const zoom = density === 4 ? 2 : 1;
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            const project = () => {
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                r.unitVxlHd.update();
                return r.unitVxlHd.meshes.flatMap(mesh => {
                    mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox;
                    return [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y =>
                        [box.min.z, box.max.z].map(z => w.camera.position.clone().set(x, y, z)
                            .applyMatrix4(mesh.matrixWorld).project(w.camera))));
                });
            };
            const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
            try {
                for (let pass = 0; pass < 3; pass++) {
                    w.updateCamera(w.cameraPan.getPan(), zoom);
                    const points = project(), v = w.viewport, pan = w.cameraPan.getPan();
                    const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * v.width / 4;
                    const y = -(Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * v.height / 4;
                    w.cameraPan.setPan({ x: pan.x + x, y: pan.y + y });
                }
            } finally { free.value = previous; }
            w.updateCamera(w.cameraPan.getPan(), zoom);
            const points = project(), v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const xs = points.map(p => (v.x + (p.x + 1) * v.width / 2) * ratio);
            const ys = points.map(p => (v.y + (1 - p.y) * v.height / 2) * ratio);
            const bounds = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)),
                Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))];
            if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                throw Error('Complete native VXL bounds exceed viewport: ' + JSON.stringify(bounds));
            const left = Math.max(0, bounds[0] - 48), top = Math.max(0, bounds[1] - 48);
            const width = Math.min(gl.domElement.width, bounds[2] + 48) - left;
            const height = Math.min(gl.domElement.height, bounds[3] + 48) - top;
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
            return { bearing, originalDirection: actor.direction, tick: d.game.currentTick, hash: d.game.getHash(), bounds,
                active: r.unitVxlHd.active, glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
        }, { bearing, density });
        assert.equal(pose.tick, report.before.tick); assert.equal(pose.hash, report.before.hash);
        assert.equal(pose.originalDirection, report.originalActor.direction); assert.equal(pose.glError, 0); assert(pose.active);
        const file = `native-bearing-${bearing}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(pose.png.split(',')[1], 'base64'));
        delete pose.png; report.poses.push({ ...pose, file });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__sourceVxlActor);
        r.tiltObj.rotation.y = window.__sourceVxlBearing.tilt;
        r.tiltObj.updateMatrix();
        if (r.dirWrapObj) { r.dirWrapObj.rotation.y = window.__sourceVxlBearing.wrap; r.dirWrapObj.updateMatrix(); }
    });
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    report.programCompilation = await page.evaluate(() => window.__programLifetime);
    assert(report.programCompilation.every(span => span.finished && span.materials.every(material => !material.disposals.length)));
    if (checkRelease) {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            const renderer = d.renderableManager.getRenderableByGameObject(window.__sourceVxlActor).unitVxlHd;
            window.__taskVxlOldScene = { renderer, units: d.sovietUnitsHd,
                terrain: d.terrainHd, environment: d.environmentHd };
            d.gameScreen.controller.goToScreen(0);
        });
        await page.waitForFunction(() => {
            const old = window.__taskVxlOldScene;
            return old.renderer.disposed && old.units.gpuBytes === 0
                && old.terrain.disposed && old.environment.disposed;
        }, undefined, { timeout: 30000 });
        report.release = await page.evaluate(() => {
            const old = window.__taskVxlOldScene;
            return { vxlRendererDisposed: old.renderer.disposed, unitGpuBytes: old.units.gpuBytes,
                terrain: Object.fromEntries(['disposed', 'gpuBytes', 'retainedCpuBytes', 'worldChargeBytes']
                    .map(key => [key, old.terrain[key]])),
                environment: Object.fromEntries(['disposed', 'gpuBytes', 'retainedCpuBytes', 'worldChargeBytes']
                    .map(key => [key, old.environment[key]])) };
        });
        assert.equal(report.release.vxlRendererDisposed, true); assert.equal(report.release.unitGpuBytes, 0);
        for (const kind of ['terrain', 'environment']) {
            assert.equal(report.release[kind].disposed, true);
            for (const key of ['gpuBytes', 'retainedCpuBytes', 'worldChargeBytes'])
                assert.equal(report.release[kind][key], 0);
        }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = releaseOnly ? 'PASS_ORIGINAL_SOURCE_VXL_NORMAL_SCENE_RELEASE'
        : checkRelease ? 'PASS_ORIGINAL_SOURCE_VXL_EIGHT_BEARINGS_AND_NORMAL_SCENE_RELEASE'
        : 'PASS_ORIGINAL_SOURCE_VXL_COMPLETE_FAMILY_AND_EIGHT_FROZEN_RENDERER_BEARINGS';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    page ??= pilot?.session?.page; app ??= pilot?.session?.app;
    if (page) {
        report.unitHd = await page.evaluate(() => window.__ra2debug?.sovietUnitsHd).catch(() => undefined);
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await (app ?? pilot?.session?.app)?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
