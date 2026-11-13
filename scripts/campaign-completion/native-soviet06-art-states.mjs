import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3]);
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[4])));
const resources = JSON.parse(await fs.readFile('docs/campaign-art/sov06-new-resources.json'));
const expectedHash = resources.ship.variants.find(variant => variant.density === density).hash;
const report = { status: 'RUNNING', density, errors: [], failedResources: [], frames: [],
    scope: 'Compare the genuine original Soviet 06 harbor checkpoint, then inspect native HD renderables in explicitly diagnostic presentation poses. Only native view headings, loaded/empty visibility and SHP display frames change; simulation stays frozen. This is geometry/material/state evidence, not a manufactured mission event or full user visual acceptance.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, 'sov06t.map'), checkpoint);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    report.restored = await page.evaluate(() => { const g = window.__ra2debug.game;
        return JSON.parse(JSON.stringify({ worldHash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length })); });
    assert.deepEqual(report.restored, checkpoint.expected); await closeCampaignMenuPaused(page);
    await page.evaluate(() => { const d = window.__ra2debug;
        d.game.campaign.inspectionModified = true; d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove(); });
    for (const name of ['CDEST', 'CAMIAM08']) {
        await page.evaluate(name => { const d = window.__ra2debug;
            const unit = d.game.world.getAllObjects().find(unit => unit.name === name && !unit.isDestroyed);
            if (!unit) throw Error('Missing actual source actor ' + name);
            window.__artStateObject = unit; d.worldInteraction.minimapHandler.panToTile(unit.tile);
        }, name);
        // The other actor may already be resident before the camera's next
        // frame. Let the paused presentation apply the actual pan first.
        await page.waitForTimeout(200);
        await page.waitForFunction(name => { const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__artStateObject);
            return name === 'CDEST' ? r?.unitVxlHd?.active : r?.mainObj?.builder?.getHdPage?.();
        }, name, { timeout: 30000 });
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const poses = name === 'CDEST' ? ['loaded', 'empty'].flatMap(state =>
            Array.from({ length: 8 }, (_, index) => ({ name, state, heading: index * 45 })))
            : [0, 1, 2, 3].map(frame => ({ name, frame }));
        for (const pose of poses) {
            const result = await page.evaluate(pose => {
                const d = window.__ra2debug, w = d.worldScene, unit = window.__artStateObject;
                const r = d.renderableManager.getRenderableByGameObject(unit);
                if (pose.name === 'CDEST') {
                    r.mainVxl.visible = pose.state === 'loaded'; r.noSpawnAltVxl.visible = pose.state === 'empty';
                    r.updateVxlRotation(pose.heading, true); r.unitVxlHd.update();
                } else r.mainObj.setFrame(pose.frame);
                const matrixPolicy = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = matrixPolicy; }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
                const center = w.camera.position.clone().setFromMatrixPosition(r.get3DObject().matrixWorld).project(w.camera);
                const crop = [Math.round((v.x + (center.x + 1) * v.width / 2) * ratio - 256),
                    Math.round((v.y + (1 - center.y) * v.height / 2) * ratio - 192), 512, 384];
                if (crop[0] < 0 || crop[1] < 0 || crop[0] + crop[2] > gl.domElement.width
                    || crop[1] + crop[3] > gl.domElement.height) throw Error('Diagnostic actor was not framed after the camera pan');
                const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
                canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 512, 384);
                const layers = r.unitVxlHd?.layers.flatMap(layer => layer.frames.filter(frame => frame.batch.visible)
                    .map(frame => ({ member: frame.part.member, heading: frame.frame.heading,
                        identity: frame.part.override.identity, material: frame.batch.material.type }))) ?? [];
                const builder = r.mainObj?.builder, page = builder?.getHdPage?.(), material = r.mainObj?.getShapeMesh?.()?.material;
                return { ...pose, id: unit.id, tick: d.game.currentTick, hash: d.game.getHash(), crop, layers,
                    shp: builder && { frame: builder.frameNo, identity: builder.hdOverride?.identity,
                        gpuHd: !!page && material?.type === 'HdSpriteMaterial' && material.map === page.base },
                    glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
            }, pose);
            assert.equal(result.glError, 0); assert.equal(result.tick, checkpoint.tick);
            if (name === 'CDEST') {
                assert.equal(result.layers.length, 1);
                assert.equal(result.layers[0].member, pose.state === 'loaded' ? 'cdest.vxl' : 'cdestwo.vxl');
                assert.equal(result.layers[0].heading, pose.heading);
                assert(result.layers[0].identity.startsWith(expectedHash + '/'));
            } else { assert(result.shp.gpuHd); assert.equal(result.shp.frame, pose.frame); }
            const file = name.toLowerCase() + '-' + (pose.state ? pose.state + '-' + pose.heading : 'frame-' + pose.frame) + '.png';
            const bytes = Buffer.from(result.png.split(',')[1], 'base64'), pixels = PNG.sync.read(bytes);
            let nonblack = 0;
            for (let index = 0; index < pixels.data.length; index += 4)
                if (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2] > 24) nonblack++;
            assert(nonblack > pixels.width * pixels.height / 2, 'Native capture must contain the framed scene');
            await fs.writeFile(path.join(out, file), bytes);
            delete result.png; report.frames.push({ ...result, file });
        }
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    assert.equal(report.frames.length, 20); assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_DIAGNOSTIC_SOVIET06_HD_HEADINGS_HULLS_AND_BUILDING_FRAMES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
