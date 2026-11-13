import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { openNpcSource } from './open-npc-source.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3]);
const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'all02umd.map';
const requestedActors = process.argv.find(value => value.startsWith('--actors='))?.slice(9);
const sourceWorklist = process.argv.find(value => value.startsWith('--worklist='))?.slice(11)
    ?? '.local/source-art/yr-campaign-v1/hollywood-heroes/pose-jobs-r1/worklist.json';
const checkRelease = process.argv.includes('--check-scene-release');
const actors = requestedActors ? requestedActors.split(',').map(value => {
    const [identity, count] = value.split(':');
    assert(/^[A-Z][A-Z0-9_]+$/.test(identity) && Number.isSafeInteger(Number(count)) && Number(count) > 0);
    return [identity, Number(count)];
}) : [['ARND', 292], ['STLN', 340]];
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, density, errors: [], failedResources: [], actors: [],
    scope: 'Original source infantry, revealed only for art inspection. The renderer alone displays every original body and shadow slot. The simulation remains frozen; these captures do not establish mission events or objective completion.' };
const work = JSON.parse(await fs.readFile(sourceWorklist));
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await openNpcSource(page, out, report, mission, actors[0][0]);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
    });
    report.before = await worldState(page);
    for (const [identity, count] of actors) {
        await page.evaluate(({ identity, zoom }) => {
            const d = window.__ra2debug, g = d.game, w = d.worldScene;
            d.gameScreen.gameAnimationLoop.start();
            const actor = g.world.getAllObjects().find(unit => unit.name === identity && unit.isSpawned && !unit.isDestroyed);
            if (!actor) throw Error('Original hero placement missing: ' + identity);
            window.__heroActor = actor;
            d.worldInteraction.minimapHandler.panToTile(actor.tile);
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            w.updateCamera(w.cameraPan.getPan(), zoom);
            d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
        }, { identity, zoom: density / 2 });
        await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__heroActor)
            ?.shpRenderable?.builder?.hdOverride, undefined, { timeout: 60000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.renderableManager
            .getRenderableByGameObject(window.__heroActor).shpRenderable.builder.shpFile.numImages), count * 2,
        'Every body and separate native shadow slot must be covered');
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        (report.renderOptions ??= []).push(await page.evaluate(() => {
            const d = window.__ra2debug, material = d.renderableManager.getRenderableByGameObject(window.__heroActor)
                .shpRenderable.getShapeMesh().material;
            return { actor: window.__heroActor.name, hdFiltering: material.uniforms.hdFiltering?.value,
                shadowAntialias: material.uniforms.shadowAntialias?.value,
                graphics: Object.fromEntries(Object.entries(d.generalOptions.graphics).filter(([, value]) =>
                    value && typeof value === 'object' && 'value' in value).map(([key, value]) => [key, value.value])) };
        }));
        {
            const framing = await page.evaluate(() => {
                const d = window.__ra2debug, w = d.worldScene, model = d.renderableManager.getRenderableByGameObject(window.__heroActor);
                const mesh = model.shpRenderable.getShapeMesh(), positions = mesh.geometry.getAttribute('position');
                const free = w.cameraPan.freeCamera, previous = free.value, observations = [];
                free.value = true;
                try {
                    for (let pass = 0; pass < 3; pass++) {
                        const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                        try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                        const matrix = mesh.matrix.clone();
                        for (let parent = mesh.parent; parent; parent = parent.parent) matrix.premultiply(parent.matrix);
                        const points = Array.from({ length: positions.count }, (_, i) => w.camera.position.clone()
                            .set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(matrix).project(w.camera));
                        const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * w.viewport.width / 4;
                        const y = -(Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * w.viewport.height / 4;
                        const pan = w.cameraPan.getPan(); observations.push({ x, y, pan });
                        w.cameraPan.setPan({ x: pan.x + x, y: pan.y + y });
                        w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                    }
                } finally { free.value = previous; }
                d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
                for (const child of d.renderableManager.getRenderableContainer().getChildren()) {
                    const object = child.get3DObject();
                    if (object) object.visible = child === model;
                }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                return observations;
            });
            (report.framing ??= []).push({ identity, observations: framing,
                scope: 'Renderer-only framing and isolation of the original actor. Source placement and simulation are unchanged.' });
        }
        const jobs = work.jobs?.filter(job => job.identity === identity)
            ?? work.families[identity].members.flatMap(member => member.batches
                .map(batch => ({ frames: batch.samples.map(sample => sample.frame) })));
        const captures = new Set(jobs.flatMap(job => [job.frames[0], job.frames.at(-1)]));
        if (requestedActors) for (let frame = 0; frame < count; frame += 8) captures.add(frame);
        captures.add(count - 1);
        const actorReport = { identity, frames: [] };
        for (let frame = 0; frame < count; frame++) {
            const result = await page.evaluate(({ frame, capture }) => {
                const d = window.__ra2debug, w = d.worldScene;
                const renderable = d.renderableManager.getRenderableByGameObject(window.__heroActor).shpRenderable;
                renderable.setFrame(frame);
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                const builder = renderable.builder, mesh = renderable.getShapeMesh(), hd = builder.getHdPage?.();
                const sample = builder.hdOverride.frames[frame].sampleRect, logical = builder.getSpriteGeometryOptions(frame).logicalSize;
                const shadow = renderable.shadowRenderable;
                const result = { frame: builder.getFrame(), identity: builder.hdOverride.identity,
                    sample: [sample.width, sample.height], logical: [logical.width, logical.height],
                    gpuHd: !!hd && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                    shadowFrame: shadow?.builder?.getFrame(), expectedShadowFrame: shadow?.computeShadowFrameNo(frame),
                    originalShadowOverride: !!shadow?.builder?.hdOverride,
                    gl: d.renderer.renderer.getContext().getError(), tick: d.game.currentTick, hash: d.game.getHash() };
                if (capture) {
                    const positions = mesh.geometry.getAttribute('position'), v = w.viewport, gl = d.renderer.renderer;
                    const ratio = gl.domElement.width / d.renderer.width;
                    const matrix = mesh.matrix.clone();
                    for (let parent = mesh.parent; parent; parent = parent.parent) matrix.premultiply(parent.matrix);
                    const points = Array.from({ length: positions.count }, (_, i) => w.camera.position.clone()
                        .set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(matrix).project(w.camera));
                    const left = Math.max(0, Math.floor((v.x + (1 + Math.min(...points.map(p => p.x))) * v.width / 2) * ratio) - 20);
                    const top = Math.max(0, Math.floor((v.y + (1 - Math.max(...points.map(p => p.y))) * v.height / 2) * ratio) - 20);
                    const right = Math.min(gl.domElement.width, Math.ceil((v.x + (1 + Math.max(...points.map(p => p.x))) * v.width / 2) * ratio) + 20);
                    const bottom = Math.min(gl.domElement.height, Math.ceil((v.y + (1 - Math.min(...points.map(p => p.y))) * v.height / 2) * ratio) + 20);
                    if (right - left < sample.width * .75 || bottom - top < sample.height * .75)
                        throw Error('The source hero capture is clipped or too small for its native density');
                    result.captureBounds = [left, top, right, bottom];
                    const canvas = document.createElement('canvas'); canvas.width = right - left; canvas.height = bottom - top;
                    canvas.getContext('2d').drawImage(gl.domElement, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
                    result.png = canvas.toDataURL('image/png');
                }
                return result;
            }, { frame, capture: captures.has(frame) });
            assert.equal(result.frame, frame); assert(result.gpuHd); assert.equal(result.gl, 0);
            assert.equal(result.tick, report.before.tick); assert.equal(result.hash, report.before.hash);
            assert.deepEqual(result.sample, result.logical.map(value => value * density));
            assert.equal(result.shadowFrame, result.expectedShadowFrame); assert.equal(result.originalShadowOverride, false);
            if (result.png) {
                const file = `${identity.toLowerCase()}-${String(frame).padStart(3, '0')}.png`;
                await fs.writeFile(path.join(out, file), Buffer.from(result.png.split(',')[1], 'base64'));
                delete result.png; result.file = file;
            }
            actorReport.frames.push(result);
        }
        report.actors.push(actorReport);
    }
    report.after = await worldState(page);
    assert.deepEqual(report.after, report.before); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    if (checkRelease) {
        await page.evaluate(() => {
            const d = window.__ra2debug, override = d.renderableManager.getRenderableByGameObject(window.__heroActor)
                .shpRenderable.builder.hdOverride;
            const textures = new Set(override.pages.flatMap(page =>
                [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean)));
            window.__taskNpcOldScene = { textures: textures.size, disposed: 0, units: d.sovietUnitsHd,
                terrain: d.terrainHd, environment: d.environmentHd };
            for (const texture of textures) texture.addEventListener('dispose', () => window.__taskNpcOldScene.disposed++);
            d.gameScreen.controller.goToScreen(0);
        });
        await page.waitForFunction(() => {
            const old = window.__taskNpcOldScene;
            return old.disposed === old.textures && old.units.gpuBytes === 0
                && old.terrain.disposed && old.environment.disposed;
        }, undefined, { timeout: 30000 });
        report.release = await page.evaluate(() => {
            const old = window.__taskNpcOldScene;
            return { textures: old.textures, disposed: old.disposed, unitGpuBytes: old.units.gpuBytes,
                terrain: Object.fromEntries(['disposed','gpuBytes','retainedCpuBytes','worldChargeBytes']
                    .map(key => [key, old.terrain[key]])),
                environment: Object.fromEntries(['disposed','gpuBytes','retainedCpuBytes','worldChargeBytes']
                    .map(key => [key, old.environment[key]])) };
        });
        assert(report.release.textures > 0); assert.equal(report.release.disposed, report.release.textures);
        assert.equal(report.release.unitGpuBytes, 0);
        for (const kind of ['terrain','environment']) {
            assert.equal(report.release[kind].disposed, true);
            for (const key of ['gpuBytes','retainedCpuBytes','worldChargeBytes']) assert.equal(report.release[kind][key], 0);
        }
    }
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = requestedActors ? 'PASS_NATIVE_ORIGINAL_INFANTRY_COMPLETE_BODY_AND_NATIVE_SHADOW_SLOTS_FROZEN_WORLD_AND_REQUESTED_DENSITY'
        : 'PASS_NATIVE_ORIGINAL_HOLLYWOOD_ACTORS_ALL_632_BODY_AND_NATIVE_SHADOW_SLOTS_FROZEN_WORLD_AND_REQUESTED_DENSITY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
