import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(arg => arg.startsWith('--density='))?.split('=')[1] ?? 4);
const zoom = Number(process.argv.find(arg => arg.startsWith('--zoom='))?.split('=')[1] ?? 1);
const identities = process.argv.find(arg => arg.startsWith('--families='))?.split('=')[1].split(',') ?? ['APOC', 'DISK'];
const selectedAngles = process.argv.find(arg => arg.startsWith('--angles='))?.split('=')[1].split(',').map(Number);
const enemyOwner = process.argv.includes('--enemy-owner');
assert([0, 2, 4].includes(density) && zoom >= 1 && zoom <= 3);
assert(identities.every(identity => ['APOC', 'DISK'].includes(identity)));
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density > 0;
        if (density) graphics.hdDensity.value = density;
    }, density);
});
const { page, out, report, close } = session;
report.density = density;
report.zoom = zoom;
report.owner = enemyOwner ? 'fixture opponent' : 'local player';
report.disclosure = 'Controlled native poses and shader phases, with frozen simulation and an explicitly recorded camera zoom. PNG crops are not rescaled.';
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
let failure;
try {
    await page.evaluate(noShadows => {
        const d = window.__ra2debug, f = window.__allied;
        d.game.speed.value = d.game.desiredSpeed.value = Number.EPSILON;
        clearInterval(f.timer);
        if (noShadows) d.worldScene.shadowQuality.value = 0;
    }, process.argv.includes('--no-shadows'));
    report.frames = [];
    for (const identity of identities) {
        await page.evaluate(({ identity, enemyOwner }) => {
            const d = window.__ra2debug, f = window.__allied;
            d.worldScene.camera.zoom = d.worldScene.cameraZoom.zoom = d.worldScene.lastCameraZoom = 1;
            d.worldScene.camera.updateProjectionMatrix();
            if (f.actor?.isSpawned) d.game.unspawnObject(f.actor);
            f.actor = f.spawn(identity, 7, { rx: f.center.rx - 10, ry: f.center.ry - 10 }, enemyOwner ? f.enemy : f.player);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, { identity, enemyOwner });
        await page.waitForFunction(density => !density || window.__allied.sample(window.__allied.actor).vxlHd,
            density, { timeout: 60000 });
        await page.evaluate(zoom => {
            const world = window.__ra2debug.worldScene;
            world.camera.zoom = world.cameraZoom.zoom = world.lastCameraZoom = zoom;
            world.camera.updateProjectionMatrix();
        }, zoom);
        const poses = Array.from({ length: identity === 'DISK' ? 32 : 8 }, (_, i) => ({
            angle: i * (identity === 'DISK' ? 11.25 : 45), cross: false,
        }));
        if (identity === 'APOC' && process.argv.includes('--cross-turret'))
            poses.push(...Array.from({ length: 7 }, (_, i) => ({ angle: (i + 1) * 45, cross: true })));
        for (const { angle, cross } of poses.filter(pose => !selectedAngles || selectedAngles.includes(pose.angle))) {
            const capture = await page.evaluate(({ identity, angle, cross, zoom }) => {
                const d = window.__ra2debug, f = window.__allied, unit = f.actor;
                const renderable = d.renderableManager.getRenderableByGameObject(unit), hd = renderable.unitVxlHd;
                unit.direction = identity === 'APOC' && !cross ? angle : 0;
                unit.turretTrait.facing = angle;
                if (identity === 'DISK' && hd) hd.discRotation.update = () => angle;
                renderable.updateVxlRotation(unit.direction, true);
                hd?.update();
                d.worldScene.scene.updateMatrixWorld(true);
                d.worldScene.meshBatchManager.updateMeshes();
                d.renderer.render();
                const canvas = d.renderer.renderer.domElement, viewport = d.worldScene.viewport;
                const projected = renderable.getPosition().clone().project(d.worldScene.camera);
                const ratio = canvas.width / d.renderer.width;
                const x = (viewport.x + (projected.x + 1) * viewport.width / 2) * ratio;
                const y = (viewport.y + (1 - projected.y) * viewport.height / 2) * ratio;
                const width = zoom > 1 ? 720 : 480, height = zoom > 1 ? 540 : 360;
                const crop = document.createElement('canvas'); crop.width = width; crop.height = height;
                crop.getContext('2d').drawImage(canvas, Math.round(x - width / 2), Math.round(y - height * .72),
                    width, height, 0, 0, width, height);
                return { image: crop.toDataURL(), identity, angle, cross, bodyFacing: unit.direction,
                    buffer: [canvas.width, canvas.height], ownerColor: unit.owner.color, palette: renderable.palette.hash,
                    activeDensity: hd ? d.sovietUnitsHd.families[identity].density : 0,
                    sample: f.sample(unit),
                    native: renderable.vxlBuilders.flatMap(builder => [...builder.sections].map(([section, mesh]) => {
                        mesh.geometry.computeBoundingBox();
                        const box = mesh.geometry.boundingBox;
                        return { member: builder.vxlFile.filename, section, min: box.min.toArray(), max: box.max.toArray(),
                            matrix: mesh.matrixWorld.elements.slice(), position: renderable.posObj.matrixWorld.elements.slice() };
                    })),
                    layers: hd?.layers.map(layer => ({ member: layer.frames[0].part.member,
                        active: layer.frames.filter(frame => frame.batch.visible).map(frame => ({ heading: frame.frame.heading,
                            matrix: frame.batch.matrix.elements.slice(), phase: frame.batch.userData.discPhase,
                            passes: [frame.batch.material, frame.depth.material, frame.translucent.material,
                                ...frame.batch.children.map(child => child.material)].map(material => ({
                                    phase: material.uniforms.discPhase?.value,
                                    lower: material.uniforms.discLower?.value,
                                })) })) })) ?? [],
                    glError: d.renderer.renderer.getContext().getError() };
            }, { identity, angle, cross, zoom });
            const file = `${identity}-${angle}${cross ? '-cross' : ''}.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(capture.image.split(',')[1], 'base64'));
            delete capture.image;
            assert.equal(capture.glError, 0);
            assert.equal(capture.activeDensity, density);
            assert(capture.layers.every(layer => layer.active.length > 0
                && layer.active.every(frame => frame.matrix.every(Number.isFinite))));
            if (identity === 'DISK' && density) for (const layer of capture.layers)
                for (const frame of layer.active) {
                    assert.equal(frame.phase, angle);
                    assert(frame.passes.every(pass => Math.abs(pass.phase - angle * Math.PI / 180) < 1e-8
                        && pass.lower === Number(layer.member === 'disk.vxl')),
                    'Every Disc part and coverage pass must share the complete rotation phase');
                }
            report.frames.push({ ...capture, file });
        }
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
assert.equal(report.errors.length, 0, 'Native renderer reported console or page errors');
