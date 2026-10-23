// Incremental native checks in the exact app and sibling resource installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--2x') ? 2 : 4;
const s = await startSession(process.argv[2], process.argv[3], edition, false, async ({ page }) => {
    assert.equal(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value), 4);
    await page.evaluate(value => window.__ra2debug.generalOptions.graphics.hdDensity.value = value, density);
});
const { page, report, close } = s;
let failure;
try {
    report.density = density;
    report.samples = [];
    report.rotors = [];
    const names = process.argv.includes('--control-only') ? ['SCHP'] : edition === 'yr' ? ['SHAD', 'SCHP'] : ['SHAD'];
    for (const name of names) {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            f.player.color = g.rules.colors.get('DarkBlue');
            const neighbors = Array.from({ length: 81 }, (_, i) => [i % 9 - 4, Math.floor(i / 9) - 4]);
            const open = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.getTileZone(t) === 0 && neighbors.every(([x, y]) => {
                    const q = g.map.tiles.getByMapCoords(t.rx + x, t.ry + y);
                    return q && g.map.isWithinBounds(q) && !q.rampType && g.map.getTileZone(q) === 0
                        && !g.map.getGroundObjectsOnTile(q).some(o => o.isTerrain() || o.isTechno());
                }))
                .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                    - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry));
            if (!open.length) throw Error('No unobstructed helicopter fixture');
            f.actor = f.spawn(name, 7, open[0]);
            f.actor.attackTrait.setDisabled(true);
            f.home = { rx: f.actor.tile.rx, ry: f.actor.tile.ry };
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd);
        for (const state of ['ground', 'flight']) {
            if (state === 'flight') {
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    const t = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                        && !t.rampType && d.game.map.getTileZone(t) === 0
                        && !d.game.map.getGroundObjectsOnTile(t).some(o => o.isTerrain() || o.isTechno()))
                        .sort((a, b) => Math.abs(Math.hypot(a.rx - f.home.rx, a.ry - f.home.ry) - 12)
                            - Math.abs(Math.hypot(b.rx - f.home.rx, b.ry - f.home.ry) - 12))[0];
                    d.actionsApi.orderUnits([f.actor.id], 0, t.rx, t.ry);
                });
                await page.waitForFunction(() => window.__allied.actor.zone === 1
                    && window.__allied.actor.tileElevation > 2, undefined, { timeout: 45000 });
            }
            await page.evaluate(() => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__allied.actor);
                d.gameScreen.gameAnimationLoop.stop();
                window.__allied.rotorPhase = r.rotors.map(m => m.quaternion.toArray());
            });
            const headings = density === 4 ? [0, 45, 90, 135, 180, 225, 270, 315] : [45, 90, 135, 315];
            for (const direction of headings) {
                const sample = await page.evaluate(direction => {
                    const d = window.__ra2debug, f = window.__allied;
                    const r = d.renderableManager.getRenderableByGameObject(f.actor), h = r.unitVxlHd;
                    f.actor.direction = direction;
                    r.updateVxlRotation(direction, true);
                    r.rotors.forEach((m, i) => {
                        m.quaternion.fromArray(f.rotorPhase[i]);
                        m.updateMatrix();
                    });
                    h.update();
                    d.worldScene.scene.updateMatrixWorld(true);
                    d.worldScene.meshBatchManager.updateMeshes();
                    d.renderer.render();
                    // SCHP retains inactive deployed/turret layers in its complete family.
                    const layers = h.layers.filter(l => !l.rotor && l.frames.some(q => q.batch.visible)).map(l => {
                        const q = l.frames.find(q => q.batch.visible), uv = q.source.geometry.getAttribute('uv');
                        const xs = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
                        const ys = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
                        const [x, y, w, height] = q.frame.rect, [pw, ph] = q.part.pageSize;
                        q.source.geometry.computeBoundingBox();
                        l.mesh.geometry.computeBoundingBox();
                        const nativeBounds = l.mesh.geometry.boundingBox.clone()
                            .applyMatrix4(l.mesh.matrix.clone().fromArray(q.frame.referenceLinear));
                        return { section: q.part.section, heading: q.frame.heading,
                            bodyHeight: [q.source.geometry.boundingBox.min.y, q.source.geometry.boundingBox.max.y],
                            nativeHeight: [nativeBounds.min.y, nativeBounds.max.y],
                            actual: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
                            expected: [x / pw, 1 - (y + height) / ph, (x + w) / pw, 1 - y / ph] };
                    });
                    const bearings = h.layers.filter(l => l.mast).map(l => {
                        const mast = l.mast.mesh, q = l.frames[0];
                        const center = l.mesh.geometry.boundingBox.getCenter(r.posObj.position.clone())
                            .projectOnVector(l.rotorAxis).applyMatrix4(l.mesh.matrix);
                        center.add(r.posObj.position.clone().fromArray(q.part.frames[0].rotorMountOffset ?? [0, 0, 0]));
                        return { section: q.part.section, visible: mast.visible,
                            hubError: center.distanceTo(mast.position), matrix: mast.matrix.toArray() };
                    });
                    const rotorPlanes = h.layers.filter(l => l.rotor).map(l => {
                        const q = l.frames[0], p = q.source.geometry.getAttribute('position');
                        const [a, b, c] = [0, 1, 2].map(i => r.posObj.position.clone().fromBufferAttribute(p, i));
                        const normal = b.sub(a).cross(c.sub(a)).normalize().transformDirection(q.batch.matrixWorld);
                        const expected = l.rotorAxis.clone().transformDirection(l.mesh.matrixWorld);
                        return { section: q.part.section, alignment: Math.abs(normal.dot(expected)) };
                    });
                    const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                    const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
                    const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
                    const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
                    const detail = document.createElement('canvas'); detail.width = 600; detail.height = 420;
                    detail.getContext('2d').drawImage(canvas, Math.round(x - 300), Math.round(y - 252),
                        600, 420, 0, 0, 600, 420);
                    const gl = d.renderer.renderer.getContext();
                    return { direction, zone: f.actor.zone, elevation: f.actor.tileElevation,
                        hd: f.sample(f.actor), layers, bearings, rotorPlanes, glError: gl.getError(), contextLost: gl.isContextLost(),
                        png: detail.toDataURL(), camera: d.worldScene.camera.rotation.toArray() };
                }, direction);
                assert.equal(sample.glError, 0); assert.equal(sample.contextLost, false);
                assert(sample.layers.length > 0, 'A visible native body component is required');
                for (const layer of sample.layers) layer.actual.forEach((v, i) => assert(Math.abs(v - layer.expected[i]) < 1e-5));
                for (const layer of sample.layers) {
                    assert(layer.bodyHeight[0] >= layer.nativeHeight[0] - 0.001);
                    assert(layer.bodyHeight[1] <= layer.nativeHeight[1] + 0.001);
                }
                assert.equal(sample.bearings.length, name === 'SHAD' ? 2 : 1);
                for (const bearing of sample.bearings) {
                    assert(bearing.visible); assert(bearing.hubError < 0.001);
                }
                for (const plane of sample.rotorPlanes) assert(plane.alignment > 0.9999);
                const file = `${name}-${state}-${direction}.png`;
                await fs.writeFile(path.join(s.out, file), Buffer.from(sample.png.split(',')[1], 'base64'));
                delete sample.png; report.samples.push({ name, state, file, ...sample });
            }
            await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        }
        const rotorSample = () => page.evaluate(() => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__allied.actor);
            return { quaternions: r.rotors.map(m => m.quaternion.toArray()),
                matrices: r.unitVxlHd.layers.filter(l => l.rotor).map(l => l.frames[0].batch.matrix.toArray()),
                bearings: r.unitVxlHd.layers.filter(l => l.mast).map(l => l.mast.mesh.matrix.toArray()) };
        });
        const before = await rotorSample();
        await s.startClip();
        await page.waitForTimeout(750);
        const after = await rotorSample();
        assert.equal(before.quaternions.length, 2);
        before.quaternions.forEach((q, i) => assert.notDeepEqual(q, after.quaternions[i]));
        before.matrices.forEach((m, i) => assert.notDeepEqual(m, after.matrices[i]));
        before.bearings.forEach((m, i) => m.forEach((v, j) => assert(Math.abs(v - after.bearings[i][j]) < 0.0001)));
        report.rotors.push({ name, before, after });
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.actionsApi.orderUnits([f.actor.id], 0, f.home.rx, f.home.ry);
        });
        await page.waitForFunction(() => window.__allied.actor.zone === 0
            && window.__allied.actor.tileElevation < 0.01, undefined, { timeout: 45000 });
        await s.stopClip(name + '-flight-and-landing');
        await s.stage(name + '-landed');
        await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__allied.actor));
    }
} catch (error) { failure = error; console.error(error); }
await close(failure);
if (failure) process.exitCode = 1;
