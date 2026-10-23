import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { installDisplayProbe } from './display-review-probe.mjs';

export async function runRhinoSprite(page, output) {
    await fs.mkdir(output, { recursive: false });
    const result = { status: 'FAIL', rows: [] };
    try {
        await page.addScriptTag({ url: '/rhino-proof/adapter.js' });
        result.synthetic = await page.evaluate(() => window.__m13cModule.syntheticProof());
        await page.evaluate(installDisplayProbe);
        result.fixture = await page.evaluate(() => {
            const d = window.__ra2debug, plant = window.__m12Plant;
            const rule = d.game.rules.getObject('HTNK', 7), created = [];
            for (let dx = 3; dx <= 7 && created.length < 2; dx++) for (let dy = -3; dy <= 4 && created.length < 2; dy++) {
                const tile = d.game.map.tiles.getByMapCoords(plant.tile.rx + dx, plant.tile.ry + dy);
                if (!tile || d.game.map.tileOccupation.getObjectsOnTile(tile).length
                    || d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) <= 0) continue;
                const north = d.game.map.tiles.getByMapCoords(tile.rx, tile.ry - 1);
                if (!created.length && (!north || d.game.map.tileOccupation.getObjectsOnTile(north).length
                    || d.game.map.terrain.getPassableSpeed(north, rule.speedType, true, false) <= 0)) continue;
                const unit = d.game.createUnitForPlayer(rule, d.localPlayer); d.game.spawnObject(unit, tile); created.push(unit);
            }
            if (created.length !== 2) throw Error('Cannot place two Rhino fixtures');
            window.__m13cUnits = created;
            d.unitSelection.deselectAll();
            return created.map(u => ({ id: u.id, tile: [u.tile.rx, u.tile.ry], owner: u.owner.color }));
        });
        await page.waitForTimeout(600);
        result.install = await page.evaluate(async () => {
            const d = window.__ra2debug, m = window.__m13cModule;
            d.gameScreen.gameAnimationLoop.stop();
            const resource = await m.ArtworkResource.load('/rhino-proof/art.png');
            const proofs = window.__m13cUnits.map(u => {
                // Explicit frozen-pose fixture setup, never imposed on ordinary updates/aiming.
                u.direction = 0; u.turretTrait.facing = 0;
                const r = d.renderableManager.getRenderableByGameObject(u);
                r.updateVxlRotation(0, true);
                return new m.RhinoSpriteProof(r, resource, d.worldScene.camera);
            });
            window.__m13c = { proofs, resource, mode: 'original' };
            const p = window.__m13c;
            p.refresh = () => {
                if (!d.game) return;
                proofs.forEach(proof => proof.update());
                d.worldScene.scene.updateMatrixWorld(true);
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
                d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            };
            p.modeSet = mode => {
                p.mode = mode;
                proofs.forEach(proof => { proof.background = mode === 'background'; proof.setEnabled(mode === 'candidate'); });
                p.refresh();
            };
            p.bounds = proof => {
                const b = proof.batch, v = d.worldScene.viewport, points = [];
                b.updateWorldMatrix(true, false);
                for (let i = 0; i < b.geometry.attributes.position.count; i++) {
                    const point = d.worldScene.camera.position.clone().fromBufferAttribute(b.geometry.attributes.position, i)
                        .applyMatrix4(b.matrixWorld).project(d.worldScene.camera);
                    points.push([v.x + (point.x + 1) * v.width / 2, v.y + (1 - point.y) * v.height / 2]);
                }
                return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
                    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
            };
            proofs[1].renderable.get3DObject().visible = false;
            p.refresh();
            return { originalParts: proofs.map(p => p.originalMeshes.map(m => ({ batched: !!m.isBatchedMesh, castShadow: m.castShadow }))),
                baseLight: proofs[0].baseLight.toArray(), registration: m.registration,
                colorSpace: resource.texture.colorSpace, premultiplyAlpha: resource.texture.premultiplyAlpha,
                remap: 'OWNER_REMAP_UNVERIFIED', light: 'Relative existing SHP scalar; accepted reference light normalized to one; no VPL/highlight',
                depth: 'Existing SpriteUtils split depth plus colorless coverage proxy >=0.985 for source alpha-252/253 plateau; exact shared C filter. Original VXL shadows only.',
            };
        });
        async function capture(name, preset, historical = false) {
            const rows = await page.evaluate(({ preset, historical }) => {
                const d = window.__ra2debug, p = window.__m13c, camera = d.worldScene.camera;
                const originalZoom = camera.zoom;
                const canvas = d.renderer.renderer.domElement;
                if (historical) {
                    // Historical 64 logical pixels displayed at 128 CSS, measured from current projection.
                    p.refresh(); const b = p.bounds(p.proofs[0]);
                    const cssScale = canvas.getBoundingClientRect().height / Number(canvas.dataset.logicalHeight);
                    camera.zoom *= 128 / ((b[2] - b[0]) * cssScale); camera.updateProjectionMatrix();
                }
                const rows = [];
                try {
                    for (const mode of ['original', 'background', 'candidate', 'restored']) {
                        p.modeSet(mode === 'restored' ? 'original' : mode);
                        const draws = [];
                        for (const proof of p.proofs) {
                            for (const mesh of [proof.depthProxy, proof.batch, ...proof.batch.children]) mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
                                draws.push({ pass: material.uniforms.hdPass.value, filter: material.uniforms.hdFiltering.value,
                                    depthTest: material.depthTest, depthWrite: material.depthWrite, transparent: material.transparent, colorWrite: material.colorWrite, alphaTest: material.alphaTest, name: mesh.name,
                                    frameRect: Array.from(geometry.attributes.hdFrameRect.array.slice(0, 4)), renderOrder: mesh.renderOrder });
                            };
                        }
                        const shadowDraws = [], shadowHooks = [];
                        p.proofs.forEach((proof, index) => proof.originalMeshes.forEach((mesh, part) => {
                            shadowHooks.push([mesh, mesh.onBeforeShadow]);
                            mesh.onBeforeShadow = () => shadowDraws.push([index, part]);
                        }));
                        let row;
                        try { row = window.__m14.capture(preset, true); }
                        finally { shadowHooks.forEach(([mesh, fn]) => mesh.onBeforeShadow = fn); }
                        row.rhinoShadowDraws = shadowDraws;
                        row.rhinoBounds = p.proofs.map(p.bounds); row.rhinoDraws = draws;
                        row.mode = mode; row.historical = historical;
                        row.active = p.proofs.map(proof => proof.active);
                        row.originalColorWrites = p.proofs.map(proof => proof.originalMeshes.map(m => m.material.colorWrite));
                        rows.push(row);
                    }
                } finally { camera.zoom = originalZoom; camera.updateProjectionMatrix(); p.modeSet('original'); }
                return rows;
            }, { preset, historical });
            assert.equal(rows[0].png, rows[3].png, 'Exact original restoration');
            for (const row of rows) {
                assert.equal(row.logical[1], 900); assert.equal(row.glError, 0);
                assert.equal(row.tick, rows[0].tick);
                const filename = `${name}-${row.mode}.png`;
                await fs.writeFile(`${output}/${filename}`, Buffer.from(row.png.split(',')[1], 'base64'));
                delete row.png; row.file = filename;
            }
            assert(rows[2].active.every(Boolean), 'Supported pose candidate not active');
            assert(rows[2].rhinoDraws.some(d => d.pass === 1 && d.filter && d.depthWrite && d.depthTest));
            assert(rows[2].rhinoDraws.some(d => d.pass === 2 && d.filter && !d.depthWrite && d.depthTest));
            assert(rows[2].originalColorWrites.flat().every(v => !v));
            assert.deepEqual(rows[0].rhinoShadowDraws, rows[2].rhinoShadowDraws, 'Original shadow family drawn exactly once in either mode');
            result.rows.push({ name, rows });
        }
        await capture('standard-high', '4k');
        await capture('standard-1080', '1080p');
        assert.deepEqual(result.rows[0].rows[0].rhinoBounds, result.rows[1].rows[0].rhinoBounds);
        assert.deepEqual(result.rows[0].rows[0].camera, result.rows[1].rows[0].camera);
        assert.deepEqual(result.rows[0].rows[0].ui, result.rows[1].rows[0].ui);
        await capture('historical-high', '4k', true);
        result.colorDebug = await page.evaluate(() => {
            const d = window.__ra2debug, p = window.__m13c, a = p.proofs[0]; p.modeSet('candidate');
            const draws = [a.batch, ...a.batch.children].map(m => ({
                uniforms: Object.fromEntries(Object.entries(m.material.uniforms).filter(([k]) => ['extraLight', 'opacity', 'hdPass', 'hdFiltering'].includes(k)).map(([k,u]) => [k, u.value?.toArray?.() ?? u.value])),
                color: m.material.color.toArray(), opacity: m.material.opacity, vertexColor: Array.from(m.geometry.attributes.vertexColorMult.array.slice(0,4)),
                type: m.material.type, defines: m.material.defines, blending: m.material.blending,
                premultipliedAlpha: m.material.premultipliedAlpha, map: { colorSpace: m.material.map.colorSpace, flip: m.material.map.flipY },
            }));
            const pngs = [];
            for (const kind of ['normal','no-shadow','no-light','opaque-only','edge-only']) {
                a.originalMeshes.forEach(m => m.castShadow = kind !== 'no-shadow');
                if (kind === 'no-light') a.batch.geometry.attributes.vertexColorMult.array.fill(1);
                a.batch.material.uniforms.hdPass.value = kind === 'edge-only' ? 0 : 1;
                a.batch.children[0].visible = kind !== 'opaque-only';
                d.renderer.render(); pngs.push({ kind, png: d.renderer.renderer.domElement.toDataURL() });
            }
            a.originalMeshes.forEach(m => m.castShadow = true); a.batch.material.uniforms.hdPass.value = 1; p.modeSet('original');
            return { draws, pngs };
        });
        for (const row of result.colorDebug.pngs) await fs.writeFile(`${output}/debug-${row.kind}.png`, Buffer.from(row.png.split(',')[1], 'base64'));
        delete result.colorDebug.pngs;
        result.depth = await depthChecks(page, output);
        result.checks = await runtimeChecks(page, output);
        result.interaction = await interactionChecks(page, output);
        if (process.env.M14_PLAY === '1') {
            await enableUI(page);
            console.log('Rhino single-pose fixture ready. A original / R world artwork; Alt+1 / Alt+2. Standard 900 scale.');
            if (process.env.M13C_SMOKE === '1') {
                await page.keyboard.press('Alt+2'); await page.waitForTimeout(400);
                await page.screenshot({ path: `${output}/visible-smoke.png` });
                assert.equal(await page.evaluate(() => window.__m13c.mode), 'candidate');
            } else await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); page.once('close', resolve); });
        }
        if (!page.isClosed()) result.disposal = await page.evaluate(() => {
            const d = window.__ra2debug, p = window.__m13c;
            p.proofs.forEach(proof => proof.dispose()); p.refresh();
            const released = [p.resource.texture, p.resource.remap, p.resource.palette]
                .every(t => !d.renderer.renderer.properties.get(t).__webglTexture);
            d.gameScreen.gameAnimationLoop.start();
            window.__m13cCleanup?.();
            return { released, originals: p.proofs.every(proof => proof.originalMeshes.every((m, i) => m.material === proof.originals[i])), refs: p.resource.refs };
        });
        if (result.disposal) assert(result.disposal.released && result.disposal.originals && result.disposal.refs === 0);
        result.status = 'SINGLE_POSE_RUNTIME_RENDER_PASS';
    } catch (error) { result.failure = error.stack; throw error; }
    finally { await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n'); }
    return { status: result.status, output, checks: result.checks, disposal: result.disposal };
}

