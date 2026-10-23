// Compare the old mount and corrected production mount at identical native poses.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const density = process.argv.includes('--2x') ? 2 : 4;
const s = await startSession(process.argv[2], process.argv[3], edition, false, async ({ page }) => {
    await page.evaluate(value => window.__ra2debug.generalOptions.graphics.hdDensity.value = value, density);
});
const { page, report, close } = s;
let failure;
try {
    report.samples = [];
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        f.player.color = g.rules.colors.get('DarkBlue');
        const neighbors = Array.from({ length: 81 }, (_, i) => [i % 9 - 4, Math.floor(i / 9) - 4]);
        const open = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
            && g.map.getTileZone(t) === 0 && neighbors.every(([x, y]) => {
                const q = g.map.tiles.getByMapCoords(t.rx + x, t.ry + y);
                return q && g.map.isWithinBounds(q) && !q.rampType && g.map.getTileZone(q) === 0
                    && !g.map.getGroundObjectsOnTile(q).some(o => o.isTerrain() || o.isTechno());
            })).sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry));
        f.actor = f.spawn('SHAD', 7, open[0]);
        f.actor.attackTrait.setDisabled(true);
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        const t = open.find(t => Math.hypot(t.rx - f.actor.tile.rx, t.ry - f.actor.tile.ry) > 12);
        d.actionsApi.orderUnits([f.actor.id], 0, t.rx, t.ry);
    });
    await page.waitForFunction(() => window.__allied.actor.zone === 1 && window.__allied.actor.tileElevation > 2
        && window.__allied.sample(window.__allied.actor).vxlHd, undefined, { timeout: 45000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        d.gameScreen.gameAnimationLoop.stop();
        const r = d.renderableManager.getRenderableByGameObject(f.actor);
        f.phaseBase = r.rotors.map(m => m.quaternion.toArray());
    });
    for (const direction of [0, 45, 90, 135, 180, 225, 270, 315]) for (const phase of [0, 120, 240]) {
        const result = await page.evaluate(({ direction, phase }) => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.actor), h = r.unitVxlHd;
            f.actor.direction = direction; r.updateVxlRotation(direction, true);
            r.rotors.forEach((m, i) => {
                m.quaternion.fromArray(f.phaseBase[i]).multiply(
                    m.quaternion.clone().setFromAxisAngle(r.objectArt.rotors[i].axis, phase * Math.PI / 180));
                m.updateMatrix();
            });
            const rear = h.layers.find(l => l.frames[0].part.section === 'CYLINDER18').frames[0].part;
            const offsets = rear.frames.map(f => f.rotorMountOffset);
            if (offsets.length !== 8 || offsets.some(v => !v || v.length !== 3))
                throw Error('Complete production rear mount bearings required');
            const capture = () => {
                h.update(); d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
                const p = r.getPosition().clone().project(d.worldScene.camera), ratio = canvas.width / d.renderer.width;
                const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
                const detail = document.createElement('canvas'); detail.width = 600; detail.height = 420;
                detail.getContext('2d').drawImage(canvas, Math.round(x - 300), Math.round(y - 252), 600, 420, 0, 0, 600, 420);
                return detail.toDataURL();
            };
            // This isolated fixture suppresses only the new render translation.
            // Restore the registered production value before measuring/continuing.
            rear.frames.forEach(f => delete f.rotorMountOffset);
            const beforePng = capture();
            rear.frames.forEach((f, i) => f.rotorMountOffset = offsets[i]);
            const png = capture();
            const bodyHeading = h.layers.find(l => l.frames[0].part.section === 'DUMMY01')
                .frames.find(q => q.batch.visible).frame.heading;
            const layers = h.layers.filter(l => l.rotor).map(l => {
                const q = l.frames[0], frame = q.frame, geometry = q.source.geometry;
                const uv = geometry.getAttribute('uv'), position = geometry.getAttribute('position');
                const anchor = frame.rotorAnchor ?? (l.mesh === r.rotors[0] ? [133 / 270, 54 / 136] : [132 / 270, 60 / 136]);
                const [x, y, w, height] = frame.rect, [pw, ph] = q.part.pageSize;
                const target = [(x + anchor[0] * w) / pw, 1 - (y + anchor[1] * height) / ph];
                let hub, normal;
                for (let i = 0; i < position.count; i += 3) {
                    const a = [uv.getX(i), uv.getY(i)], b = [uv.getX(i + 1), uv.getY(i + 1)], c = [uv.getX(i + 2), uv.getY(i + 2)];
                    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                    if (Math.abs(den) < 1e-10) continue;
                    const u = ((b[1] - c[1]) * (target[0] - c[0]) + (c[0] - b[0]) * (target[1] - c[1])) / den;
                    const v = ((c[1] - a[1]) * (target[0] - c[0]) + (a[0] - c[0]) * (target[1] - c[1])) / den;
                    if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
                    const vertices = [0, 1, 2].map(j => r.posObj.position.clone().fromBufferAttribute(position, i + j));
                    hub = vertices[0].clone().multiplyScalar(u).addScaledVector(vertices[1], v).addScaledVector(vertices[2], 1 - u - v);
                    normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize().transformDirection(q.batch.matrixWorld);
                    break;
                }
                if (!hub) throw Error('Painted hub not covered by rotor geometry');
                const index = r.rotors.indexOf(l.mesh), axis = r.objectArt.rotors[index].axis;
                const center = l.mesh.geometry.boundingBox.getCenter(r.posObj.position.clone()).projectOnVector(axis);
                const expected = center.applyMatrix4(l.mesh.matrixWorld);
                const mountOffset = q.part.frames[bodyHeading / 45].rotorMountOffset ?? [0, 0, 0];
                const shift = r.posObj.position.clone().fromArray(mountOffset)
                    .applyMatrix4(l.mesh.parent.matrixWorld.clone().setPosition(0, 0, 0));
                expected.add(shift).project(d.worldScene.camera);
                hub.applyMatrix4(q.batch.matrixWorld).project(d.worldScene.camera);
                const v = d.worldScene.viewport;
                return { section: q.part.section, mountOffset, normal: normal.toArray(), hub: hub.toArray(), expected: expected.toArray(),
                    hubPixelError: Math.hypot((hub.x - expected.x) * v.width / 2, (hub.y - expected.y) * v.height / 2) };
            });
            const body = h.layers.find(l => l.frames[0].part.section === 'DUMMY01').frames.find(q => q.batch.visible);
            const pixels = [[46.5, 93], [55, 123], [194, 88], [258.5, 4], [186.5, 11], [55.5, 31], [50, 6.5], [55.5, 4]][bodyHeading / 45];
            const uv = body.source.geometry.getAttribute('uv'), position = body.source.geometry.getAttribute('position');
            const [x, y, w, height] = body.frame.rect, [pw, ph] = body.part.pageSize;
            const target = [(x + pixels[0] / 4 / body.frame.logicalSize[0] * w) / pw,
                1 - (y + pixels[1] / 4 / body.frame.logicalSize[1] * height) / ph];
            let mount;
            for (let i = 0; i < position.count; i += 3) {
                const a = [uv.getX(i), uv.getY(i)], b = [uv.getX(i + 1), uv.getY(i + 1)], c = [uv.getX(i + 2), uv.getY(i + 2)];
                const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                if (Math.abs(den) < 1e-10) continue;
                const u = ((b[1] - c[1]) * (target[0] - c[0]) + (c[0] - b[0]) * (target[1] - c[1])) / den;
                const v = ((c[1] - a[1]) * (target[0] - c[0]) + (a[0] - c[0]) * (target[1] - c[1])) / den;
                if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
                const vertices = [0, 1, 2].map(j => r.posObj.position.clone().fromBufferAttribute(position, i + j));
                mount = vertices[0].clone().multiplyScalar(u).addScaledVector(vertices[1], v).addScaledVector(vertices[2], 1 - u - v);
                mount.applyMatrix4(body.batch.matrixWorld).project(d.worldScene.camera);
                break;
            }
            if (!mount) throw Error('Painted tail mount must be covered by the body geometry');
            const hub = layers.find(l => l.section === 'CYLINDER18').hub, viewport = d.worldScene.viewport;
            const bodyMountPixelError = Math.hypot((hub[0] - mount.x) * viewport.width / 2,
                (hub[1] - mount.y) * viewport.height / 2);
            return { direction, phase, bodyHeading, bodyMountPixelError, layers, density: d.sovietUnitsHd.families.SHAD.density,
                glError: d.renderer.renderer.getContext().getError(),
                contextLost: d.renderer.renderer.getContext().isContextLost(), png, beforePng };
        }, { direction, phase });
        assert.equal(result.glError, 0); assert.equal(result.contextLost, false); assert.equal(result.density, density);
        assert.equal(result.bodyHeading, direction);
        assert(result.bodyMountPixelError < 0.01, 'Rear hub must meet the visible authored body mount');
        if (process.argv.includes('--verify')) for (const layer of result.layers) {
            assert(Math.abs(layer.normal[1]) > 0.9999, 'Both tandem rotor planes must remain horizontal');
            assert(layer.hubPixelError < 0.001, 'Painted hub must coincide with its corrected spin axis');
        }
        const file = `SHAD-${direction}-${phase}.png`;
        await fs.writeFile(path.join(s.out, file), Buffer.from(result.png.split(',')[1], 'base64'));
        const beforeFile = `before-${file}`;
        await fs.writeFile(path.join(s.out, beforeFile), Buffer.from(result.beforePng.split(',')[1], 'base64'));
        delete result.png; delete result.beforePng; report.samples.push({ file, beforeFile, ...result });
    }
} catch (error) { failure = error; console.error(error); }
await close(failure); if (failure) process.exitCode = 1;
