import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, stepWorld, waitWorld, worldState } from '../m3-2/native-session.mjs';
import { requiredNativeHd } from './native-required-hd.mjs';

const out = path.resolve(process.argv[2]), density = Number(process.argv[3]);
const lampsOnly = process.argv.includes('--lamps-only');
const names = lampsOnly ? ['LT_GEN01', 'LT_GEN04'] : ['LT_GEN01', 'LT_GEN04', 'PROPA'];
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const resources = JSON.parse(await fs.readFile('docs/campaign-art/sov07-propa-resources-v37.json'));
const expectedHash = resources.variants.find(variant => variant.density === density).hash;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report = { status: 'RUNNING', density, lampsOnly, errors: [], failedResources: [], frames: [], details: [],
    scope: lampsOnly ? 'Two original Soviet07 lamp placements after30 additional unmodified turns. Actual GPU density, source shadows, camera/reveal detail crops, unchanged frozen world and Abort disposal only. No truck revalidation, new objective or storyline claim.'
        : 'Original Soviet07 initial actors after30 ordinary unmodified turns. Camera/reveal and eight frozen renderer-only truck headings are explicitly diagnostic artwork evidence. Original world/rules/actors/headings/owner, mission/timers/tick/RNG and callbacks remain unchanged during rendering; no source objective or victory is manufactured.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'sov07s.map'));
    await waitWorld(page, 'sov07s.map'); await pauseWorld(page); await stepWorld(page, 30);
    await page.evaluate(() => { const d = window.__ra2debug;
        d.game.campaign.inspectionModified = true; d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        window.__artEnvironment = d.environmentHd; window.__artDemand = d.worldView.sovietUnitsHd.report;
    });
    report.requiredHd = await requiredNativeHd(page, names, density);
    const before = await worldState(page);
    report.frozenState = { sha256: digest(before), tick: before.tick, worldHash: before.hash, rng: before.rng };
    for (const name of names) {
        await page.evaluate(name => { const d = window.__ra2debug;
            const object = d.game.world.getAllObjects().find(object => object.name === name && object.isSpawned && !object.isDestroyed);
            if (!object) throw Error('Original actor absent: ' + name);
            window.__artObject = object; d.worldInteraction.minimapHandler.panToTile(object.tile);
        }, name);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(out, name.toLowerCase() + '-native-world.png') });
        if (lampsOnly) {
            const detail = await page.evaluate(() => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer, v = w.viewport;
                const r = d.renderableManager.getRenderableByGameObject(window.__artObject);
                const center = r.getPosition().clone().project(w.camera), ratio = gl.domElement.width / d.renderer.width;
                const anchor = [(v.x + (center.x + 1) * v.width / 2) * ratio,
                    (v.y + (1 - center.y) * v.height / 2) * ratio];
                const crop = [Math.round(anchor[0] - 64 * ratio), Math.round(anchor[1] - 55 * ratio),
                    Math.round(128 * ratio), Math.round(110 * ratio)];
                if (crop[0] < 0 || crop[1] < 0 || crop[0] + crop[2] > gl.domElement.width
                    || crop[1] + crop[3] > gl.domElement.height) throw Error('Original lamp detail is not framed');
                const canvas = document.createElement('canvas'); canvas.width = crop[2]; canvas.height = crop[3];
                canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, ...crop.slice(2));
                return { anchor, crop, ratio, png: canvas.toDataURL('image/png') };
            });
            const file = name.toLowerCase() + '-native-detail.png';
            await fs.writeFile(path.join(out, file), Buffer.from(detail.png.split(',')[1], 'base64'));
            delete detail.png; report.details.push({ name, file, ...detail });
        }
    }
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    try {
        for (const heading of lampsOnly ? [] : Array.from({ length: 8 }, (_, index) => index * 45)) {
            const frame = await page.evaluate(heading => {
                const d = window.__ra2debug, w = d.worldScene, object = window.__artObject;
                const r = d.renderableManager.getRenderableByGameObject(object);
                r.updateVxlRotation(heading, true); r.unitVxlHd.update();
                const previous = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = previous; }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                const gl = d.renderer.renderer, viewport = w.viewport, ratio = gl.domElement.width / d.renderer.width;
                const center = w.camera.position.clone().setFromMatrixPosition(r.get3DObject().matrixWorld).project(w.camera);
                const crop = [Math.round((viewport.x + (center.x + 1) * viewport.width / 2) * ratio - 256),
                    Math.round((viewport.y + (1 - center.y) * viewport.height / 2) * ratio - 192), 512, 384];
                if (crop[0] < 0 || crop[1] < 0 || crop[0] + 512 > gl.domElement.width
                    || crop[1] + 384 > gl.domElement.height) throw Error('Original source truck is not framed');
                const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
                canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 512, 384);
                const layers = r.unitVxlHd.layers.flatMap(layer => layer.frames.filter(frame => frame.batch.visible)
                    .map(frame => ({ member: frame.part.member, heading: frame.frame.heading,
                        identity: frame.part.override.identity, gpuHd: frame.source.material.type === 'HdSpriteMaterial'
                            && frame.source.material.map === frame.part.override.pages[0].base,
                        density: [frame.frame.rect[2] / frame.frame.logicalSize[0], frame.frame.rect[3] / frame.frame.logicalSize[1]] })));
                return { heading, id: object.id, crop, ratio, layers, glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
            }, heading);
            assert.equal(frame.glError, 0); assert.equal(frame.layers.length, 1);
            const layer = frame.layers[0]; assert(layer.gpuHd); assert.equal(layer.heading, heading);
            assert.equal(layer.member, 'propa.vxl'); assert(layer.identity.startsWith(expectedHash + '/'));
            assert.deepEqual(layer.density, [density, density]);
            const file = `propa-heading-${heading}.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
            delete frame.png; report.frames.push({ ...frame, file });
        }
        assert.deepEqual(await worldState(page), before);
        report.frozenPresentationStateUnchanged = true;
    } finally { await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start()); }
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
    report.afterAbort = await page.evaluate(() => ({ environmentDisposed: window.__artEnvironment.disposed,
        gpuBytes: window.__artEnvironment.gpuBytes, cpuBytes: window.__artEnvironment.retainedCpuBytes,
        unitGpuBytes: window.__artDemand.gpuBytes, noTrainerSession: !window.__ra2debug.trainer.session,
        activeMedia: document.querySelectorAll('[data-campaign-media]').length }));
    assert(report.afterAbort.environmentDisposed && report.afterAbort.noTrainerSession);
    assert.equal(report.afterAbort.gpuBytes, 0); assert.equal(report.afterAbort.cpuBytes, 0);
    assert.equal(report.afterAbort.unitGpuBytes, 0); assert.equal(report.afterAbort.activeMedia, 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = lampsOnly ? 'PASS_NATIVE_LAMP_DENSITIES_SHADOWS_FROZEN_WORLD_AND_ABORT_DISPOSAL'
        : 'PASS_NATIVE_SOURCE_LAMPS_SHADOWS_EIGHT_TRUCK_HEADINGS_FROZEN_WORLD_AND_ABORT_DISPOSAL';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (error.nativeHdRows) report.requiredHd = error.nativeHdRows;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
