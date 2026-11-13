import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
import { campaignLaunchOptions, enterCampaignFromMain } from './native-campaign-session.mjs';

const receiptFile = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const density = Number(process.argv[4] ?? 4), baseline = process.argv.includes('--baseline');
assert([1, 2, 4].includes(density));
const receipt = JSON.parse(await fs.readFile(receiptFile));
await fs.mkdir(out, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const report = { status: 'RUNNING', sourceHead: receipt.sourceHead, receiptFile, density, baseline,
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    disclosure: 'Native packaged application, fresh profile, paused diagnostic reveal. Native boats remain at their original map positions. Only renderable headings and isolated material visibility/clipping are changed for measurement; simulation state is checked before/after. Unclipped captures are diagnostic controls, not gameplay.',
    units: [], screenshots: [], errors: [], failedResources: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
try {
    app = await electron.launch(await campaignLaunchOptions(receipt, path.join(out, 'profile')));
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await enterCampaignFromMain(page, receipt);
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const windowHandle = await app.browserWindow(page);
    await windowHandle.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
    await page.evaluate(density => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = density !== 1;
        if (density !== 1) d.generalOptions.graphics.hdDensity.value = density;
        d.mainMenuController.screens.get(22).launchDiagnostic();
    }, density);
    await page.waitForFunction(() => window.__ra2debug.game?.campaign && window.__ra2debug.gameScreen?.playerUi
        && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    const reveal = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('HD:CampaignReveal'));
    await page.getByRole('button', { name: reveal, exact: true }).click();
    await page.evaluate(() => { document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    report.worldBefore = await page.evaluate(() => window.__ra2debug.game.getHash());
    report.initialPlacements = [];
    const placements = await page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
        .filter(o => ['CRUISE', 'TUG'].includes(o.name)).map(o => ({ id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry] })));
    assert.equal(placements.length, 6);
    for (const placement of placements) {
        await page.evaluate(id => { const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.id === id);
            d.worldInteraction.minimapHandler.panToTile(o.tile); }, placement.id);
        await page.waitForTimeout(150);
        const state = await page.evaluate(id => {
            const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.id === id);
            const r = d.renderableManager.getRenderableByGameObject(o), hd = r.unitVxlHd;
            const frames = hd?.layers.flatMap(l => l.frames.filter(f => !!f.batch.parent)) ?? [];
            const distances = frames.flatMap(f => {
                const a = f.source.geometry.attributes.position, p = d.worldScene.camera.position.clone(), result = [];
                for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(f.batch.matrixWorld);
                    for (const plane of f.batch.material.clippingPlanes ?? []) result.push(plane.distanceToPoint(p)); }
                return result;
            });
            return { hdActive: !!hd?.active, displayedFrames: frames.length,
                nativeBatching: r.vxlBuilders.some(b => [...b.sections.values()].some(m => m.isBatchedMesh)),
                minClipDistance: distances.length ? Math.min(...distances) : null };
        }, placement.id);
        if (density !== 1) { assert(state.hdActive && state.displayedFrames > 0);
            if (!baseline) assert(state.minClipDistance > 0, placement.name + '/' + placement.id); }
        const file = `${placement.name.toLowerCase()}-${placement.id}-natural-scene.png`;
        await page.screenshot({ path: path.join(out, file) }); report.screenshots.push(file);
        report.initialPlacements.push({ ...placement, ...state, screenshot: file });
    }
    for (const name of ['CRUISE', 'TUG']) {
        await page.evaluate(name => {
            const d = window.__ra2debug, manager = d.renderableManager;
            const actor = d.game.world.getAllObjects().find(o => o.name === name);
            if (!actor) throw Error('Missing native boat ' + name);
            window.__hullActor = actor;
            manager.renderableFactory.vxlBuilderFactory.useBatching = false;
            manager.removeAndDisposeRenderable(manager.getRenderableByGameObject(actor), actor);
            manager.createRenderable(actor, manager.getRenderableContainer()).onCreate?.(manager);
            d.worldInteraction.minimapHandler.panToTile(actor.tile);
        }, name);
        await page.waitForFunction(density => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__hullActor);
            return r?.vxlBuilders?.length && (density === 1 || r.unitVxlHd?.active);
        }, density, { timeout: 30000 });
        await page.waitForTimeout(100);
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const unit = { name, views: [] };
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const capture = await page.evaluate(({ heading, density }) => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer, v = w.viewport;
                const actor = window.__hullActor, r = d.renderableManager.getRenderableByGameObject(actor);
                const matrices = () => {
                    const policy = w.scene.matrixWorldAutoUpdate;
                    w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = policy; }
                    w.meshBatchManager.updateMeshes();
                };
                r.updateVxlRotation(heading, true); matrices(); r.unitVxlHd?.update(); matrices(); d.renderer.render();
                const native = r.vxlBuilders.flatMap(b => [...b.sections.values()]);
                if (native.some(m => m.isBatchedMesh)) throw Error('Expected independent native boat meshes');
                const ratio = gl.domElement.width / d.renderer.width;
                const pivot = w.camera.position.clone().set(0, 0, 0).applyMatrix4(r.posObj.matrixWorld).project(w.camera);
                const crop = [Math.round((v.x + (pivot.x + 1) * v.width / 2) * ratio - 320),
                    Math.round((v.y + (1 - pivot.y) * v.height / 2) * ratio - 240), 640, 480];
                const canvas = document.createElement('canvas'); canvas.width = crop[2]; canvas.height = crop[3];
                const ctx = canvas.getContext('2d');
                const pixels = () => { ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(gl.domElement, ...crop, 0, 0, canvas.width, canvas.height);
                    return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, png: canvas.toDataURL('image/png') }; };
                const context = pixels();
                const frames = r.unitVxlHd?.layers.flatMap(l => l.frames.filter(f => !!f.batch.parent)) ?? [];
                const keep = new Set();
                for (const mesh of density === 1 ? native : frames.flatMap(f => [f.batch, f.depth, f.translucent]))
                    mesh.traverse(o => { if (o.isMesh) keep.add(o); });
                const visibility = [], materials = new Map();
                w.scene.traverse(o => { if (o.isMesh) { visibility.push([o, o.visible]);
                    if (keep.has(o)) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.set(m, m.clippingPlanes); } });
                const background = w.scene.background, clear = gl.getClearColor(w.ambientLight.color.clone()), alpha = gl.getClearAlpha();
                let clipped, complete;
                const render = () => { matrices(); gl.setViewport(v.x, d.renderer.height - v.y - v.height, v.width, v.height);
                    gl.clear(); gl.render(w.scene, w.camera); return pixels(); };
                try {
                    visibility.forEach(([mesh]) => { if (!keep.has(mesh)) mesh.visible = false; });
                    w.scene.background = null; gl.setClearColor(0x48584e, 1);
                    clipped = render();
                    materials.forEach((planes, material) => { material.clippingPlanes = null; });
                    complete = render();
                } finally {
                    materials.forEach((planes, material) => { material.clippingPlanes = planes; });
                    visibility.forEach(([mesh, visible]) => { mesh.visible = visible; });
                    w.scene.background = background; gl.setClearColor(clear, alpha); d.renderer.render();
                }
                const fg = (bytes, i) => bytes[i] !== complete.data[0] || bytes[i + 1] !== complete.data[1] || bytes[i + 2] !== complete.data[2];
                let fullPixels = 0, clippedPixels = 0, missingPixels = 0, sceneOccludedPixels = 0;
                for (let i = 0; i < complete.data.length; i += 4) {
                    const full = fg(complete.data, i), shown = fg(clipped.data, i);
                    if (full) fullPixels++; if (shown) clippedPixels++;
                    if (full && !shown) missingPixels++;
                    if (full && shown && Math.max(...[0, 1, 2].map(c => Math.abs(context.data[i + c] - clipped.data[i + c]))) > 12)
                        sceneOccludedPixels++;
                }
                const depths = frames.map(f => {
                    const attr = f.source.geometry.attributes.position, p = w.camera.position.clone();
                    const planes = f.batch.material.clippingPlanes ?? [];
                    const worldY = [], distances = [];
                    for (let i = 0; i < attr.count; i++) { p.fromBufferAttribute(attr, i).applyMatrix4(f.batch.matrixWorld);
                        worldY.push(p.y); for (const plane of planes) distances.push(plane.distanceToPoint(p)); }
                    return { heading: f.frame.heading, gpuHd: f.batch.material.map === f.part.override.pages[0].base,
                        planes: planes.map(p => [p.normal.toArray(), p.constant]), minWorldY: Math.min(...worldY),
                        minClipDistance: distances.length ? Math.min(...distances) : null };
                });
                return { heading, crop, ratio, fullPixels, clippedPixels, missingPixels, missingFraction: missingPixels / fullPixels,
                    sceneOccludedPixels, depths, nativeRules: { naval: r.objectRules.naval, underwater: r.objectRules.underwater },
                    worldPosition: actor.position.worldPosition?.toArray?.(), glError: gl.getContext().getError(),
                    images: { context: context.png, clipped: clipped.png, unclipped: complete.png } };
            }, { heading, density });
            assert.equal(capture.glError, 0); assert(capture.fullPixels > 100);
            if (density !== 1) {
                assert(capture.depths.length && capture.depths.every(f => f.gpuHd));
                if (!baseline) assert.equal(capture.missingPixels, 0, `${name}/${heading} waterline clipping`);
            }
            for (const [role, data] of Object.entries(capture.images)) {
                const file = `${name.toLowerCase()}-${heading}-${role}.png`;
                await fs.writeFile(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'));
                capture.images[role] = file;
            }
            unit.views.push(capture);
            if ([0, 45, 315].includes(heading)) {
                const file = `${name.toLowerCase()}-${heading}-scene.png`;
                await page.screenshot({ path: path.join(out, file) }); report.screenshots.push(file);
            }
        }
        report.units.push(unit); await save();
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    report.worldAfter = await page.evaluate(() => window.__ra2debug.game.getHash());
    assert.equal(report.worldAfter, report.worldBefore);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    if (baseline && density !== 1) assert(report.units.every(u => u.views.some(v => v.missingFraction > .1)));
    report.status = baseline ? 'PASS_REPRODUCED_NATIVE_NAVAL_WATERLINE_CLIPPING' : 'PASS_NATIVE_NAVAL_HEADINGS_AND_WATERLINE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error,
    coverage: report.units.map(u => ({ name: u.name, missing: u.views.map(v => v.missingPixels) })) }));
