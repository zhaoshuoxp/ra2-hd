import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const [output, mission, identity] = process.argv.slice(2), out = path.resolve(output);
const cameraZoom = Number(process.argv.find(value => value.startsWith('--camera-zoom='))?.slice(14) ?? 2);
assert(output && mission && identity);
assert([1, 2, 4].includes(cameraZoom));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identity, frames: [], errors: [], failedResources: [],
    scope: 'Original-only VXL turret design, palette, native geometry and pivot reference from an actual original YR source placement. Frozen renderer bearings, camera and mesh visibility only; no actors, rules, source, health, direction, task, RNG or result edits. This does not qualify HD artwork or gameplay.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density: 0 }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22)
        .launchDiagnostic(undefined, mission), mission);
    await waitWorld(page, mission);
    report.actor = await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source building absent');
        const r = d.renderableManager.getRenderableByGameObject(actor);
        if (!r?.turretRot || !r.turretBuilders?.length) throw Error('Original native VXL turret absent');
        window.__sourceTurretActor = actor;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        d.worldInteraction.minimapHandler.panToTile(actor.tile);
        return { id: actor.id, tile: [actor.tile.rx, actor.tile.ry], health: actor.healthTrait.health,
            turretFacing: actor.turretTrait?.facing, builders: r.turretBuilders.length, launch: g.campaign.launch };
    }, identity);
    report.before = await worldState(page);
    await page.screenshot({ path: path.join(out, 'original-complete-scene.png') });
    const captures = await page.evaluate(({ ownerRed, zoom }) => {
        const d = window.__ra2debug, actor = window.__sourceTurretActor;
        const r = d.renderableManager.getRenderableByGameObject(actor), w = d.worldScene, gl = d.renderer.renderer;
        d.gameScreen.gameAnimationLoop.stop();
        const own = new Set(), batchOutput = new Set();
        r.turret.traverse(object => { if (object.isMesh) own.add(object); });
        w.meshBatchManager.get3DObject().traverse(object => batchOutput.add(object));
        const visible = [];
        w.scene.traverse(object => {
            if (object.isMesh && !own.has(object) && !batchOutput.has(object)) {
                visible.push([object, object.visible]); object.visible = false;
            }
        });
        const source = { rootVisible: r.get3DObject().visible, turretVisible: r.turret.visible,
            rotation: r.turretRot.rotation.clone(), background: w.scene.background,
            clear: gl.getClearColor(w.ambientLight.color.clone()), alpha: gl.getClearAlpha() };
        const palettes = r.turretBuilders.map(builder => builder.palette);
        let referencePalette;
        if (ownerRed) {
            referencePalette = [...r.paletteRemaps].sort((a, b) => {
                const score = palette => { const c = palette.getColor(23); return c.r - Math.max(c.g, c.b); };
                return score(b) - score(a);
            })[0];
            for (const builder of r.turretBuilders) builder.setPalette(referencePalette);
        }
        r.get3DObject().visible = true; r.turret.visible = true;
        w.scene.background = null; gl.setClearColor(0x34483d, 1);
        w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
        const update = () => {
            r.turretRot.updateMatrix();
            const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
            w.meshBatchManager.updateMeshes();
        };
        const ratio = gl.domElement.width / d.renderer.width, v = w.viewport;
        const pixel = point => [(v.x + (point.x + 1) * v.width / 2) * ratio,
            (v.y + (1 - point.y) * v.height / 2) * ratio];
        const project = () => {
            const points = [];
            for (const mesh of own) {
                mesh.geometry.computeBoundingBox(); const box = mesh.geometry.boundingBox;
                if (!box) continue;
                for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y])
                    for (const z of [box.min.z, box.max.z]) points.push(pixel(w.camera.position.clone()
                        .set(x, y, z).applyMatrix4(mesh.matrixWorld).project(w.camera)));
            }
            if (!points.length) throw Error('Native turret geometry is empty');
            return points;
        };
        const frames = [];
        try {
            for (let bearing = 0; bearing < 360; bearing += 45) {
                r.turretRot.rotation.y = bearing * Math.PI / 180;
                const previous = w.cameraPan.freeCamera.value;
                w.cameraPan.freeCamera.value = true;
                try {
                    for (let pass = 0; pass < 3; pass++) {
                        w.updateCamera(w.cameraPan.getPan(), zoom); update();
                        const points = project(), pan = w.cameraPan.getPan();
                        const center = [(Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
                            (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2];
                        w.cameraPan.setPan({ x: pan.x + center[0] / ratio - v.x - v.width / 2,
                            y: pan.y + center[1] / ratio - v.y - v.height / 2 });
                    }
                }
                finally { w.cameraPan.freeCamera.value = previous; }
                w.updateCamera(w.cameraPan.getPan(), zoom); update(); const points = project();
                const bounds = [Math.floor(Math.min(...points.map(p => p[0]))), Math.floor(Math.min(...points.map(p => p[1]))),
                    Math.ceil(Math.max(...points.map(p => p[0]))), Math.ceil(Math.max(...points.map(p => p[1])))];
                const margin = 24, crop = [bounds[0] - margin, bounds[1] - margin,
                    bounds[2] - bounds[0] + 2 * margin, bounds[3] - bounds[1] + 2 * margin];
                if (crop[0] < 0 || crop[1] < 0 || crop[0] + crop[2] > gl.domElement.width
                    || crop[1] + crop[3] > gl.domElement.height) throw Error('Complete turret reference exceeds viewport: '
                        + JSON.stringify({ crop, viewport: v, canvas: [gl.domElement.width, gl.domElement.height] }));
                const pivotScreen = pixel(r.turret.getWorldPosition(w.camera.position.clone()).project(w.camera));
                const pixelsPerLogicalUnit = (256 / 30) * v.height / (w.camera.top - w.camera.bottom) * zoom * ratio;
                const size = gl.getSize({ set(x, y) { this.x = x; this.y = y; return this; } });
                gl.setViewport(v.x, size.y - v.y - v.height, v.width, v.height);
                gl.clear(); gl.render(w.scene, w.camera);
                const canvas = document.createElement('canvas'); canvas.width = crop[2]; canvas.height = crop[3];
                const context = canvas.getContext('2d');
                context.drawImage(gl.domElement, ...crop, 0, 0, canvas.width, canvas.height);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                const occupied = [canvas.width, canvas.height, 0, 0]; let visiblePixels = 0;
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    if ([52, 72, 61].some((color, c) => Math.abs(pixels[i + c] - color) > 2)) {
                        visiblePixels++; occupied[0] = Math.min(occupied[0], x); occupied[1] = Math.min(occupied[1], y);
                        occupied[2] = Math.max(occupied[2], x + 1); occupied[3] = Math.max(occupied[3], y + 1);
                    }
                }
                if (visiblePixels < 100) throw Error('Native original turret reference is empty');
                const visibleBounds = occupied.map((value, i) => value + crop[i % 2]);
                frames.push({ bearing, crop, bounds, visibleBounds, visiblePixels, pivotScreen, pixelsPerLogicalUnit,
                    rendererPalette: referencePalette?.hash, ownerRedReference: ownerRed,
                    logicalPivotBounds: visibleBounds.map((value, index) => (value - pivotScreen[index % 2]) / pixelsPerLogicalUnit),
                    png: canvas.toDataURL('image/png'), glError: gl.getContext().getError() });
            }
        } finally {
            r.turretRot.rotation.copy(source.rotation); r.turretRot.updateMatrix();
            r.get3DObject().visible = source.rootVisible; r.turret.visible = source.turretVisible;
            r.turretBuilders.forEach((builder, i) => { if (ownerRed) builder.setPalette(palettes[i]); });
            for (const [object, value] of visible) object.visible = value;
            w.scene.background = source.background; gl.setClearColor(source.clear, source.alpha); update();
        }
        return frames;
    }, { ownerRed: process.argv.includes('--owner-red'), zoom: cameraZoom });
    for (const frame of captures) {
        assert.equal(frame.glError, 0); const file = `original-turret-${frame.bearing}.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
        delete frame.png; report.frames.push({ ...frame, file });
    }
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ORIGINAL_NATIVE_TURRET_EIGHT_REFERENCE_BEARINGS_NO_HD_QUALIFICATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
