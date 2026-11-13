import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: true });
const profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const output = out;
const sourcePath = process.argv.find(value => value.startsWith('--source='))?.slice(9) ?? '.artifacts/m3-2/vlad/source.json';
const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'sov02t.map';
const inputs = JSON.parse(await fs.readFile(path.resolve(root, sourcePath)));
const allowedMembers = inputs.sources.filter(source => source.format === 'vxl').flatMap(source =>
    [source.member, ...(source.additionalMembers ?? [])]);
const report = { units: [], status: 'RUNNING', mission, scope: 'Original VXL states in eight posed headings; independent native meshes and ownership controls. Diagnostic authoring references, not gameplay evidence.',
    screenshots: [], errors: [], failedResources: [] };
let app, page;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); }
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.documentElement.lang.includes('-'), undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json')));
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    await page.evaluate(async mission => { const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = false; d.generalOptions.graphics.hdDensity.value = 4;
        await d.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission); }, mission);
    await page.waitForFunction(mission => window.__ra2debug.game?.campaign?.launch.mission === mission && window.__ra2debug.gameScreen?.playerUi, mission, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        d.game.campaign.inspectionModified = true; d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
        document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    await page.waitForTimeout(200);
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
                for (const builder of r.vxlBuilders) builder.setPalette(r.palette.clone().remap({ r: 255, g: 0, b: 0 }));
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
                        layers[key + '-owner-blue'] = render(); builder.setPalette(r.palette.clone().remap({ r: 255, g: 0, b: 0 }));
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
            assert(capture.partMetadata.every(part => allowedMembers.includes(part.source.toLowerCase())
                || target.identity === 'VLAD' && part.source.toLowerCase() === 'vladwo.vxl'), JSON.stringify(capture.partMetadata));
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
    assert.equal(report.units.length, inputs.sources.filter(source => source.format === 'vxl').length);
    report.status = mission === 'sov02t.map' ? 'PASS_NATIVE_VLAD_LOADED_AND_EMPTY_REFERENCES' : 'PASS_NATIVE_ORIGINAL_VXL_AUTHORING_REFERENCES';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, output }));
