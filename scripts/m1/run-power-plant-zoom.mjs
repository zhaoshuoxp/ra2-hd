import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Explicit camera diagnostic: no shader, pack, model geometry or default changes.
export async function runPowerPlantZoom(page, output) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', cases: [] };
    const identity = { checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sources: {} };
    for (const name of ['run-power-plant-game.mjs', 'run-power-plant-zoom.mjs']) {
        const bytes = await fs.readFile(`scripts/m1/${name}`);
        identity.sources[name] = createHash('sha256').update(bytes).digest('hex');
        await fs.writeFile(`${output}/source-${name}`, bytes);
    }
    await fs.writeFile(`${output}/source-identity.json`, JSON.stringify(identity, null, 2) + '\n');
    try {
        await page.evaluate(() => {
            window.__ra2debug.unitSelection.deselectAll();
            window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k';
        });
        report.cases = await page.evaluate(async () => {
            const d = window.__ra2debug, renderer = d.renderer.renderer;
            const camera = d.worldScene.camera, gl = renderer.getContext();
            const plant = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
            const active = () => [...plant.animObjects.values()].flat().find(m =>
                m.get3DObject()?.visible && m.builder.frameOffset === 3);
            while (active()?.builder.getFrame() !== 2) await new Promise(requestAnimationFrame);
            const savedZoom = camera.zoom;
            if (savedZoom !== 1) throw Error('Expected the accepted 1x camera');
            const canvas = renderer.domElement, cases = [];
            function geometry(model) {
                const mesh = model.getShapeMesh(), builder = model.builder;
                const frame = builder.hdOverride.frames[builder.getFrame() + builder.frameOffset];
                const points = [];
                for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                    const p = camera.position.clone().fromBufferAttribute(mesh.geometry.attributes.position, i)
                        .applyMatrix4(mesh.matrixWorld).project(camera);
                    const v = d.worldScene.viewport;
                    points.push([v.x + (p.x + 1) * v.width / 2, v.y + (1 - p.y) * v.height / 2]);
                }
                const bounds = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
                return { frame: builder.getFrame(), sampleRect: frame.sampleRect, identity: builder.hdOverride.identity,
                    vertices: Array.from(mesh.geometry.attributes.position.array), uv: Array.from(mesh.geometry.attributes.uv.array),
                    bounds, outputSize: [(bounds[2] - bounds[0]) * 2, (bounds[3] - bounds[1]) * 2],
                    material: mesh.material.type, textureSize: [mesh.material.map.image.width, mesh.material.map.image.height] };
            }
            function capture(label, zoom) {
                camera.zoom = zoom; camera.updateProjectionMatrix();
                const draws = [], originals = new Map(), originalRender = renderer.render;
                let inWorld = false;
                renderer.render = function(scene, ...args) {
                    inWorld = scene === d.worldScene.scene;
                    try { return originalRender.call(this, scene, ...args); }
                    finally { inWorld = false; }
                };
                for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
                    originals.set(name, gl[name]);
                    gl[name] = function(...args) {
                        if (inWorld) draws.push({ method: name, viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
                            defaultFramebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) === null,
                            drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] });
                        return originals.get(name).apply(this, args);
                    };
                }
                try { d.renderer.render(); }
                finally {
                    renderer.render = originalRender;
                    for (const [name, fn] of originals) gl[name] = fn;
                }
                const body = geometry(plant.mainObj), activity = geometry(active());
                const center = [(body.bounds[0] + body.bounds[2]) / 2, (body.bounds[1] + body.bounds[3]) / 2];
                const cropRect = [Math.round(center[0]) - 320, Math.round(center[1]) - 360, 640, 520];
                const crop = document.createElement('canvas'); crop.width = 1280; crop.height = 1040;
                crop.getContext('2d').drawImage(canvas, cropRect[0] * 2, cropRect[1] * 2, 1280, 1040, 0, 0, 1280, 1040);
                return { label, zoom, tick: d.game.currentTick, body, active: activity,
                    conscripts: window.__m11Units.map(u => ({ id: u.id,
                        ...geometry(d.renderableManager.getRenderableByGameObject(u).shpRenderable) })),
                    buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], canvasSize: [canvas.width, canvas.height],
                    canvasCss: [canvas.style.width, canvas.style.height], devicePixelRatio, visualScale: visualViewport.scale,
                    camera: { position: camera.position.toArray(), bounds: [camera.left, camera.right, camera.top, camera.bottom],
                        projection: camera.projectionMatrix.toArray() }, worldViewport: { ...d.worldScene.viewport },
                    cropRect, draws, glError: gl.getError(), png: crop.toDataURL('image/png'), full: canvas.toDataURL('image/png') };
            }
            try {
                cases.push(capture('normal', 1), capture('zoom2', 2), capture('restored', 1));
                return cases;
            } finally {
                camera.zoom = savedZoom; camera.updateProjectionMatrix(); d.renderer.render();
            }
        });
        const [a, b, restored] = report.cases;
        assert.equal(a.png, restored.png, 'Baseline crop must restore exactly');
        assert.equal(a.full, restored.full, 'Full baseline must restore exactly');
        for (const c of report.cases) {
            assert.deepEqual(c.buffer, [3840, 2160]);
            assert.deepEqual(c.canvasCss, ['1920px', '1080px']);
            assert.equal(c.tick, a.tick); assert.equal(c.glError, 0);
            assert.deepEqual(c.camera.position, a.camera.position); assert.deepEqual(c.camera.bounds, a.camera.bounds);
            assert(c.draws.length > 0, 'No world GL draws observed');
            assert(c.draws.every(draw => draw.defaultFramebuffer && draw.viewport.join(',') === '0,64,3504,2096'
                && draw.drawingBuffer.join(',') === '3840,2160'), 'Unexpected world framebuffer or viewport');
            assert(c.cropRect[0] >= 0 && c.cropRect[1] >= 0
                && c.cropRect[0] + 640 <= 1752 && c.cropRect[1] + 520 <= 1048, 'Crop outside world viewport');
            for (const key of ['body', 'active']) {
                for (const property of ['frame', 'sampleRect', 'identity', 'vertices', 'uv', 'material', 'textureSize'])
                    assert.deepEqual(c[key][property], a[key][property]);
                c[key].outputSize.forEach((size, i) => assert(Math.abs(size - a[key].outputSize[i] * c.zoom) < 0.01));
            }
        }
        assert.equal(b.zoom, 2);
        report.status = 'PASS_SAME_TICK_NATIVE_4K_CAMERA_COMPARISON';
    } finally {
        for (const c of report.cases) for (const key of ['png', 'full']) {
            const bytes = Buffer.from(c[key].split(',')[1], 'base64');
            const file = `${c.label}-${key === 'png' ? 'crop' : 'full'}.png`;
            await fs.writeFile(`${output}/${file}`, bytes);
            c[`${key}File`] = file; c[`${key}Sha256`] = createHash('sha256').update(bytes).digest('hex');
            delete c[key];
        }
        await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    }
    return { status: report.status, output };
}
