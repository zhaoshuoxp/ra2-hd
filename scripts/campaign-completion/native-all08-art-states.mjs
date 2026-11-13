import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3]);
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[4])));
const report = { status: 'RUNNING', density, errors: [], failedResources: [], frames: [],
    scope: 'Restore an unchanged original Allied08 checkpoint, then reveal only for explicitly diagnostic presentation. Inspect the actual CASTL04 GPU resource at four display frames while simulation remains frozen. These poses are art inspection, not native storyline events or mission-goal evidence.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(checkpoint => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(checkpoint, 'all08u.map'), checkpoint);
    await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
        && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
    report.restored = await page.evaluate(() => { const g = window.__ra2debug.game;
        return JSON.parse(JSON.stringify({ worldHash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length })); });
    assert.deepEqual(report.restored, checkpoint.expected);
    await closeCampaignMenuPaused(page);
    report.before = await worldState(page);
    await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        const object = g.world.getAllObjects().find(object => object.name === 'CASTL04' && !object.isDestroyed);
        if (!object) throw Error('The actual original CASTL04 actor is absent');
        window.__archStateObject = object;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(object.tile);
    });
    await page.waitForTimeout(300);
    await page.waitForFunction(density => { const d = window.__ra2debug;
        const builder = d.renderableManager.getRenderableByGameObject(window.__archStateObject)?.mainObj?.builder;
        return !!builder && (density ? !!builder.getHdPage?.() : !builder.hdOverride);
    }, density, { timeout: 30000 });
    await page.screenshot({ path: path.join(out, 'diagnostic-full-scene.png') });
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    for (const frame of [0, 1, 2, 3]) {
        const result = await page.evaluate(frame => {
            const d = window.__ra2debug, w = d.worldScene, object = window.__archStateObject;
            const r = d.renderableManager.getRenderableByGameObject(object);
            r.mainObj.setFrame(frame);
            const matrixPolicy = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = matrixPolicy; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const mesh = r.mainObj.getShapeMesh(), positions = mesh.geometry.getAttribute('position');
            const points = Array.from({ length: positions.count }, (_, index) => {
                const p = w.camera.position.clone().set(positions.getX(index), positions.getY(index), positions.getZ(index))
                    .applyMatrix4(mesh.matrixWorld).project(w.camera);
                return [(v.x + (p.x + 1) * v.width / 2) * ratio, (v.y + (1 - p.y) * v.height / 2) * ratio];
            });
            const bounds = [Math.floor(Math.min(...points.map(point => point[0]))), Math.floor(Math.min(...points.map(point => point[1]))),
                Math.ceil(Math.max(...points.map(point => point[0]))), Math.ceil(Math.max(...points.map(point => point[1])))];
            if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                throw Error('The complete original actor bounds must fit within the native viewport: ' + JSON.stringify(bounds));
            const left = Math.max(0, bounds[0] - 24), top = Math.max(0, bounds[1] - 24);
            const width = Math.min(gl.domElement.width, bounds[2] + 24) - left;
            const height = Math.min(gl.domElement.height, bounds[3] + 24) - top;
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(gl.domElement, left, top, width, height, 0, 0, width, height);
            const b = r.mainObj.builder, p = b.getHdPage?.(), index = frame + b.frameOffset;
            const original = b.shpFile.images[index], sample = b.hdOverride?.frames[index]?.sampleRect;
            return { frame, id: object.id, tick: d.game.currentTick, hash: d.game.getHash(), bounds,
                identity: b.hdOverride?.identity, member: b.shpFile.filename, nativeSize: [original.width, original.height],
                sampleSize: sample && [sample.width, sample.height],
                gpuHd: !!p && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === p.base,
                glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
        }, frame);
        report.currentFrame = { ...result, png: undefined };
        assert.equal(result.tick, checkpoint.tick); assert.equal(result.hash, checkpoint.expected.worldHash);
        assert.equal(result.glError, 0); assert.equal(result.member, 'agg_CASTL04.shp');
        assert.equal(result.gpuHd, density > 0);
        // The validated sample rectangle includes a half-native-pixel gutter
        // on each edge. Measure the authored content independently of it.
        if (density) assert.deepEqual(result.sampleSize.map(size => size - density), result.nativeSize.map(size => size * density));
        const file = `diagnostic-frame-${frame}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(result.png.split(',')[1], 'base64'));
        delete result.png; report.frames.push({ ...result, file });
    }
    delete report.currentFrame;
    report.after = await worldState(page);
    for (const key of ['tick', 'hash', 'rng', 'world', 'pendingCallbacks']) assert.deepEqual(report.after[key], report.before[key]);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_FROZEN_ALL08_ARCH_COMPLETE_DISPLAY_STATES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
