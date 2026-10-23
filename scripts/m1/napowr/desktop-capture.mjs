// Supplementary render-only comparisons of a naturally built, normally loaded plant.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function capture(page, output, report) {
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        d.gameScreen.pointer.unlock();
        const plant = d.localPlayer.getOwnedObjects().find(o => o.name === 'NAPOWR');
        window.__napowr = d.renderableManager.getRenderableByGameObject(plant);
        window.__napowrPlant = plant;
        window.__napowrSaved = [window.__napowr.mainObj, ...[...window.__napowr.animObjects.values()].flat()].map(m => ({ m, visible: m.get3DObject().visible, frame: m.builder.getFrame() }));
        window.__captureNapowr = ({ body = 0, active = 0, buildup, mode = '4k', hide = false }) => {
            const r = window.__napowr, bodyModel = r.mainObj;
            d.generalOptions.graphics.renderResolution.value = mode;
            for (const models of r.animObjects.values())
                for (const model of models)
                    model.get3DObject().visible = false;
            bodyModel.get3DObject().visible = !hide && buildup === undefined;
            bodyModel.setFrame(body);
            const activeModel = [...r.animObjects].find(([k]) => k === 2)?.[1][0];
            if (activeModel) {
                activeModel.get3DObject().visible = !hide && buildup === undefined;
                activeModel.setFrame(active);
            }
            if (buildup !== undefined) {
                const m = r.animObjects.get(5)[0];
                m.get3DObject().visible = !hide;
                m.setFrame(buildup);
            }
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const renderer = d.renderer.renderer, canvas = renderer.domElement, gl = renderer.getContext();
            const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
            gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const c = document.createElement('canvas');
            c.width = gl.drawingBufferWidth;
            c.height = gl.drawingBufferHeight;
            const ctx = c.getContext('2d');
            const im = ctx.createImageData(c.width, c.height);
            for (let y = 0; y < c.height; y++)
                im.data.set(pixels.subarray((c.height - 1 - y) * c.width * 4, (c.height - y) * c.width * 4), y * c.width * 4);
            ctx.putImageData(im, 0, 0);
            const mesh = bodyModel.getShapeMesh(), p = mesh.geometry.attributes.position, v = d.worldScene.viewport, points = [];
            for (let i = 0; i < p.count; i++) {
                const q = d.worldScene.camera.position.clone().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                points.push([v.x + (q.x + 1) * v.width / 2, v.y + (1 - q.y) * v.height / 2]);
            }
            return { animationSpeed: r.gameSpeed.value, activeRate: r.animations.get(r.animObjects.get(2)[0]).props.rate, buildupRate: r.animations.get(r.animObjects.get(5)[0]).props.rate, png: c.toDataURL(), tick: d.game.currentTick, mode, css: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height], buffer: [c.width, c.height], dpr: devicePixelRatio, ratio: renderer.getPixelRatio(), logical: [d.renderer.width, d.renderer.height], camera: d.worldScene.camera.projectionMatrix.toArray(), points, glError: gl.getError(), models: [['body', bodyModel], ...[...r.animObjects].flatMap(([type, ms]) => ms.map(m => [type, m]))].map(([type, m]) => ({ type, frame: m.builder.getFrame(), offset: m.builder.frameOffset, visible: m.get3DObject().visible, size: m.builder.shpFile.filename, vertices: Array.from(m.getShapeMesh().geometry.attributes.position.array) })) };
        };
    });
    report.samples = [];
    await page.evaluate(() => {
        const r = window.__napowr;
        window.__napowrBindings = [r.mainObj, ...[...r.animObjects.values()].flat()].flatMap(m => [m.builder, m.zShapeFixBuilder].filter(Boolean).map(b => ({ b, override: b.hdOverride })));
        window.__setNapowrReviewHd = hd => {
            // Transition through retained indexed frames BEFORE changing the
            // override: setFrame compares old/new pages under the current binding.
            // Update builders alone: these aggregate slots are valid indexed
            // tails, but advancing parent renderables would offset shadows twice.
            for (const [model, frame] of [[r.mainObj, 105], [r.animObjects.get(2)[0], 38], [r.animObjects.get(5)[0], 26]])
                for (const builder of [model.builder, model.zShapeFixBuilder].filter(Boolean))
                    builder.setFrame(frame);
            for (const {b,override} of window.__napowrBindings) b.hdOverride=hd?override:undefined;
        };
    });
    for (const mode of ['1080p', '4k'])
        for (const [name, state] of [
            ['normal', { body: 0, active: 0 }], ['active09', { body: 0, active: 9 }], ['damaged', { body: 1, active: 19 }], ['buildup12', { buildup: 12 }]
        ])
            for (const hd of [true, false]) {
                await page.evaluate(hd => window.__setNapowrReviewHd(hd), hd);
                const sample = await page.evaluate(s => window.__captureNapowr(s), { ...state, mode });
                const filename = `${name}-${mode}-${hd ? 'hd' : 'original'}.png`;
                await fs.writeFile(`${output}/${filename}`, Buffer.from(sample.png.split(',')[1], 'base64'));
                delete sample.png;
                sample.materials=await page.evaluate(()=>{const r=window.__napowr;return [r.mainObj,r.animObjects.get(2)[0],r.animObjects.get(5)[0]].filter(m=>m.get3DObject().visible).map(m=>({type:m.getShapeMesh().material.type,override:!!m.builder.hdOverride}));});
                assert(sample.materials.length>0);
                assert(sample.materials.every(m=>hd ? m.type==='HdSpriteMaterial'&&m.override : m.type!=='HdSpriteMaterial'&&!m.override));
                report.samples.push({ ...sample, name, hd, filename });
                assert.equal(sample.glError, 0);
            }
    await page.evaluate(() => window.__setNapowrReviewHd(true));
    for (let phase = 0; phase < 18; phase++) {
        const s = await page.evaluate(active => window.__captureNapowr({ active, mode: '1080p' }), phase);
        await fs.writeFile(`${output}/active-${phase}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
    }
    for (let frame = 0; frame < 26; frame++) {
        const s = await page.evaluate(buildup => window.__captureNapowr({ buildup, mode: '1080p' }), frame);
        await fs.writeFile(`${output}/construction-${frame}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
    }
    for (const [name, color] of [['blue', { r: 32, g: 80, b: 255 }], ['yellow', { r: 255, g: 235, b: 32 }]]) {
        await page.evaluate(color => { const r = window.__napowr, p = [...r.paletteRemaps].sort((a, b) => { const dist = p => ['r', 'g', 'b'].reduce((n, k) => n + (p.colors[16][k] - color[k]) ** 2, 0); return dist(a) - dist(b); })[0]; r.mainObj.setPalette(p); for (const models of r.animObjects.values())
            for (const m of models)
                m.setPalette(p); }, color);
        const s = await page.evaluate(() => window.__captureNapowr({ mode: '4k' }));
        await fs.writeFile(`${output}/owner-${name}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
    }
    await page.evaluate(() => { const r = window.__napowr; r.mainObj.setPalette(r.palette); for (const models of r.animObjects.values())
        for (const m of models)
            m.setPalette(r.palette); });
    for (const sample of report.samples.filter(s => s.hd)) {
        const original = report.samples.find(s => s.name === sample.name && s.mode === sample.mode && !s.hd);
        for (const key of ['tick', 'logical', 'camera', 'points', 'models'])
            assert.deepEqual(sample[key], original[key]);
    }
    await page.evaluate(() => {
        for (const { m, visible, frame } of window.__napowrSaved) {
            m.setFrame(frame);
            m.get3DObject().visible = visible;
        }
        window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
        window.__ra2debug.gameScreen.gameAnimationLoop.start();
    });
}
