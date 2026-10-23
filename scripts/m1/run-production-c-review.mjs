import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runDisplayEdgeReview } from './run-display-edge-review.mjs';
import { installDisplayProbe } from './display-review-probe.mjs';
import { installDisplayEdgeProbe } from './display-edge-probe.mjs';
import { installProductionComparison } from './production-c-probe.mjs';

export async function runProductionCReview(page, output) {
    const comparison = await runDisplayEdgeReview(page, output, true);
    return { ...comparison, ...await runProductionCChecks(page, output) };
}

export async function runProductionCChecks(page, output) {
    await fs.mkdir(output, { recursive: true });
    await page.evaluate(installDisplayProbe);
    const sweep = await page.evaluate(() => {
        const d = window.__ra2debug, loop = d.gameScreen.gameAnimationLoop;
        loop.stop();
        const plant = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
        const infantry = d.renderableManager.getRenderableByGameObject(window.__m11Units[0]).shpRenderable;
        const rows = [], source = [infantry, plant.mainObj, ...[...plant.animObjects.values()].flat()];
        const seen = new Set();
        try {
            for (const model of source) {
                const b = model?.builder;
                if (!b?.hdOverride || seen.has(b.shpFile)) continue;
                seen.add(b.shpFile);
                const frame = b.getFrame(), visible = model.get3DObject().visible;
                const mesh = model.getShapeMesh(); let count = 0;
                try {
                    model.get3DObject().visible = true;
                    for (let f = 0; f < b.frameCount; f++) {
                        const hd = b.hdOverride.frames[f + b.frameOffset];
                        if (!hd) continue;
                        b.setFrame(f);
                        d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                        d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
                        const expected = b.hdOverride.pages[hd.page];
                        if (mesh.material.map !== expected.base || mesh.material.uniforms.remapMap.value !== expected.data)
                            throw Error('Frame sweep selected the wrong HD page');
                        if (d.renderer.renderer.getContext().getError()) throw Error('Frame sweep GL error');
                        count++;
                    }
                } finally { b.setFrame(frame); model.get3DObject().visible = visible; }
                rows.push({ identity: b.hdOverride.identity, frameCount: count });
            }
            // Exercise opacity transitions through the sorted full-coverage path.
            const b = infantry.builder, oldOpacity = b.opacity;
            for (const opacity of [0.5, 0, 1, 0.3, 1]) {
                b.setOpacity(opacity); d.worldScene.meshBatchManager.updateMeshes();
                d.worldScene.meshBatchManager.processRenderQueue(); d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
                if (d.renderer.renderer.getContext().getError()) throw Error('Opacity transition GL error');
            }
            b.setOpacity(oldOpacity);
            d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
            return { status: 'PASS_FRAME_PAGE_SWEEP_AND_OPACITY', rows,
                scope: 'Forced render-frame/page coverage, not natural gameplay certification of every state' };
        } finally { loop.start(); }
    });
    assert(sweep.rows.some(r => r.frameCount === 301), 'Conscript sweep incomplete');
    await fs.writeFile(`${output}/frame-sweep.json`, JSON.stringify(sweep, null, 2) + '\n');
    const presets = await page.evaluate(() => ['native', 'original', '720p', '1080p', '1440p', '4k']
        .map(mode => window.__m14.capture(mode, true)));
    for (const p of presets) {
        assert.equal(p.glError, 0); assert.equal(p.logical[1], 900);
        for (const key of ['camera', 'logical', 'models', 'target', 'viewport']) assert.deepEqual(p[key], presets[0][key]);
        await fs.writeFile(`${output}/production-${p.mode}.png`, Buffer.from(p.png.split(',')[1], 'base64')); delete p.png;
    }
    await fs.writeFile(`${output}/presets.json`, JSON.stringify(presets, null, 2) + '\n');
    const performance = await measureProductionC(page);
    await fs.writeFile(`${output}/performance.json`, JSON.stringify(performance, null, 2) + '\n');
    return { sweep: sweep.status, presets: presets.length, performance: performance.status };
}

