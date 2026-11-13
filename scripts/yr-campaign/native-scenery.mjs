import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, mission, requestedDensity, ledgerFile, requestedKind = 'terrain'] = process.argv.slice(2);
assert(['terrain', 'overlay'].includes(requestedKind));
const layerName = requestedKind === 'overlay' ? 'overlayLayer' : 'terrainLayer';
const out = path.resolve(output), density = Number(requestedDensity), zoom = density === 4 ? 2 : 1;
assert([2, 4].includes(density));
const ledger = JSON.parse(await fs.readFile(ledgerFile));
const items = await Promise.all(ledger.families.filter(item => item.primaryMission === mission).map(async item => {
    const registration = JSON.parse(await fs.readFile(item.registration));
    const source = JSON.parse(await fs.readFile(path.join(registration.stage, 'prepared/source.json'))).sources[0];
    assert.equal(registration.theater, item.theater);
    assert(source.bindings.every(binding => binding.kind === requestedKind));
    if (requestedKind === 'overlay') {
        assert.equal(item.theater, 'NEWURBAN');
        assert(['TROCK03', 'SROCK05'].includes(item.identity));
        assert.equal(source.nativeObjectType, 4);
    }
    assert.equal(source.identity, item.identity); assert.equal(source.sha256, item.sourceSha256);
    assert.equal(source.bodyFrames, 1); assert.equal(source.totalFrames, 2); assert.equal(source.remapable, false);
    return { identity: item.identity, family: item.family, sourceSha256: source.sha256,
        member: source.member, canvas: source.canvas, nativeFrame: source.frames[0], sourceHasShadow: source.hasShadow };
}));
assert(items.length > 0);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, density, kind: requestedKind, cameraZoom: zoom,
    errors: [], failedResources: [], samples: [],
    scope: 'Fresh original YR source placements with the actual static scenery batch and original separate shadow batch. '
        + 'Revealed, frozen renderer inspection isolates existing batch draw ranges and changes diagnostic palettes only. '
        + 'No world actor, health, position, ownership, task, RNG, source rule or mission result is assigned.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density, edition: 'yr' }));
    page.on('console', message => {
        const text = message.text(), prefix = '[World HD match] ';
        if (text.startsWith(prefix)) report.worldHd = JSON.parse(text.slice(prefix.length));
    });
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
    await waitWorld(page, mission);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.game.campaign.inspectionModified = true;
        d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        // Publish the queued reveal to the existing shroud mesh before the
        // animation loop stops. Source world turns remain paused.
        d.mapRenderable.shroudLayer?.update(0);
        d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
    });
    await page.waitForFunction(({ items, layerName }) => {
        const d = window.__ra2debug, layer = d.mapRenderable[layerName];
        return items.every(item => {
            const actor = d.game.world.getAllObjects().find(actor => actor.name === item.identity && actor.isSpawned && !actor.isDestroyed);
            return actor && layer.getObjectHdBinding(actor)?.identity.includes(item.sourceSha256);
        });
    }, { items, layerName }, { timeout: 30000 });
    report.before = await worldState(page);
    await page.screenshot({ path: path.join(out, 'before-inspection.png') });
    report.environmentHd = await page.evaluate(() => window.__ra2debug.environmentHd);
    assert.equal(report.worldHd.worldBudget, (density === 2 ? 512 : 1536) * 1024 ** 2);
    assert(report.environmentHd.budget <= report.worldHd.worldBudget);
    assert(report.environmentHd.worldChargeBytes <= report.environmentHd.budget);
    for (const item of items) {
        const state = await page.evaluate(({ item, zoom, layerName }) => {
            const d = window.__ra2debug, w = d.worldScene, layer = d.mapRenderable[layerName];
            const actor = d.game.world.getAllObjects().find(actor => actor.name === item.identity && actor.isSpawned && !actor.isDestroyed);
            const specs = layer.batchShpSpecsByObject.get(actor);
            if (!specs?.main?.hdOverride || !specs.shadow) throw Error('Actual source body and shadow batch required');
            const mainBuilder = [...layer.batchShpBuilders.values()].flat().find(builder => builder.has(specs.main));
            const shadowBuilder = layer.shadowBatchShpBuilders.find(builder => builder.has(specs.shadow));
            if (!mainBuilder || !shadowBuilder || shadowBuilder.hdOverride) throw Error('Original separate indexed shadow required');
            const target = mainBuilder.build(), shadow = shadowBuilder.build();
            const saved = { roots: [], meshes: layer.get3DObject().children.map(mesh => ({ mesh, visible: mesh.visible,
                drawRange: { ...mesh.geometry.drawRange } })) };
            for (const object of d.game.world.getAllObjects()) {
                const root = d.renderableManager.getRenderableByGameObject(object)?.get3DObject();
                if (root) { saved.roots.push({ root, visible: root.visible }); root.visible = object === actor; }
            }
            for (const mesh of layer.get3DObject().children) mesh.visible = mesh === target || mesh === shadow;
            for (const [builder, spec] of [[mainBuilder, specs.main], [shadowBuilder, specs.shadow]]) {
                const mesh = builder.build(), index = builder.specIndexes.get(spec);
                if (!Number.isInteger(index)) throw Error('Actual original batch index required');
                const count = builder.trianglesPerSprite * 3;
                mesh.geometry.setDrawRange(index * count, count);
            }
            window.__sceneryInspection = { actor, specs, mainBuilder, shadowBuilder, saved };
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            const free = w.cameraPan.freeCamera, previousFree = free.value;
            const projected = (builder, spec) => {
                const mesh = builder.build(), positions = mesh.geometry.getAttribute('position');
                const first = builder.specIndexes.get(spec) * builder.verticesPerSprite;
                return Array.from({ length: builder.verticesPerSprite }, (_, offset) => w.camera.position.clone()
                    .set(positions.getX(first + offset), positions.getY(first + offset), positions.getZ(first + offset))
                    .applyMatrix4(mesh.matrixWorld).project(w.camera));
            };
            free.value = true;
            try {
                for (let pass = 0; pass < 3; pass++) {
                    w.updateCamera(w.cameraPan.getPan(), zoom);
                    const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                    const points = projected(mainBuilder, specs.main), pan = w.cameraPan.getPan(), v = w.viewport;
                    w.cameraPan.setPan({ x: pan.x + (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * v.width / 4,
                        y: pan.y - (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * v.height / 4 });
                }
            } finally { free.value = previousFree; }
            w.updateCamera(w.cameraPan.getPan(), zoom); w.meshBatchManager.updateMeshes(); d.renderer.render();
            const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const points = [...projected(mainBuilder, specs.main), ...projected(shadowBuilder, specs.shadow)];
            const px = points.map(p => (v.x + (p.x + 1) * v.width / 2) * ratio);
            const py = points.map(p => (v.y + (1 - p.y) * v.height / 2) * ratio);
            const bounds = [Math.floor(Math.min(...px)) - 16, Math.floor(Math.min(...py)) - 16,
                Math.ceil(Math.max(...px)) + 16, Math.ceil(Math.max(...py)) + 16];
            if (bounds[0] < 0 || bounds[1] < 0 || bounds[2] > gl.domElement.width || bounds[3] > gl.domElement.height)
                throw Error('The complete original scenery and shadow must fit the native viewport');
            const frame = specs.main.hdOverride.frames[0], page = specs.main.hdOverride.pages[frame.page];
            return { identity: actor.name, actor: actor.id, health: actor.healthTrait?.health,
                tile: [actor.tile.rx, actor.tile.ry], member: specs.main.shpFile.filename,
                override: specs.main.hdOverride.identity, sample: [frame.sampleRect.width, frame.sampleRect.height],
                logical: [item.nativeFrame.size[0] + item.nativeFrame.size[0] % 2,
                    item.nativeFrame.size[1] + item.nativeFrame.size[1] % 2],
                gpu: !!gl.properties.get(page.base).__webglTexture && !!gl.properties.get(page.data).__webglTexture,
                batched: layer.hasObject(actor), shadowFrame: specs.shadow.frameNo,
                expectedShadowFrame: layer.aggregatedImageData.imageIndexes.get(specs.main.shpFile)
                    + layer.aggregatedImageData.file.numImages / 2,
                originalIndexedShadow: !shadowBuilder.hdOverride, bounds, glError: gl.getContext().getError() };
        }, { item, zoom, layerName });
        assert.equal(state.member, item.member); assert(state.override.includes(item.sourceSha256));
        assert.equal(state.gpu, true); assert.equal(state.batched, true); assert.equal(state.originalIndexedShadow, true);
        assert.equal(state.shadowFrame, state.expectedShadowFrame); assert.equal(state.glError, 0);
        assert.deepEqual(state.sample, state.logical.map(value => value * density));
        await page.screenshot({ path: path.join(out, item.identity.toLowerCase() + '-scene.png') });
        const captures = await page.evaluate(bounds => {
            const d = window.__ra2debug, w = d.worldScene, state = window.__sceneryInspection;
            const original = state.mainBuilder.palette, canvas = document.createElement('canvas');
            canvas.width = bounds[2] - bounds[0]; canvas.height = bounds[3] - bounds[1];
            const context = canvas.getContext('2d');
            const paletteSource = d.game.world.getAllObjects().map(object => d.renderableManager.getRenderableByGameObject(object))
                .find(renderable => renderable?.paletteRemaps?.length >= 2);
            if (!paletteSource) throw Error('Original registered house palettes required for the negative owner probe');
            const score = (palette, channel) => {
                const color = palette.getColor(16); return channel === 'red' ? color.r - color.b : color.b - color.r;
            };
            const palettes = ['red', 'blue'].map(channel => [...paletteSource.paletteRemaps]
                .sort((a, b) => score(b, channel) - score(a, channel))[0]);
            if (palettes[0].hash === palettes[1].hash) throw Error('Two distinct original house palettes required');
            const capture = () => {
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(d.renderer.renderer.domElement, bounds[0], bounds[1], canvas.width, canvas.height,
                    0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            };
            const images = [capture()];
            try { for (const palette of palettes) { state.mainBuilder.setPalette(palette); images.push(capture()); } }
            finally { state.mainBuilder.setPalette(original); w.meshBatchManager.updateMeshes(); d.renderer.render(); }
            const main = state.mainBuilder.build(), shadow = state.shadowBuilder.build();
            try {
                main.visible = false; shadow.visible = false; images.push(capture());
                main.visible = true; images.push(capture());
                main.visible = false; shadow.visible = true; images.push(capture());
            } finally { main.visible = true; shadow.visible = true; w.meshBatchManager.updateMeshes(); d.renderer.render(); }
            return { images, paletteHashes: palettes.map(palette => palette.hash) };
        }, state.bounds);
        const decoded = captures.images.map(url => PNG.sync.read(Buffer.from(url.split(',')[1], 'base64')));
        let changedPixels = 0, changedAlphaPixels = 0;
        for (let offset = 0; offset < decoded[1].data.length; offset += 4) {
            if ([0, 1, 2].some(channel => decoded[1].data[offset + channel] !== decoded[2].data[offset + channel])) changedPixels++;
            if (decoded[1].data[offset + 3] !== decoded[2].data[offset + 3]) changedAlphaPixels++;
        }
        assert.equal(changedPixels, 0); assert.equal(changedAlphaPixels, 0);
        const difference = (a, b) => {
            let count = 0;
            for (let offset = 0; offset < a.data.length; offset += 4)
                if ([0, 1, 2, 3].some(channel => a.data[offset + channel] !== b.data[offset + channel])) count++;
            return count;
        };
        state.visibleBodyPixels = difference(decoded[4], decoded[3]);
        state.visibleShadowPixels = difference(decoded[5], decoded[3]);
        assert(state.visibleBodyPixels > Math.max(16, state.logical[0] * state.logical[1] * density**2 * .01),
            'The actual original body batch must visibly change the frozen native background');
        assert(state.visibleShadowPixels > 8, 'The original separate shadow must visibly change the frozen native background');
        state.ownerColors = { changedPixels, changedAlphaPixels, paletteHashes: captures.paletteHashes,
            originalRemapable: false, qualification: 'Diagnostic batch palettes only; original terrain ownership and world state unchanged.' };
        for (const [index, label] of ['native', 'owner-red', 'owner-blue', 'background', 'body-only', 'shadow-only'].entries()) {
            const file = `${item.identity.toLowerCase()}-${label}.png`;
            await fs.writeFile(path.join(out, file), PNG.sync.write(decoded[index]));
            if (!index) state.file = file;
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, state = window.__sceneryInspection;
            for (const { root, visible } of state.saved.roots) root.visible = visible;
            for (const { mesh, visible, drawRange } of state.saved.meshes) {
                mesh.visible = visible; mesh.geometry.setDrawRange(drawRange.start, drawRange.count);
            }
            d.renderer.render(); delete window.__sceneryInspection;
        });
        assert.deepEqual(await worldState(page), report.before);
        report.samples.push(state);
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__sceneryOldWorld = { environment: d.environmentHd, terrain: d.terrainHd };
        d.gameScreen.controller.goToScreen(0);
    });
    await page.waitForFunction(() => window.__sceneryOldWorld.environment.disposed
        && window.__sceneryOldWorld.terrain.disposed, undefined, { timeout: 30000 });
    report.release = await page.evaluate(() => window.__sceneryOldWorld);
    for (const kind of ['environment', 'terrain']) {
        assert.equal(report.release[kind].worldChargeBytes, 0); assert.equal(report.release[kind].disposed, true);
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_SCENERY_BATCH_2X_4X_FIXED_MATERIAL_SHADOWS_AND_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, mission, density, samples: report.samples.length, error: report.error, out }));