async function runtimeChecks(page, output) {
    return page.evaluate(async () => {
        const d = window.__ra2debug, p = window.__m13c, a = p.proofs[0], u = a.renderable.gameObject;
        const checks = [];
        const check = (name, condition) => { if (!condition) throw Error(name); checks.push({ name, status: 'PASS' }); };
        p.modeSet('original'); const original = d.renderer.renderer.domElement.toDataURL();
        let invalidRejected = false, missingRejected = false;
        try { await window.__m13cModule.ArtworkResource.load('data:image/png;base64,AQID'); } catch { invalidRejected = true; }
        const originalFetch = window.fetch;
        try {
            // Deterministic missing-response injection, no external/server resource mutation.
            window.fetch = async () => new Response('', { status: 404 });
            try { await window.__m13cModule.ArtworkResource.load('/rhino-proof/missing.png'); } catch { missingRejected = true; }
        } finally { window.fetch = originalFetch; }
        p.refresh(); check('Invalid bytes and missing response leave exact complete original',
            invalidRejected && missingRejected && original === d.renderer.renderer.domElement.toDataURL());
        p.modeSet('candidate');
        const old = u.direction; u.direction = 1; p.refresh();
        check('Unsupported body restores whole original family', !a.active && a.originalMeshes.every((m, i) => m.material === a.originals[i]));
        u.direction = old;
        const turret = u.turretTrait.facing; u.turretTrait.facing = 1; p.refresh();
        check('Unsupported turret restores whole original family', !a.active && !a.batch.visible);
        u.turretTrait.facing = turret; p.refresh();
        const root = a.renderable.get3DObject(), visible = root.visible;
        root.visible = false; p.refresh();
        let candidateDraws = 0; a.batch.onBeforeRender = () => candidateDraws++;
        d.renderer.render(); check('Hidden entity cannot leave candidate visible', candidateDraws === 0);
        root.visible = visible; p.refresh();
        const b = p.proofs[1], resource = p.resource;
        b.dispose(); p.refresh();
        check('One instance disposal preserves shared resource and remaining instance', resource.refs === 1 && !resource.disposed && a.active);
        p.proofs[1] = new window.__m13cModule.RhinoSpriteProof(b.renderable, resource, d.worldScene.camera);
        p.modeSet('candidate'); check('Reentry restores second candidate', resource.refs === 2 && p.proofs[1].active);
        p.modeSet('original');
        return checks;
    });
}
async function enableUI(page) {
    await page.evaluate(() => {
        const p = window.__m13c, d = window.__ra2debug;
        const bar = document.createElement('div'); bar.id = 'm13c-controls';
        bar.style.cssText = 'position:fixed;top:40px;left:12px;z-index:99999;background:#17202bea;color:white;padding:10px;font:15px sans-serif';
        bar.textContent = 'Single pose / fixed red owner / 900 reference — ';
        for (const [label, mode] of [['A Original', 'original'], ['R Runtime artwork', 'candidate']]) {
            const button = document.createElement('button'); button.textContent = label; button.onclick = () => p.modeSet(mode); bar.append(button);
        }
        const live = document.createElement('button'); live.textContent = 'Resume gameplay (other poses fall back)';
        live.onclick = () => d.gameScreen.gameAnimationLoop.start(); bar.append(live);
        document.body.append(bar);
        const keydown = event => { if (event.altKey && ['1', '2'].includes(event.key)) p.modeSet(event.key === '1' ? 'original' : 'candidate'); };
        window.addEventListener('keydown', keydown);
        window.__m13cCleanup = () => { bar.remove(); window.removeEventListener('keydown', keydown); };
        p.modeSet('candidate');
    });
}