async function measureProductionC(page) {
    await page.evaluate(installDisplayEdgeProbe);
    await page.evaluate(installProductionComparison);
    const rows = [];
    try {
        for (const count of [8, 64]) {
            if (count === 64) {
                await page.evaluate(() => {
                    const d = window.__ra2debug, plant = window.__m12Plant, rule = d.game.rules.getObject('E2', 3);
                    const units = [...window.__m11Units];
                    for (let dx = -10; dx <= 10 && units.length < 64; dx++) {
                        for (let dy = -10; dy <= 10 && units.length < 64; dy++) {
                            const tile = d.game.map.tiles.getByMapCoords(plant.tile.rx + dx, plant.tile.ry + dy);
                            if (!tile || d.game.map.tileOccupation.getObjectsOnTile(tile).length
                                || d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) <= 0) continue;
                            const unit = d.game.createUnitForPlayer(rule, d.localPlayer);
                            d.game.spawnObject(unit, tile); units.push(unit);
                        }
                    }
                    if (units.length !== 64) throw Error('Cannot create 64-unit bounded load');
                    window.__m14LoadUnits = units;
                });
                await page.waitForTimeout(1000);
            }
            for (const resolution of ['1080p', '4k']) {
                const samples = await page.evaluate(({ count, resolution }) => {
                    const d = window.__ra2debug, renderer = d.renderer.renderer, gl = renderer.getContext();
                    d.gameScreen.gameAnimationLoop.stop();
                    d.generalOptions.graphics.renderResolution.value = resolution;
                    const result = [];
                    try {
                        // Balanced order; warm each path before measuring. Includes CPU,
                        // submission and gl.finish, not isolated GPU timing or simulation.
                        for (const mode of ['A', 'B', 'C', 'C', 'B', 'A']) {
                            window.__m14Edge.setMode(mode);
                            const times = [], updates = [];
                            for (let i = 0; i < 36; i++) {
                                const start = performance.now();
                                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                                d.worldScene.scene.updateMatrixWorld(true);
                                const updated = performance.now(); d.renderer.render(); gl.finish();
                                if (i >= 12) { times.push(performance.now() - start); updates.push(updated - start); }
                            }
                            const edges = [];
                            d.worldScene.meshBatchManager.get3DObject().traverseVisible(o => {
                                if (o.name === 'hd-sprite-edge') edges.push(o);
                            });
                            result.push({ mode, count, resolution, times, updates, edgeViews: edges.length,
                                sharedEdgeBuffers: edges.every(o => o.geometry.attributes.position === o.parent.geometry.attributes.position),
                                memory: { ...renderer.info.memory }, glError: gl.getError() });
                        }
                    } finally { window.__m14Edge.setMode('C'); d.gameScreen.gameAnimationLoop.start(); }
                    return result;
                }, { count, resolution });
                samples.forEach(s => { assert.equal(s.glError, 0); assert(s.sharedEdgeBuffers); });
                rows.push(...samples);
            }
        }
    } finally { await page.evaluate(() => window.__m14Edge?.dispose()); }
    const summaries = [];
    for (const count of [8, 64]) for (const resolution of ['1080p', '4k']) for (const mode of ['A', 'B', 'C']) {
        const samples = rows.filter(r => r.count === count && r.resolution === resolution && r.mode === mode);
        const times = samples.flatMap(s => s.times).sort((a, b) => a - b);
        summaries.push({ count, resolution, mode, n: times.length, medianMs: times[Math.floor(times.length / 2)],
            p95Ms: times[Math.floor(times.length * 0.95)], edgeViews: samples[0].edgeViews });
    }
    return { status: 'PASS_BOUNDED_LOAD_NO_GL_ERRORS', scope: '8/64 stationary fixture infantry; warmed batch update plus render and finish; no sustained battle or GPU-only timing claim', summaries, rows };
}
