// Original native part/headings for M2-style authored resources; no gameplay acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const output = path.join(base, process.argv[3] ?? 'original-reference-v2'); await fs.mkdir(output, { recursive: false });
await fs.copyFile(import.meta.filename, path.join(output, 'harness.mjs'));
const receipt = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/feedback-r6/extracted.json')));
const inputs = JSON.parse(await fs.readFile(path.join(base, 'source/source.json')));
const report = { status: 'RUNNING', sourceHead: '580c985417a218e0d53f5c71579ac404d2ae7889', errors: [], failedResources: [], units: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    disclosure: 'Accepted R6 Original mode. Paused diagnostic reveal and posed eight native headings. Mesh instancing is disabled only for isolated original part capture; native VXL/HVA geometry, palette/VPL lighting and pivots are retained. No ordinary gameplay or authored-art acceptance.' };
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const windowHandle = await app.browserWindow(page);
    await windowHandle.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
    await page.evaluate(() => { const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = false;
        d.mainMenuController.screens.get(22).launchDiagnostic(); });
    await page.waitForFunction(() => window.__ra2debug.game?.campaign && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    const reveal = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('HD:CampaignReveal'));
    await page.getByRole('button', { name: reveal, exact: true }).click();
    await page.evaluate(() => { document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    report.resolvedSourceArt = await page.evaluate(() => {
        const d = window.__ra2debug; return ['CAWA2A', 'CAWA2B', 'BRIDGEB1'].map(name => {
            const type = name === 'BRIDGEB1' ? 4 : 2, art = d.game.art.getObject(name, type);
            return { name, hasShadow: art.hasShadow, remapable: art.remapable, paletteType: art.paletteType, image: art.imageName };
        });
    });
    for (const target of inputs.sources.filter(source => source.format === 'vxl').map(source => ({ identity: source.identity, member: source.member, sha256: source.sha256 }))) {
        if (target.identity === 'PDPLANE') for (let attempt = 0; attempt < 24; attempt++) {
            if (await page.evaluate(() => window.__ra2debug.game.world.getAllObjects().some(o => o.name === 'PDPLANE'))) break;
            await page.evaluate(() => { const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr; manager.setCampaignPaused(false);
                try { for (let i = 0; i < 30; i++) manager.doGameTurn(performance.now()); } finally { manager.setCampaignPaused(true); } });
        }
        await page.evaluate(identity => { const d = window.__ra2debug;
            window.__neutralReference = d.game.world.getAllObjects().find(o => o.name === identity);
            if (!window.__neutralReference) throw Error('Missing native source object ' + identity);
            const manager = d.renderableManager, object = window.__neutralReference;
            manager.renderableFactory.vxlBuilderFactory.useBatching = false;
            manager.removeAndDisposeRenderable(manager.getRenderableByGameObject(object), object);
            const renderable = manager.createRenderable(object, manager.getRenderableContainer());
            renderable.onCreate?.(manager);
            d.worldInteraction.minimapHandler.panToTile(window.__neutralReference.tile);
        }, target.identity);
        await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__neutralReference)?.vxlBuilders?.length > 0, undefined, { timeout: 20000 });
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const unit = { name: target.identity, source: target, views: [] };
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const capture = await page.evaluate(heading => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer, v = w.viewport;
                const actor = window.__neutralReference, r = d.renderableManager.getRenderableByGameObject(actor);
                if (actor.type === 1) { r.tiltObj.rotation.y = heading * Math.PI / 180; r.tiltObj.updateMatrix(); }
                else r.updateVxlRotation(heading, true);
                const matrices = () => {
                    const policy = w.scene.matrixWorldAutoUpdate;
                    w.scene.matrixWorldAutoUpdate = true;
                    try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = policy; }
                    w.meshBatchManager.updateMeshes();
                };
                matrices(); d.renderer.render();
                const ratio = gl.domElement.width / d.renderer.width;
                const meshes = r.vxlBuilders.flatMap(builder => [...builder.sections.values()]);
                if (meshes.some(mesh => mesh.isBatchedMesh)) throw Error('Reference extraction requires independent native meshes');
                const points = [];
                for (const mesh of meshes) for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
                    const p = w.camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, index)
                        .applyMatrix4(mesh.matrixWorld).project(w.camera);
                    points.push([(v.x + (p.x + 1) * v.width / 2) * ratio,
                        (v.y + (1 - p.y) * v.height / 2) * ratio]);
                }
                const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
                if (!bounds.every(Number.isFinite)) throw Error('Invalid native projection');
                const crop = [Math.round((bounds[0] + bounds[2]) / 2 - 256),
                    Math.round((bounds[1] + bounds[3]) / 2 - 192), 512, 384];
                const png = () => {
                    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
                    canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 512, 384);
                    return canvas.toDataURL('image/png');
                };
                const screenPivot = object => {
                    const p = w.camera.position.clone().set(0, 0, 0).applyMatrix4(object.matrixWorld).project(w.camera);
                    return [(v.x + (p.x + 1) * v.width / 2) * ratio - crop[0],
                        (v.y + (1 - p.y) * v.height / 2) * ratio - crop[1]];
                };
                const pivot = screenPivot(r.posObj), saved = [];
                w.scene.traverse(object => { if (object.isMesh) saved.push([object, object.visible]); });
                const transforms = [];
                r.posObj.traverse(object => transforms.push([object, object.visible]));
                const background = w.scene.background, clear = gl.getClearColor(w.ambientLight.color.clone()), alpha = gl.getClearAlpha();
                const layers = { context: png() }, partMetadata = [];
                const render = () => {
                    matrices();
                    gl.setViewport(v.x, d.renderer.height - v.y - v.height, v.width, v.height);
                    gl.clear(); gl.render(w.scene, w.camera);
                    return png();
                };
                try {
                    saved.forEach(([mesh]) => { if (!meshes.includes(mesh)) mesh.visible = false; });
                    w.scene.background = null; gl.setClearColor(0x48584e, 1);
                    layers.complete = render();
                    for (const builder of r.vxlBuilders) for (const [section, mesh] of builder.sections) {
                        transforms.forEach(([object]) => { if (!object.isMesh) object.visible = true; });
                        meshes.forEach(object => { object.visible = object === mesh; });
                        const key = `${builder.vxlFile.filename.replace('.vxl', '')}-${section}`;
                        layers[key] = render();
                        builder.setPalette(r.palette.clone().remap({ r: 0, g: 0, b: 255 }));
                        layers[key + '-owner-blue'] = render(); builder.setPalette(r.palette);
                        partMetadata.push({ key, source: builder.vxlFile.filename, section, pivot: screenPivot(mesh),
                            matrixWorld: mesh.matrixWorld.toArray(), matrix: mesh.matrix.toArray(),
                            parentWorld: mesh.parent.matrixWorld.toArray(), geometryVertices: mesh.geometry.attributes.position.count });
                    }
                } finally {
                    transforms.forEach(([object, visible]) => { object.visible = visible; });
                    saved.forEach(([object, visible]) => { object.visible = visible; });
                    w.scene.background = background; gl.setClearColor(clear, alpha); d.renderer.render();
                }
                return { heading, pivot, crop, bounds, partMetadata, layers, ratio,
                    buffer: [gl.domElement.width, gl.domElement.height], logical: [d.renderer.width, d.renderer.height],
                    projection: w.camera.projectionMatrix.toArray(), zoom: w.camera.zoom,
                    matrixPolicy: w.scene.matrixWorldAutoUpdate, glError: gl.getContext().getError() };
            }, heading);
            assert.equal(capture.glError, 0); assert.equal(capture.matrixPolicy, false);
            assert(capture.partMetadata.every(part => part.source === target.member));
            assert(capture.bounds[2] - capture.bounds[0] < 508 && capture.bounds[3] - capture.bounds[1] < 380);
            for (const [role, data] of Object.entries(capture.layers)) {
                const file = `${target.identity}-${heading}-${role}.png`;
                await fs.writeFile(path.join(output, file), Buffer.from(data.split(',')[1], 'base64')); capture.layers[role] = file;
            }
            unit.views.push(capture);
        }
        report.units.push(unit); await save();
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.equal(report.units.length, 3); report.status = 'PASS_SELECTED_NATIVE_CASES';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, units: report.units.length, error: report.error, output }));
