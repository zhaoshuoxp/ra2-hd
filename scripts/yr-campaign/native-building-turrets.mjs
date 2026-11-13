import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';
import { observeProgramLifetime } from '../windows-hd/observe-program-lifetime.mjs';

const [output, mission, identity, requestedDensity] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
assert([2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identity, density, poses: [], errors: [], failedResources: [],
    scope: 'Actual original YR placement and complete body/turret admission. Frozen renderer headings, native body/rubble poses, house-color uniforms and camera only. No source, actor, health, facing, tick, RNG, objective or result changes. Diagnostic damage poses do not establish ordinary combat.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density }));
    await observeProgramLifetime(page);
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
    await waitWorld(page, mission);
    report.actor = await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source actor absent');
        window.__turretArtActor = actor;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
        return { id: actor.id, tile: [actor.tile.rx, actor.tile.ry], health: actor.healthTrait.health,
            facing: actor.turretTrait.facing, launch: g.campaign.launch };
    }, identity);
    await page.waitForFunction(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__turretArtActor);
        return !!r?.mainObj?.builder?.getHdPage?.() && !!r.buildingTurretHd;
    }, undefined, { timeout: 30000 });
    report.before = await worldState(page);
    report.environmentHd = await page.evaluate(() => window.__ra2debug.environmentHd);
    await page.screenshot({ path: path.join(out, 'original-scene-complete-hd.png') });
    report.binding = await page.evaluate(() => {
        const d = window.__ra2debug, actor = window.__turretArtActor;
        const r = d.renderableManager.getRenderableByGameObject(actor), hd = r.buildingTurretHd;
        d.gameScreen.gameAnimationLoop.stop();
        window.__turretArtState = { frame: r.mainObj.builder.frameNo, rotation: r.turretRot.rotation.clone(),
            turretVisible: r.turret.visible, hidden: [], rootVisible: r.get3DObject().visible,
            animations: [...r.animObjects.values()].flat().map(object => [object, object.get3DObject().visible]) };
        for (const other of d.game.world.getAllObjects()) {
            if (other === actor) continue;
            const model = d.renderableManager.getRenderableByGameObject(other)?.get3DObject();
            if (model) { window.__turretArtState.hidden.push([model, model.visible]); model.visible = false; }
        }
        const terrain = d.mapRenderable.terrainLayer.get3DObject();
        window.__turretArtState.hidden.push([terrain, terrain.visible]); terrain.visible = false;
        r.get3DObject().visible = true;
        return { density: hd.resources.density, headings: hd.resources.parts.size,
            canvas: hd.resources.contract.canvas, offset: hd.resources.contract.offset,
            bodyOverride: r.mainObj.builder.hdOverride.identity,
            nativeBuilders: r.turretBuilders.length,
            nativeColorHidden: hd.originals.every(mesh => mesh.material.colorWrite === false),
            shadowHd: !!r.mainObj.shadowRenderable?.builder?.hdOverride };
    });
    assert.equal(report.binding.density, density); assert.equal(report.binding.headings, 8);
    assert(report.binding.nativeColorHidden); assert.equal(report.binding.shadowHd, false);
    const poses = Array.from({ length: 8 }, (_, index) => ({ heading: index * 45, frame: 0, rubble: false }));
    for (let frame = 1; frame < 4; frame++) poses.push({ heading: 225, frame, rubble: frame === 3 });
    for (const pose of poses) {
        const captured = await page.evaluate(({ pose, density }) => {
            const d = window.__ra2debug, w = d.worldScene, actor = window.__turretArtActor;
            const r = d.renderableManager.getRenderableByGameObject(actor), hd = r.buildingTurretHd, gl = d.renderer.renderer;
            const model = pose.rubble ? r.rubbleObj : r.mainObj;
            r.mainObj.get3DObject().visible = !pose.rubble; r.rubbleObj.get3DObject().visible = pose.rubble;
            r.turret.visible = !pose.rubble;
            for (const [object, visible] of window.__turretArtState.animations) object.get3DObject().visible = visible && !pose.rubble;
            model.setFrame(pose.frame);
            r.turretRot.rotation.y = pose.heading * Math.PI / 180; r.turretRot.updateMatrix();
            for (const [bearing, [depth, surface]] of hd.meshes) depth.visible = surface.visible = bearing === pose.heading;
            const meshes = [];
            r.get3DObject().traverse(object => {
                if (!object.isMesh || !object.visible) return;
                for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
                meshes.push(object);
            });
            const zoom = density === 4 ? 2 : 1;
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            const project = () => {
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                return meshes.flatMap(mesh => {
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
                    w.cameraPan.setPan({ x: pan.x + (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * v.width / 4,
                        y: pan.y - (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * v.height / 4 });
                }
            } finally { free.value = previous; }
            w.updateCamera(w.cameraPan.getPan(), zoom);
            const points = project(), v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const xs = points.map(p => (v.x + (p.x + 1) * v.width / 2) * ratio);
            const ys = points.map(p => (v.y + (1 - p.y) * v.height / 2) * ratio);
            const bounds = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))];
            if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                throw Error('Complete building bounds exceed viewport: ' + JSON.stringify(bounds));
            const crop = [Math.max(0, bounds[0] - 24), Math.max(0, bounds[1] - 24),
                Math.min(gl.domElement.width, bounds[2] + 24), Math.min(gl.domElement.height, bounds[3] + 24)];
            const canvas = document.createElement('canvas'); canvas.width = crop[2] - crop[0]; canvas.height = crop[3] - crop[1];
            const context = canvas.getContext('2d');
            const capture = () => {
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(gl.domElement, crop[0], crop[1], canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            };
            const png = capture(); let owner;
            if (!pose.rubble && pose.frame === 0 && pose.heading === 180) {
                const uniforms = [...hd.meshes.values()].flat().map(mesh => mesh.material.uniforms.rhinoColorDelta.value);
                const values = uniforms.map(value => value.clone());
                try {
                    const captures = [];
                    for (const delta of [[0, 0, 0], [-1, 0, 1]]) {
                        uniforms.forEach(value => value.set(...delta)); d.renderer.render(); captures.push(capture());
                    }
                    owner = captures;
                } finally { uniforms.forEach((value, index) => value.copy(values[index])); d.renderer.render(); }
            }
            const b = model.builder, sample = b.hdOverride.frames[pose.frame + b.frameOffset].sampleRect;
            const logical = b.getSpriteGeometryOptions(pose.frame).logicalSize;
            return { ...pose, bounds, crop, originalFacing: actor.turretTrait.facing,
                tick: d.game.currentTick, hash: d.game.getHash(), bodyGpuHd: !!b.getHdPage(),
                sample: [sample.width, sample.height], logical: [logical.width, logical.height],
                turretVisible: r.turret.visible, glError: gl.getContext().getError(), png, owner };
        }, { pose, density });
        assert.equal(captured.tick, report.before.tick); assert.equal(captured.hash, report.before.hash);
        assert.equal(captured.originalFacing, report.actor.facing); assert.equal(captured.glError, 0);
        assert(captured.bodyGpuHd); assert.equal(captured.turretVisible, !pose.rubble);
        assert.deepEqual(captured.sample, captured.logical.map(value => value * density));
        const file = `native-${pose.frame}-${pose.heading}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(captured.png.split(',')[1], 'base64'));
        if (captured.owner) {
            const images = captured.owner.map(png => PNG.sync.read(Buffer.from(png.split(',')[1], 'base64')));
            let changedPixels = 0, changedAlpha = 0;
            for (let i = 0; i < images[0].data.length; i += 4) {
                if ([0, 1, 2].some(channel => images[0].data[i + channel] !== images[1].data[i + channel])) changedPixels++;
                if (images[0].data[i + 3] !== images[1].data[i + 3]) changedAlpha++;
            }
            assert.equal(changedAlpha, 0); assert.equal(changedPixels > 0, identity === 'CAOUTP');
            report.ownerMaterial = { changedPixels, changedAlpha, originalOwnershipUnchanged: true };
            for (const [index, color] of ['red', 'blue'].entries())
                await fs.writeFile(path.join(out, `turret-owner-${color}.png`), PNG.sync.write(images[index]));
        }
        delete captured.png; delete captured.owner; report.poses.push({ ...captured, file });
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    report.programCompilation = await page.evaluate(() => window.__programLifetime);
    assert(report.programCompilation.every(span => span.finished && span.materials.every(material => !material.disposals.length)));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_COMPLETE_ORIGINAL_BUILDING_HD_TURRET_BEARINGS_BODY_STATES_AND_OWNER_MATERIAL';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) {
        report.environmentHd = await page.evaluate(() => window.__ra2debug?.environmentHd).catch(() => undefined);
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    }
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
