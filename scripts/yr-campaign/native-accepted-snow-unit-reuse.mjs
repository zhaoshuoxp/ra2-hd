import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, mission, requestedDensity, sourceFile] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
assert(['all07smd.map', 'sov02smd.map'].includes(mission) && [2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const source = JSON.parse(await fs.readFile(sourceFile));
const families = source.cases.map(row => ({ identity: row.identity, frames: row.bodySlots,
    authored: row.affected.length, captures: row.affected.map(frame => frame.nativeFrame),
    contract: { members: [{ member: row.member, manifestHash: row.parent.sha256 }] } }));
const report = { status: 'RUNNING', mission, density, errors: [], failedResources: [], families: [],
    scope: 'Existing accepted skirmish HD unit reuse and standalone SHP diagnostics in an original '
        + 'frozen campaign scene. Preview meshes use the actual source images, native geometry, unit palette, '
        + 'unchanged HD demand controller and original shadow renderer. Every override must use its exact accepted parent manifest. No simulation actor is created, moved, edited or removed. '
        + 'Diagnostic camera, reveal and preview meshes are separate from ordinary action and mission-result evidence.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(undefined, mission), mission);
    await waitWorld(page, mission);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g); d.mapRenderable.shroudLayer?.update(0);
        d.gameScreen.gameAnimationLoop.start(); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
    });
    const templateIdentity = mission === 'sov02smd.map' ? 'GGI' : 'VIRUS';
    await page.waitForFunction(identity => {
        const d = window.__ra2debug, actor = d.game.world.getAllObjects().find(actor => actor.name === identity
            && actor.isSpawned && !actor.isDestroyed);
        return actor && d.renderableManager.getRenderableByGameObject(actor)?.shpRenderable?.builder?.hdOverride;
    }, templateIdentity, { timeout: 60000 });
    report.sourceTemplate = await page.evaluate(({ identity, density }) => {
        const d = window.__ra2debug, g = d.game, w = d.worldScene;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        const model = d.renderableManager.getRenderableByGameObject(actor);
        window.__snowUnitPreview = { template: model, textures: new Set(), disposedTextures: 0 };
        d.gameScreen.gameAnimationLoop.stop();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
        w.cameraZoom.zoom = w.lastCameraZoom = density/2; w.camera.zoom = density/2; w.camera.updateProjectionMatrix();
        w.updateCamera(w.cameraPan.getPan(), density/2);
        for (const child of d.renderableManager.getRenderableContainer().getChildren()) {
            const object = child.get3DObject(); if (object) object.visible = false;
        }
        return { actor: actor.id, identity: actor.name, tile: [actor.tile.rx, actor.tile.ry],
            launch: g.campaign.launch, ownerColor: g.localPlayer.color, nativeImage: model.shpRenderable.builder.shpFile.filename };
    }, { identity: templateIdentity, density });
    report.before = await worldState(page);
    for (const family of families) {
        const binding = await page.evaluate(async family => {
            const d = window.__ra2debug, state = window.__snowUnitPreview, model = state.template, finder = model.imageFinder;
            const member = family.contract.members[0], image = finder.images.get(member.member);
            if (!image) throw Error('Original Snow source image is unavailable: '+member.member);
            const preview = model.shpRenderable.constructor.factory(image,
                model.palette.clone().remap(d.game.localPlayer.color), d.worldScene.camera, { x: 0, y: 0 }, true);
            preview.setSmoothCoverage(family.identity === 'E2'); preview.setEmbeddedShadow(true);
            const existing = finder.getUnitHdOverride(family.identity, image);
            if (existing) preview.setHdOverride(existing);
            preview.setHdLease(finder.bindUnitHd(family.identity, image, override => preview.setHdOverride(override)));
            await d.worldView.sovietUnitsHd.idle();
            const override = preview.builder.hdOverride;
            if (!override) throw Error('Accepted unit family was not admitted: '+family.identity);
            preview.setExtraLight(model.extraLight); preview.create3DObject();
            const object = preview.get3DObject(); object.position.copy(model.getPosition());
            object.position.add(new THREE.Vector3(0, 0, 1).applyEuler(d.worldScene.camera.rotation)
                .multiplyScalar(15*256/30*Math.cos(d.worldScene.camera.rotation.y)));
            object.updateMatrix(); d.worldScene.scene.add(object); state.current = preview;
            for (const texture of override.pages.flatMap(page => [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean))) {
                if (state.textures.has(texture)) continue;
                state.textures.add(texture); texture.addEventListener('dispose', () => state.disposedTextures++);
            }
            return { identity: override.identity, completeFrames: override.frames.length, originalSourceSlots: image.numImages,
                family: family.identity === 'E2' ? d.conscriptHd : d.sovietUnitsHd.families[family.identity],
                actorCount: d.game.world.getAllObjects().length };
        }, family);
        assert(binding.identity.startsWith(family.contract.members[0].manifestHash+'/'));
        assert(binding.identity.endsWith('/'+density));
        assert.equal(binding.completeFrames, family.frames); assert.equal(binding.originalSourceSlots, family.frames*2);
        assert.equal(binding.family.density, density);
        const captures = new Set(family.captures), frames = [];
        for (let nativeFrame = 0; nativeFrame < family.frames; nativeFrame++) {
            const result = await page.evaluate(({ nativeFrame, capture }) => {
                const d = window.__ra2debug, w = d.worldScene, preview = window.__snowUnitPreview.current;
                preview.setFrame(nativeFrame);
                const mesh = preview.getShapeMesh(), positions = mesh.geometry.getAttribute('position');
                const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
                try {
                    for (let pass = 0; pass < (capture ? 3 : 1); pass++) {
                        w.scene.updateMatrixWorld(true);
                        const points = Array.from({ length: positions.count }, (_, i) => w.camera.position.clone()
                            .set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(mesh.matrixWorld).project(w.camera));
                        const x = (Math.min(...points.map(p => p.x))+Math.max(...points.map(p => p.x)))*w.viewport.width/4;
                        const y = -(Math.min(...points.map(p => p.y))+Math.max(...points.map(p => p.y)))*w.viewport.height/4;
                        const pan = w.cameraPan.getPan(); w.cameraPan.setPan({ x: pan.x+x, y: pan.y+y });
                        w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                    }
                } finally { free.value = previous; }
                w.scene.updateMatrixWorld(true); w.meshBatchManager.updateMeshes(); d.renderer.render();
                const builder = preview.builder, page = builder.getHdPage(), sample = builder.hdOverride.frames[nativeFrame].sampleRect;
                const logical = builder.getSpriteGeometryOptions(nativeFrame).logicalSize;
                const result = { frame: builder.getFrame(), sample: [sample.width, sample.height], logical: [logical.width, logical.height],
                    gpuHd: mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                    shadowFrame: preview.shadowRenderable.builder.getFrame(),
                    expectedShadowFrame: preview.shadowRenderable.computeShadowFrameNo(nativeFrame),
                    shadowOverride: !!preview.shadowRenderable.builder.hdOverride,
                    glError: d.renderer.renderer.getContext().getError() };
                if (capture) {
                    const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width/d.renderer.width;
                    const points = Array.from({ length: positions.count }, (_, i) => w.camera.position.clone()
                        .set(positions.getX(i), positions.getY(i), positions.getZ(i)).applyMatrix4(mesh.matrixWorld).project(w.camera));
                    const left = Math.max(0, Math.floor((v.x+(1+Math.min(...points.map(p => p.x)))*v.width/2)*ratio)-20);
                    const top = Math.max(0, Math.floor((v.y+(1-Math.max(...points.map(p => p.y)))*v.height/2)*ratio)-20);
                    const right = Math.min(gl.domElement.width, Math.ceil((v.x+(1+Math.max(...points.map(p => p.x)))*v.width/2)*ratio)+20);
                    const bottom = Math.min(gl.domElement.height, Math.ceil((v.y+(1-Math.min(...points.map(p => p.y)))*v.height/2)*ratio)+20);
                    if (right-left < sample.width*.75 || bottom-top < sample.height*.75) throw Error('Native Snow preview is clipped or undersized');
                    const canvas = document.createElement('canvas'); canvas.width = right-left; canvas.height = bottom-top;
                    canvas.getContext('2d').drawImage(gl.domElement, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
                    result.png = canvas.toDataURL('image/png'); result.captureBounds = [left, top, right, bottom];
                }
                return result;
            }, { nativeFrame, capture: captures.has(nativeFrame) });
            assert.equal(result.frame, nativeFrame); assert.equal(result.glError, 0); assert(result.gpuHd);
            assert.deepEqual(result.sample, result.logical.map(value => value*density));
            assert.equal(result.shadowFrame, result.expectedShadowFrame); assert.equal(result.shadowOverride, false);
            if (result.png) {
                result.file = `${family.identity.toLowerCase()}-${String(nativeFrame).padStart(3, '0')}.png`;
                await fs.writeFile(path.join(out, result.file), Buffer.from(result.png.split(',')[1], 'base64')); delete result.png;
            }
            frames.push(result);
        }
        assert.equal(frames.filter(frame => frame.file).length, family.authored);
        await page.evaluate(() => { const state = window.__snowUnitPreview, preview = state.current;
            window.__ra2debug.worldScene.scene.remove(preview.get3DObject()); preview.dispose(); state.current = undefined; });
        report.families.push({ identity: family.identity, binding, frames });
        await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify({ families: report.families.map(r => r.identity) })+'\n');
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    await page.evaluate(() => {
        const d = window.__ra2debug, state = window.__snowUnitPreview;
        state.units = d.sovietUnitsHd; state.terrain = d.terrainHd; state.environment = d.environmentHd;
        d.gameScreen.controller.goToScreen(0);
    });
    await page.waitForFunction(() => { const state = window.__snowUnitPreview;
        return state.disposedTextures === state.textures.size && state.units.gpuBytes === 0
            && state.terrain.disposed && state.environment.disposed; }, undefined, { timeout: 30000 });
    report.release = await page.evaluate(() => {
        const state = window.__snowUnitPreview;
        return { textures: state.textures.size, disposedTextures: state.disposedTextures, unitGpuBytes: state.units.gpuBytes,
            terrainWorldCharge: state.terrain.worldChargeBytes, environmentWorldCharge: state.environment.worldChargeBytes };
    });
    assert(report.release.textures > 0); assert.equal(report.release.terrainWorldCharge, 0);
    assert.equal(report.release.environmentWorldCharge, 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ACCEPTED_UNIT_REUSE_IN_SNOW_EXACT_MANIFESTS_FROZEN_WORLD_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)+'\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
