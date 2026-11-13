import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
const density = Number(process.argv.find(value => value.startsWith('--density='))?.split('=')[1] ?? 4);
const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'sov04s.map';
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', density, errors: [], failedResources: [], loading: [], shipyard: [],
    scope: 'Actual original Soviet04 source placement and held loading UI. Progress values and frozen native animation poses are diagnostic presentation controls; original map, rules, triggers, world, tick and RNG are preserved.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density }));
    if (!process.argv.includes('--shipyard-only')) {
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory);
        window.__restoreLoadingFactory = () => factory.create = create;
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => {
                await start(...args); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve);
            };
            return api;
        };
    });
    // Soviet02 has complete formal HD chrome; Soviet04 intentionally retains
    // Original loading while its photograph material remains unfinished.
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov02t.map'));
    await page.waitForFunction(() => window.__heldLoading && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    for (const percent of [0, 25, 62, 100]) {
        await page.evaluate(percent => window.__heldLoading.onLoadProgress(percent), percent);
        await page.waitForTimeout(100);
        const metrics = await page.evaluate(() => {
            const node = document.querySelector('[data-campaign-loading]');
            const housing = node.querySelector('[data-campaign-sprite="spldbrl.shp"]');
            const fill = node.querySelector('[data-campaign-sprite="spldbr.shp"]') ?? node.querySelector('[data-loading-fill]');
            return { percent: Number(node.dataset.percent), density: node.dataset.campaignArtDensity,
                housing: housing.getBoundingClientRect().toJSON(), fill: fill.getBoundingClientRect().toJSON(),
                metal: housing.querySelector('[data-loading-metal]')?.getAttribute('data-loading-metal'),
                fillMaterial: fill.getAttribute('data-loading-fill') ?? fill.querySelector('[data-loading-fill]')?.getAttribute('data-loading-fill'),
                fillMarkup: fill.outerHTML.replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,omitted') };
        });
        const file = `loading-${percent}.png`;
        await page.screenshot({ path: path.join(out, file) });
        report.loading.push({ ...metrics, file });
    }
    await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, 'sov02t.map');
    await page.evaluate(() => { window.__restoreLoadingFactory(); window.__ra2debug.gameScreen.menu.open(); });
    await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
    await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]');
    }
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
    await waitWorld(page, mission);
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const object = g.world.getAllObjects().find(object => object.name === 'NAYARD' && object.isSpawned);
        if (!object) throw Error('Original Soviet04 shipyard absent');
        window.__feedbackYard = object;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.worldInteraction.minimapHandler.panToTile(object.tile); d.gameScreen.pointer.unlock(true);
    });
    await page.waitForFunction(density => {
        const r = window.__ra2debug.renderableManager.getRenderableByGameObject(window.__feedbackYard);
        return r?.mainObj?.get3DObject() && (!density || r.mainObj.builder.getHdPage?.());
    }, density, { timeout: 60000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    report.framing = await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop();
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        const w = d.worldScene, r = d.renderableManager.getRenderableByGameObject(window.__feedbackYard);
        const mesh = r.mainObj.getShapeMesh(), position = mesh.geometry.getAttribute('position');
        w.cameraZoom.zoom = w.lastCameraZoom = 2; w.camera.zoom = 2;
        w.camera.updateProjectionMatrix();
        const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
        const observations = [];
        try {
            for (let pass = 0; pass < 3; pass++) {
                w.updateCamera(w.cameraPan.getPan(), 2);
                d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
                const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                const points = Array.from({ length: position.count }, (_, i) => w.camera.position.clone()
                    .set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(mesh.matrixWorld).project(w.camera));
                const x = (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) * w.viewport.width / 4;
                const y = -(Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) * w.viewport.height / 4;
                const pan = w.cameraPan.getPan(); observations.push({ x, y, pan });
                w.cameraPan.setPan({ x: pan.x + x, y: pan.y + y });
            }
        } finally { free.value = previous; }
        w.updateCamera(w.cameraPan.getPan(), 2);
        d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
        r.update(0);
        return { observations, targetVisible: r.get3DObject().visible, tile: [window.__feedbackYard.tile.rx, window.__feedbackYard.tile.ry] };
    });
    assert(report.framing.targetVisible, 'Source shipyard must be visible in its actual framebuffer');
    report.before = await worldState(page);
    const poses = process.argv.includes('--all-yard-states')
        ? [['idle', 30], ['production', 82], ['docking', 36]].flatMap(([mode, count]) =>
            Array.from({ length: count }, (_, frame) => ({ mode, frame })))
        : Array.from({ length: 15 }, (_, frame) => ({ mode: 'idle', frame }));
    for (const pose of poses) {
        const capture = await page.evaluate(({ mode, frame }) => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__feedbackYard);
            const parts = [...r.animObjects].flatMap(([type, models]) => models.map((model, index) => ({
                model, data: r.animArtProps.getByType(type)[index], type, index,
            })));
            const damaged = frame >= (mode === 'production' ? 41 : mode === 'docking' ? 18 : 15);
            const selected = mode === 'idle' ? 'NAYARD_A' : mode === 'production' ? 'NAYARD_D'
                : `NAYARD_S${frame % 18 >= 13 ? 3 : frame % 18 >= 6 ? 2 : 1}`;
            r.mainObj.setFrame(damaged ? 1 : 0);
            for (const part of parts) {
                if (/^NAYARD_(A|D|S[123])$/.test(part.data.name)) {
                    part.model.get3DObject().visible = part.data.name === selected;
                    if (part.data.name === selected) part.model.setFrame(frame);
                } else if (/^NAYARD_[BC]$/.test(part.data.name)) part.model.setFrame(damaged ? 15 : 0);
            }
            const w = d.worldScene, automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            return { mode, frame, damaged, selected,
                archivedOnly: mode === 'docking' && frame % 18 === 0 || mode === 'production' && frame === 81,
                tick: d.game.currentTick, hash: d.game.getHash(),
                parts: parts.map(({ model, data, type, index }) => ({ name: data.name, type, index,
                    visible: model.get3DObject().visible, frame: model.builder.getFrame(), offset: model.builder.frameOffset,
                    hd: !!model.builder.getHdPage?.(), depth: model.builder.hdDepthOffset ?? model.builder.depthOffset,
                    logical: model.builder.getSpriteGeometryOptions(model.builder.getFrame()).logicalSize })),
                glError: d.renderer.renderer.getContext().getError() };
        }, pose);
        const file = `shipyard-${pose.mode}-${String(pose.frame).padStart(2, '0')}.png`;
        const full = pose.frame === 0 || pose.mode === 'idle' && [9, 15, 24].includes(pose.frame)
            || pose.mode === 'production' && [14, 40, 41, 55, 81].includes(pose.frame);
        const clip = !full && process.argv.includes('--all-yard-states') ? await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldScene;
            return { x: Math.max(0, w.viewport.x + w.viewport.width / 2 - 150),
                y: Math.max(0, w.viewport.y + w.viewport.height / 2 - 240), width: 300, height: 260 };
        }) : undefined;
        const bytes = await page.screenshot({ path: path.join(out, file), ...(clip ? { clip } : {}) });
        report.shipyard.push({ ...capture, file, imageSha256: createHash('sha256').update(bytes).digest('hex') });
        assert.equal(capture.glError, 0); assert.equal(capture.tick, report.before.tick); assert.equal(capture.hash, report.before.hash);
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    if (process.argv.includes('--depth-probe') && density) {
        report.depthProbe = [];
        for (const offset of [-1, 0, 1, 4, 8, 16, 32, 77]) {
            const state = await page.evaluate(offset => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__feedbackYard);
                const model = r.animObjects.get(0)[0];
                model.setHdDepthOffset(offset); model.setFrame(8); model.setFrame(9);
                const w = d.worldScene, automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
                try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
                w.meshBatchManager.updateMeshes(); d.renderer.render();
                return { offset, material: model.getShapeMesh().material.type, tick: d.game.currentTick, hash: d.game.getHash() };
            }, offset);
            const file = `depth-probe-${offset}.png`; await page.screenshot({ path: path.join(out, file) });
            report.depthProbe.push({ ...state, file });
        }
    }
    report.distinctShipyardPoses = new Set(report.shipyard.map(frame => frame.imageSha256)).size;
    assert(report.distinctShipyardPoses >= 8, 'Native shipyard poses must visibly update');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_SOURCE_AND_PRESENTATION_OBSERVATIONS_NOT_VISUAL_ACCEPTANCE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
