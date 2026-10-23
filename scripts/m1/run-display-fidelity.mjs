import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';

// Isolated review only: pin representative frames, retain production materials,
// and hide HD layers for matched background/occlusion controls. No asset writes.
export async function runDisplayFidelity(page, output) {
    await fs.mkdir(output, { recursive: false });
    await page.evaluate(installDisplayProbe);
    await page.evaluate(() => {
        window.__ra2debug.unitSelection.deselectAll();
        window.__ra2debug.gameScreen.pointer.unlock();
    });
    // Let normal updates clear selection overlays before freezing the scene.
    await page.waitForTimeout(150);
    const report = await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        const plant = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
        const body = plant.mainObj;
        const active = [...plant.animObjects.values()].flat().find(m => m.get3DObject()?.visible && m.builder?.hdOverride);
        const cons = d.renderableManager.getRenderableByGameObject(window.__m11Units[0]).shpRenderable;
        if (!active) throw Error('Missing visible GAPOWR activity layer');
        const tracked = [body, active, cons], oldFrames = tracked.map(m => m.builder.getFrame());
        function flush() {
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true);
        }
        function snap() { flush(); return window.__m14.capture('4k', true); }
        function meshes(model) {
            const items = [];
            model.get3DObject().traverse(m => { if (m.material?.type === 'HdSpriteMaterial') items.push(m); });
            return items;
        }
        function hide(models, callback) {
            const saved = models.flatMap(meshes).map(mesh => [mesh, mesh.visible]);
            try { for (const [mesh] of saved) mesh.visible = false; return callback(); }
            finally { for (const [mesh, visible] of saved) mesh.visible = visible; flush(); }
        }
        function describe(model, member) {
            const mesh = model.getShapeMesh(), b = model.builder, material = mesh.material;
            const viewport = d.worldScene.viewport;
            const manager = d.worldScene.meshBatchManager;
            if (mesh.batchMode !== 1) throw Error('Fidelity projection expects the production merged sprite batch');
            const key = manager.getBatchKey(mesh);
            const siblings = manager.collectMeshes(manager.renderableContainer.get3DObject())
                .filter(m => manager.getBatchKey(m) === key);
            const index = siblings.indexOf(mesh);
            if (index < 0) throw Error('Target missing from actual draw batch');
            const batch = manager.batches.get(key)[Math.floor(index / 128)].mergedGeoMesh;
            const firstVertex = (index % 128) * batch.verticesPerItem;
            const renderVertices = Array.from({ length: batch.verticesPerItem }, (_, i) => {
                const p = d.worldScene.camera.position.clone().fromBufferAttribute(batch.geometry.attributes.position, firstVertex + i)
                    .applyMatrix4(batch.matrixWorld).project(d.worldScene.camera);
                return [viewport.x + (p.x + 1) * viewport.width / 2, viewport.y + (1 - p.y) * viewport.height / 2,
                    batch.geometry.attributes.uv.getX(firstVertex + i), batch.geometry.attributes.uv.getY(firstVertex + i)];
            });
            const vertices = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => {
                const p = d.worldScene.camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                    .applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                return [viewport.x + (p.x + 1) * viewport.width / 2, viewport.y + (1 - p.y) * viewport.height / 2,
                    mesh.geometry.attributes.uv.getX(i), mesh.geometry.attributes.uv.getY(i)];
            });
            const palette = material.palette.image;
            return { member, frame: b.getFrame(), offset: b.frameOffset, identity: b.hdOverride.identity,
                vertices, renderVertices, batchMatrix: batch.matrixWorld.toArray(),
                hdMeshCount: meshes(model).length, shadowRetained: !!model.getShadowMesh(),
                material: { type: material.type, alphaTest: material.alphaTest, opacity: material.opacity,
                    transparent: material.transparent, mapColorSpace: material.map.colorSpace,
                    minFilter: material.map.minFilter, magFilter: material.map.magFilter,
                    generateMipmaps: material.map.generateMipmaps, flipY: material.map.flipY,
                    mapSize: [material.map.image.width, material.map.image.height],
                    meshLight: mesh.getExtraLight?.().toArray(), meshOpacity: mesh.getOpacity?.(),
                    uniformLight: material.extraLight.toArray(), paletteRow: mesh.getPaletteIndex?.() ?? material.paletteOffset,
                    paletteSize: [palette.width, palette.height], paletteColorSpace: material.palette.colorSpace,
                    palette: Array.from(palette.getContext('2d').getImageData(0, 0, palette.width, palette.height).data) } };
        }
        const before = snap(), samples = [];
        try {
            body.setFrame(0); active.setFrame(2);
            for (const frame of [0, 8, 164]) {
                cons.setFrame(frame);
                const full = snap(), layer = describe(cons, 'cons.shp');
                const background = hide([cons], snap);
                samples.push({ name: `conscript-${frame}`, layers: [layer], full, background });
                if (snap().png !== full.png) throw Error('Conscript visibility restoration changed pixels');
            }
            cons.setFrame(oldFrames[2]);
            const full = snap(), layers = [describe(body, 'ggpowr.shp'), describe(active, 'ggpowr_a.shp')];
            const background = hide([body, active], snap);
            const bodyOnly = hide([active], snap), activeOnly = hide([body], snap);
            samples.push({ name: 'gapowr-0-2', layers, full, background, bodyOnly, activeOnly });
            if (snap().png !== full.png) throw Error('GAPOWR visibility restoration changed pixels');
        } finally {
            tracked.forEach((m, i) => m.setFrame(oldFrames[i]));
            const restored = snap();
            if (restored.png !== before.png) throw Error('Fidelity probe failed exact frame/visibility restoration');
            d.gameScreen.gameAnimationLoop.start();
        }
        return { status: 'PASS_CAPTURE_AND_EXACT_RESTORATION', samples,
            note: 'Frozen production game renderer; frame pins are pose controls, not action/gameplay evidence. Materials, palette, lighting, geometry and camera are unchanged. Hidden HD layers retain original shadows.' };
    });
    for (const sample of report.samples) for (const key of ['full', 'background', 'bodyOnly', 'activeOnly']) {
        const capture = sample[key];
        if (!capture) continue;
        assert.deepEqual(capture.buffer, [3840, 2160]);
        assert.deepEqual(capture.logical, [1600, 900]);
        assert.equal(capture.tick, sample.full.tick);
        assert.equal(capture.glError, 0);
        assert.deepEqual(capture.camera, sample.full.camera);
        const file = `${sample.name}-${key}.png`;
        await fs.writeFile(`${output}/${file}`, Buffer.from(capture.png.split(',')[1], 'base64'));
        delete capture.png; capture.file = file;
    }
    await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    return { status: report.status, report: `${output}/result.json`, frames: report.samples.map(s => s.name) };
}
