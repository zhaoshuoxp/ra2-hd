import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, requestedDensity, receiptFile] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
const reviewCloseups = process.argv.includes('--review-closeups');
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const receipt = JSON.parse(await fs.readFile(receiptFile));
const admission = receipt.preparation.bridgeAggregate;
assert.equal(admission.members.length, 26);
const report = { status: 'RUNNING', density, errors: [], failedResources: [], frames: [], assemblies: [],
    scope: 'Actual unchanged-source Allied08 bridge followed by isolated native sprite variants and source-compatible X/Y assemblies. Assemblies are renderer-only diagnostics on a neutral backdrop. They create no game object, change no original placement/health/trigger, and preserve world/tick/RNG/teams. Opposite-direction variants are never substituted into an unchanged connected mission bridge.' };
let app, page;
const capture = async file => { const bytes = await page.screenshot({ path: path.join(out, file) });
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') }; };
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'all08u.map'));
    await waitWorld(page, 'all08u.map');
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(o => /^LOBRDB\d\d$/.test(o.name) && o.isLowBridge?.() && !o.isBridgePlaceholder?.());
        if (!actor) throw Error('Original low concrete bridge absent');
        window.__bridgeActor = actor; g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        const w = d.worldScene, free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(actor.tile); } finally { free.value = previous; }
    });
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__bridgeActor)
        ?.mainRenderable?.builder?.getHdPage?.(), undefined, { timeout: 60000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldScene; d.gameScreen.gameAnimationLoop.stop();
        w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
        d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
        d.renderer.render();
    });
    report.before = await worldState(page);
    report.originalSource = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__bridgeActor);
        const bridges = d.game.world.getAllObjects().filter(o => o.isLowBridge?.() && !o.isBridgePlaceholder?.());
        const b = r.mainRenderable.builder, frame = b.getFrame(), sample = b.hdOverride.frames[frame].sampleRect;
        const logical = b.getSpriteGeometryOptions(frame).logicalSize;
        return { id: window.__bridgeActor.id, name: window.__bridgeActor.name,
            identity: b.hdOverride.identity, separateShadow: !!r.mainRenderable.shadowRenderable,
            sourceBridges: bridges.map(o => ({ id: o.id, name: o.name, axis: o.isXBridge() ? 'X' : 'Y',
                tile: [o.tile.rx, o.tile.ry], value: o.value })),
            actualDensity: [sample.width / logical.width, sample.height / logical.height],
            hd: b.getHdPage().base === r.mainRenderable.getShapeMesh().material.map };
    });
    assert.deepEqual(report.originalSource.actualDensity, [density, density]); assert(report.originalSource.hd);
    assert.equal(report.originalSource.separateShadow, false);
    for (const member of receipt.bundle.members) assert(report.originalSource.identity.includes(member.sha256));
    report.originalSource.capture = await capture('actual-original-source-bridge.png');
    report.diagnosticSetup = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldScene;
        const r = d.renderableManager.getRenderableByGameObject(window.__bridgeActor), model = r.mainRenderable;
        const container = d.renderableManager.getRenderableContainer().get3DObject();
        const state = window.__bridgeAssembly = { r, model, parent: model.get3DObject().parent,
            hidden: [], clones: [], container };
        const keep = child => { state.hidden.push([child, child.visible]); child.visible = false; };
        for (const child of w.scene.children)
            if (child !== container && child !== w.meshBatchManager.get3DObject() && !child.isLight) keep(child);
        for (const child of container.children) if (child !== r.get3DObject()) keep(child);
        keep(model.get3DObject());
        const label = document.createElement('div'); label.dataset.nativeBridgeDiagnostic = 'true';
        label.textContent = 'Native renderer diagnostic: source-compatible bridge sprites; mission world unchanged';
        Object.assign(label.style, { position: 'fixed', top: '12px', left: '12px', padding: '8px 12px',
            background: '#182128', color: '#fff', fontSize: '18px', zIndex: '9999', pointerEvents: 'none' });
        document.body.append(label);
        state.render = frames => {
            for (const clone of state.clones) { clone.get3DObject().removeFromParent(); clone.dispose(); }
            state.clones = [];
            const axisX = frames[0] <= 9 || frames[0] >= 19 && frames[0] <= 22;
            const b = model.builder;
            frames.forEach((number, index) => {
                if (axisX !== (number <= 9 || number >= 19 && number <= 22)) throw Error('Mixed bridge directions');
                const clone = model.constructor.factory(b.shpFile, b.palette, w.camera, b.offset, false, 0, b.depth);
                clone.setDepthOptions(false, false); clone.setHdOverride(b.hdOverride);
                clone.setBatched(true); clone.setBatchPalettes([r.palette]); clone.setFlat(b.flat);
                clone.setExtraLight(r.extraLight); clone.setFrame(number - 1); clone.create3DObject();
                const root = clone.get3DObject(), mesh = clone.getShapeMesh();
                root.position.x = axisX ? index * 256 : 0; root.position.z = axisX ? 0 : index * 256;
                root.updateMatrix(); mesh.renderOrder = -1; mesh.orderedHdCoverage = true;
                mesh.material.depthTest = false; mesh.material.depthWrite = false;
                state.parent.add(root); state.clones.push(clone);
            });
            const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
            try {
                for (let pass = 0; pass < 2; pass++) {
                    const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                    const points = state.clones.flatMap(clone => {
                        const mesh = clone.getShapeMesh(), p = mesh.geometry.getAttribute('position');
                        return Array.from({ length: p.count }, (_, i) => w.camera.position.clone()
                            .set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mesh.matrixWorld).project(w.camera));
                    });
                    const pan = w.cameraPan.getPan();
                    w.cameraPan.setPan({ x: pan.x + (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * w.viewport.width / 4,
                        y: pan.y - (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * w.viewport.height / 4 });
                    w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                }
            } finally { free.value = previous; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            return state.clones.map((clone, index) => {
                const builder = clone.builder, mesh = clone.getShapeMesh(), hd = builder.getHdPage();
                const sample = builder.hdOverride.frames[frames[index] - 1].sampleRect;
                const logical = builder.getSpriteGeometryOptions(frames[index] - 1).logicalSize;
                return { member: `lobrdb${String(frames[index]).padStart(2, '0')}.urb`,
                    gpuHd: mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === hd.base,
                    actualDensity: [sample.width / logical.width, sample.height / logical.height] };
            });
        };
        return { neutralRendererDiagnostic: true, actualSourceMapUnmodified: true };
    });
    if (reviewCloseups) {
        report.reviewCloseups = { members: [16, 26], zoom: 2, sourceGoalClaim: false };
        await page.evaluate(() => {
            const w = window.__ra2debug.worldScene;
            w.cameraZoom.zoom = w.lastCameraZoom = 2; w.camera.zoom = 2; w.camera.updateProjectionMatrix();
        });
    }
    for (const number of reviewCloseups ? [16, 26] : Array.from({ length: 26 }, (_, index) => index + 1)) {
        const models = await page.evaluate(number => window.__bridgeAssembly.render([number]), number);
        assert(models[0].gpuHd); assert.deepEqual(models[0].actualDensity, [density, density]);
        const captureInfo = await capture(`isolated-lobrdb${String(number).padStart(2, '0')}.png`);
        report.frames.push({ ...models[0], ...captureInfo, source: admission.members[number - 1] });
    }
    const assemblies = reviewCloseups
        ? [['y-damaged16-closeup', [23, 10, 14, 16, 15, 10, 25]], ['y-damaged26-end-closeup', [23, 10, 10, 10, 26]]]
        : [['x-healthy', [21, 1, 1, 1, 1, 1, 19]], ['y-healthy', [23, 10, 10, 10, 10, 10, 25]],
            ['x-damaged', [21, 1, 6, 7, 5, 1, 19]], ['y-damaged', [23, 10, 14, 16, 15, 10, 25]]];
    for (const [name, values] of assemblies) {
        const models = await page.evaluate(values => window.__bridgeAssembly.render(values), values);
        assert(models.every(model => model.gpuHd && model.actualDensity.every(value => value === density)));
        report.assemblies.push({ name, values, models, ...await capture(`native-assembly-${name}.png`) });
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    report.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
    assert.equal(report.glError, 0);
    assert(new Set(report.frames.map(frame => frame.sha256)).size >= (reviewCloseups ? 2 : 20));
    await page.evaluate(() => {
        const d = window.__ra2debug, state = window.__bridgeAssembly;
        for (const clone of state.clones) { clone.get3DObject().removeFromParent(); clone.dispose(); }
        for (const [object, visible] of state.hidden) object.visible = visible;
        d.worldScene.meshBatchManager.updateMeshes();
    });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = reviewCloseups ? 'PASS_NATIVE_SOURCE_PINNED16_26_REVIEW_CLOSEUPS'
        : 'PASS_ACTUAL_SOURCE_AND_ALL26_ISOLATED_NATIVE_VARIANTS_BOTH_AXIS_ASSEMBLIES';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
