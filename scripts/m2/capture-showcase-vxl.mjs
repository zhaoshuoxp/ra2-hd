// Posed Original references in the copied baseline; not native action acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const sourceFile = process.argv.find(arg => arg.startsWith('--prepared-source='))?.slice(18)
    ?? '.artifacts/m2-2/prepared-native-v2/source.json';
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const inputs = JSON.parse(await fs.readFile(sourceFile));
const targets = inputs.sources.filter(source => source.format === 'vxl').map(source =>
    ({ identity: source.bindings[0].id, member: source.member, sha256: source.sha256 }));
const { page, report, close } = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
let failure;
try {
    report.disclosure = 'Posed complete native headings and blue-owner controls, from the pinned isolated application. No authored pixels or movement/action acceptance.';
    report.preparedSource = sourceFile;
    report.units = [];
    for (const target of targets) {
        await page.evaluate(identity => {
            const d = window.__ra2debug, f = window.__allied;
            d.gameScreen.gameAnimationLoop.start();
            if (window.__neutralReference) d.game.destroyObject(window.__neutralReference, undefined, true);
            window.__neutralReference = f.spawn(identity, 7, { rx: f.center.rx + 6, ry: f.center.ry + 5 });
            d.worldInteraction.minimapHandler.panToTile(window.__neutralReference.tile);
        }, target.identity);
        await page.waitForFunction(() => window.__ra2debug.renderableManager
            .getRenderableByGameObject(window.__neutralReference)?.vxlBuilders?.length > 0);
        await page.evaluate(() => { window.__ra2debug.gameScreen.gameAnimationLoop.stop(); });
        const unit = { name: target.identity, source: target, views: [] };
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const capture = await page.evaluate(heading => {
                const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer, v = w.viewport;
                const actor = window.__neutralReference, r = d.renderableManager.getRenderableByGameObject(actor);
                r.updateVxlRotation(heading, true);
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
                const crop = [Math.round((bounds[0] + bounds[2]) / 2 - 180),
                    Math.round((bounds[1] + bounds[3]) / 2 - 150), 360, 300];
                const png = () => {
                    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 300;
                    canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 360, 300);
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
            assert.equal(capture.matrixPolicy, false);
            assert.equal(capture.glError, 0);
            assert(capture.partMetadata.every(part => part.source === target.member));
            for (const [role, data] of Object.entries(capture.layers)) {
                const file = `${target.identity}-${heading}-${role}.png`;
                await fs.writeFile(path.join(output, file), Buffer.from(data.split(',')[1], 'base64'));
                capture.layers[role] = file;
            }
            unit.views.push(capture);
        }
        report.units.push(unit);
        console.log('Captured native headings:', target.identity);
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