async function depthChecks(page, output) {
    const data = await page.evaluate(() => {
        const d = window.__ra2debug, p = window.__m13c, a = p.proofs[0], b = p.proofs[1];
        const u = a.renderable.gameObject, plant = window.__m12Plant;
        const building = d.renderableManager.getRenderableByGameObject(plant).get3DObject();
        const savedPosition = u.position.getMapPosition(), savedRenderPosition = a.renderable.getPosition().clone();
        const savedB = b.renderable.getPosition().clone(), savedBVisible = b.renderable.get3DObject().visible;
        const canvas = d.renderer.renderer.domElement, gl = d.renderer.renderer.getContext();
        const rows = [], pngs = [];
        p.modeSet('candidate'); d.generalOptions.graphics.renderResolution.value = '4k';
        function read(pass, showCandidate, showOccluder, occluder) {
            building.visible = true; p.refresh();
            occluder.visible = showOccluder; a.batch.visible = showCandidate; a.depthProxy.visible = true;
            if (occluder === b.batch) b.depthProxy.visible = showOccluder;
            a.batch.material.uniforms.hdPass.value = pass === 'edge' ? 0 : 1;
            a.batch.children[0].visible = pass !== 'opaque';
            // Rebuild when a real building was hidden, so merged child sprites obey visibility.
            d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            const bounds = p.bounds(a), ratio = canvas.height / Number(canvas.dataset.logicalHeight);
            const x = Math.floor(bounds[0] * ratio) - 4, top = Math.floor(bounds[1] * ratio) - 4;
            const width = Math.ceil((bounds[2] - bounds[0]) * ratio) + 8, height = Math.ceil((bounds[3] - bounds[1]) * ratio) + 8;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(x, canvas.height - top - height, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        }
        const changed = (a, b) => {
            let count = 0; for (let i = 0; i < a.length; i += 4)
                if ([0, 1, 2].some(c => Math.abs(a[i + c] - b[i + c]) > 2)) count++;
            return count;
        };
        function probe(name, occluder) {
            const passes = [];
            for (const pass of ['opaque', 'edge', 'both']) {
                const visible = changed(read(pass, true, true, occluder), read(pass, false, true, occluder));
                const unobstructed = changed(read(pass, true, false, occluder), read(pass, false, false, occluder));
                passes.push({ pass, visible, unobstructed });
            }
            building.visible = true; occluder.visible = true; p.refresh();
            a.batch.material.uniforms.hdPass.value = 1; a.batch.children[0].visible = true;
            d.renderer.render();
            rows.push({ name, tile: [u.tile.rx, u.tile.ry], bounds: p.bounds(a), buffer: [canvas.width, canvas.height],
                logical: [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)], passes, glError: gl.getError() });
            pngs.push({ name, png: canvas.toDataURL() });
        }
        try {
            probe('open-ground', building);
            for (const [dx, dy] of [[-2, -2], [-1, -1], [0, -1], [1, -1], [-1, 1], [0, 0], [0, 1], [1, 0], [1, 1], [2, 2]]) {
                const tile = d.game.map.tiles.getByMapCoords(plant.tile.rx + dx, plant.tile.ry + dy);
                if (!tile || tile.rampType || tile.z !== u.tile.z) continue;
                u.position.moveToTileCoords(tile.rx + 0.5, tile.ry + 0.5);
                a.renderable.setPosition(u.position.worldPosition);
                probe(`building-${dx}-${dy}`, building);
            }
            const yardUnit = d.localPlayer.getOwnedObjects().find(u => u.name === 'GACNST');
            const yard = d.renderableManager.getRenderableByGameObject(yardUnit).get3DObject();
            for (const [dx, dy] of [[0, 0], [0, 1], [1, 1], [-1, -1]]) {
                const tile = d.game.map.tiles.getByMapCoords(yardUnit.tile.rx + dx, yardUnit.tile.ry + dy);
                u.position.moveToTileCoords(tile.rx + 0.5, tile.ry + 0.5); a.renderable.setPosition(u.position.worldPosition);
                probe(`yard-${dx}-${dy}`, yard); yard.visible = true;
            }
            u.position.moveToLeptons(savedPosition); a.renderable.setPosition(savedRenderPosition);
            b.renderable.get3DObject().visible = true;
            // Two real HTNK fixtures; render-only offset is a declared overlap probe, restored below.
            b.renderable.setPosition(savedRenderPosition.clone().add({ x: 120, y: 0, z: 110 }));
            probe('two-tank-overlap', b.batch);
        } finally {
            u.position.moveToLeptons(savedPosition); a.renderable.setPosition(savedRenderPosition);
            b.renderable.setPosition(savedB); b.renderable.get3DObject().visible = savedBVisible;
            building.visible = true; a.batch.material.uniforms.hdPass.value = 1;
            a.batch.children[0].visible = true; p.modeSet('original');
        }
        const fully = rows.some(r => r.passes.every(p => p.visible === 0) && r.passes[2].unobstructed > 0);
        const partial = rows.some(r => r.passes[1].visible > 0 && r.passes[1].visible < r.passes[1].unobstructed && r.passes[2].visible < r.passes[2].unobstructed);
        return { status: fully && partial ? 'PASS_BOUNDED_SHAPED_SPRITE_DEPTH' : 'DEPTH_INTEGRATION_BLOCKED',
            rows, pngs, fullyHidden: fully, partialOcclusion: partial,
            scope: 'Frozen diagnostic positions; original logical sizes unchanged. Split sprite depth approximates artwork. No slope/crowd acceptance.' };
    });
    for (const row of data.pngs) await fs.writeFile(`${output}/depth-${row.name}.png`, Buffer.from(row.png.split(',')[1], 'base64'));
    delete data.pngs; await fs.writeFile(`${output}/depth.json`, JSON.stringify(data, null, 2) + '\n');
    return data;
}

async function interactionChecks(page, output) {
    const checks = await page.evaluate(() => {
        const d = window.__ra2debug, p = window.__m13c, a = p.proofs[0], camera = d.worldScene.camera;
        p.modeSet('candidate'); const canvas = d.renderer.renderer.domElement;
        const originalPosition = camera.position.clone(), originalProjection = camera.projectionMatrix.toArray();
        const before = p.bounds(a); camera.position.x += 80; camera.updateMatrixWorld(); p.refresh();
        const after = p.bounds(a); camera.position.copy(originalPosition); camera.updateMatrixWorld(); p.refresh();
        if (JSON.stringify(before) === JSON.stringify(after) || JSON.stringify(before) !== JSON.stringify(p.bounds(a))) throw Error('Camera anchoring/restoration failed');
        const positions = Array.from(a.batch.geometry.attributes.position.array), geometry = a.batch.geometry,
            edge = a.batch.children[0], texture = p.resource.texture, programs = d.renderer.renderer.info.programs.length;
        const times = [];
        for (let i = 0; i < 48; i++) { const start = performance.now(); p.refresh(); d.renderer.renderer.getContext().finish(); times.push(performance.now() - start); }
        if (a.batch.geometry !== geometry || a.batch.children[0] !== edge || p.resource.texture !== texture
            || programs !== d.renderer.renderer.info.programs.length) throw Error('Per-frame resource churn');
        times.sort((a, b) => a - b);
        return { panning: 'PASS', projectionRestored: JSON.stringify(originalProjection) === JSON.stringify(camera.projectionMatrix.toArray()),
            stableBuffersPrograms: true, colorTextureBytes: 256 * 192 * 4, metadataTextureBytes: 8,
            perInstanceGeometryBytes: Object.values(geometry.attributes).reduce((n, a) => n + a.array.byteLength, geometry.index.array.byteLength),
            load: 'Two allocated Rhino proofs, one visible plus 8 accepted Conscripts and GAPOWR; 48 frozen render/finish samples',
            medianMs: times[24], p95Ms: times[45], positions,
            click: d.helpers.getOwnedUnitClickPointById(a.renderable.gameObject.id) };
    });
    const target = checks.click;
    await page.mouse.click(target.x, target.y);
    // Frozen scene still accepts selection input; briefly update render state without advancing simulation.
    checks.selection = await page.evaluate(() => {
        const d = window.__ra2debug, a = window.__m13c.proofs[0];
        return { selected: d.helpers.getSelectedUnitIds(), expected: a.renderable.gameObject.id };
    });
    // Use the actual display adaptation on resize; restore before subsequent review/play.
    const prior = page.viewportSize();
    if (prior) {
        await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(250);
        checks.resize = await page.evaluate(() => {
            const d = window.__ra2debug, p = window.__m13c; p.refresh(); const canvas = d.renderer.renderer.domElement;
            return { logical: [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)], css: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
                bounds: p.bounds(p.proofs[0]), active: p.proofs[0].active, glError: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(checks.resize.logical[1], 900); assert(checks.resize.active); assert.equal(checks.resize.glError, 0);
        await page.setViewportSize(prior); await page.waitForTimeout(250);
    }
    await page.evaluate(() => { window.__ra2debug.unitSelection.deselectAll(); window.__m13c.modeSet('original'); });
    const movement = await page.evaluate(() => {
        const d = window.__ra2debug, p = window.__m13c, proof = p.proofs[0], u = proof.renderable.gameObject;
        const target = d.game.map.tiles.getByMapCoords(u.tile.rx, u.tile.ry - 1);
        if (!target || d.game.map.tileOccupation.getObjectsOnTile(target).length
            || d.game.map.terrain.getPassableSpeed(target, u.rules.speedType, true, false) <= 0) return { status: 'NOT_RUN_NO_CLEAR_STRAIGHT_TILE' };
        const before = proof.renderable.getPosition().toArray();
        p.modeSet('candidate'); d.actionsApi.orderUnits([u.id], 0, target.rx, target.ry);
        d.gameScreen.gameAnimationLoop.start();
        return { status: 'STARTED', before, target: [target.rx, target.ry] };
    });
    if (movement.status === 'STARTED') {
        try {
            await page.waitForFunction(() => window.__m13c.proofs[0].renderable.gameObject.isMoving && window.__m13c.proofs[0].active, undefined, { timeout: 7000 });
            movement.sample = await page.evaluate(() => {
                const p = window.__m13c.proofs[0], u = p.renderable.gameObject;
                return { active: p.active, moving: u.isMoving, direction: u.direction, turret: u.turretTrait.facing,
                    position: p.renderable.getPosition().toArray(), shadows: p.originalMeshes.map(m => m.castShadow),
                    originalColors: p.originalMeshes.map(m => m.material.colorWrite), geometry: Array.from(p.source.geometry.attributes.position.array) };
            });
            await page.screenshot({ path: `${output}/supported-motion.png` });
            await page.waitForFunction(() => !window.__m13c.proofs[0].renderable.gameObject.isMoving, undefined, { timeout: 12000 });
            movement.status = 'PASS_SHORT_SUPPORTED_HEADING_TRANSLATION';
        } catch (error) { movement.status = 'NOT_REPRODUCED_SUPPORTED_HEADING_TRANSLATION'; movement.reason = String(error); }
        await page.evaluate(() => { window.__ra2debug.gameScreen.gameAnimationLoop.stop(); window.__m13c.modeSet('original'); });
    }
    checks.movement = movement;
    await fs.writeFile(`${output}/interaction.json`, JSON.stringify(checks, null, 2) + '\n');
    return checks;
}
