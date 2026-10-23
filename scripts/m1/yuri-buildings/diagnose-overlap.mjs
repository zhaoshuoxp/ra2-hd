// Same-frame native layer and heading diagnostics in an isolated runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../allied-units/desktop-session.mjs';
const session = await startSession(process.argv[2], process.argv[3], 'yr', false,
    async ({ page }) => page.evaluate(density => { window.__ra2debug.generalOptions.graphics.hdDensity.value = density; }, process.argv.includes('--2x') ? 2 : 4),
    async ({ page }) => page.evaluate(() => {
        const s = window.__ra2debug.mainMenuController.getCurrentScreen(), form = s.buildFormProps();
        form.onCountrySelect('YuriCountry', 0);
    }));
const { page, out, report, stage: saveStage, close } = session;
const stage = async name => {
    await page.evaluate(() => {
        const d = window.__ra2debug; d.worldScene.scene.updateMatrixWorld(false);
        d.worldScene.meshBatchManager?.updateMeshes(); d.renderer.render();
    });
    await saveStage(name);
};
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.building = (name, near = f.center) => {
            const worker = d.game.getConstructionWorker(f.player);
            const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                && worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - near.rx, a.ry - near.ry) - Math.hypot(b.rx - near.rx, b.ry - near.ry))[0];
            if (!tile) throw Error('No legal construction fixture: ' + name);
            const u = worker.placeAt(name, tile, true)[0]; f.actors[u.id] = u; return u;
        };
        for (let i = 0; i < 4; i++) f.building('YAPOWR', { rx: f.center.rx - 22, ry: f.center.ry - 22 });
        f.detailSize = [640, 540];
        f.gun = f.building('YAGGUN', { rx: f.center.rx + 10, ry: f.center.ry + 10 });
        f.bunker = f.building('NATBNK', { rx: f.center.rx - 10, ry: f.center.ry + 10 });
        f.focus = u => { f.actor = u; d.worldInteraction.minimapHandler.panToTile(u.tile); };
        f.gun.attackTrait.setDisabled(true);
        f.tank = f.spawn('LTNK', 7, f.bunker.tile); d.actionsApi.orderUnits([f.tank.id], 8, f.bunker.id);
    });
    await page.waitForFunction(() => {
        const d = window.__ra2debug, f = window.__allied;
        return d.renderableManager.getRenderableByGameObject(f.gun)?.buildingTurretHd && f.bunker.buildStatus === 1;
    }, undefined, { timeout: 45000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        d.actionsApi.orderUnits([f.tank.id], 8, f.bunker.id);
    });
    await page.waitForFunction(() => !!window.__allied.bunker.bunkerTrait.unit, undefined, { timeout: 30000 });
    await page.waitForTimeout(2500);
    report.geometry = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const inspect = u => {
            const r = d.renderableManager.getRenderableByGameObject(u);
            const describe = o => {
                if (!o) return;
                const meshes = []; o.updateMatrixWorld(true); o.traverse(m => {
                    if (m.geometry) meshes.push({ name: m.name, flat: m.userData?.flat, renderOrder: m.renderOrder,
                        matrix: m.matrixWorld.elements, visible: m.visible, material: m.material.type,
                        depthWrite: m.material.depthWrite, transparent: m.material.transparent,
                        positions: [...m.geometry.attributes.position.array].slice(0, 24),
                        uv: [...(m.geometry.attributes.uv?.array ?? [])].slice(0, 16) });
                }); return meshes;
            };
            return { name: u.name, direction: u.direction, worldPosition: u.position.worldPosition,
                main: describe(r.mainObj?.get3DObject?.() ?? r.mainObj), bib: describe(r.bib?.get3DObject()),
                turret: describe(r.turret), animations: r.animObjects && [...r.animObjects].map(([type, a]) => ({ type, objects: a.map(o => describe(o.get3DObject())) })) };
        };
        return { theater: d.theater.type, gun: inspect(f.gun), bunker: inspect(f.bunker), tank: inspect(f.tank) };
    });
    await page.evaluate(() => window.__allied.focus(window.__allied.gun));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    for (let heading = 0; heading < 360; heading += 45) {
        await page.evaluate(heading => { const d = window.__ra2debug, f = window.__allied;
            f.gun.turretTrait.facing = heading; const r = d.renderableManager.getRenderableByGameObject(f.gun); r.update(0); }, heading);
        await stage('Gatling-' + heading);
        if (process.argv.includes('--native-parts')) {
            await page.evaluate(() => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__allied.gun);
                const hd = r.buildingTurretHd;
                for (const pair of hd.meshes.values()) for (const mesh of pair) mesh.visible = false;
                hd.originals.forEach((mesh, i) => mesh.material = hd.materials[i]);
            });
            await stage('Gatling-native-' + heading);
        }
    }
    await page.evaluate(() => { window.__ra2debug.gameScreen.gameAnimationLoop.start(); window.__allied.focus(window.__allied.bunker); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    await stage('Bunker-complete');
    for (const layer of ['front', 'rear', 'bib', 'all-walls']) {
        await page.evaluate(layer => {
            const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.bunker);
            const walls = r.animObjects.get(3) ?? [];
            if (walls.length < 2) throw Error('Missing native front/rear bunker wall members');
            f.hidden = [];
            const objects = layer === 'bib' ? [r.bib.get3DObject()]
                : layer === 'all-walls' ? walls.map(o => o.get3DObject())
                : [walls[layer === 'front' ? 0 : 1]?.get3DObject()].filter(Boolean);
            for (const o of objects) { f.hidden.push([o, o.visible]); o.visible = false; }
        }, layer);
        await stage('Bunker-without-' + layer);
        await page.evaluate(() => { for (const [o, v] of window.__allied.hidden) o.visible = v; });
    }
    report.bunkerLayers = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.bunker);
        return r.animObjects.get(3).map(o => ({ visible: o.get3DObject().visible,
            frame: o.builder.getFrame(), geometry: o.getShapeMesh().geometry.uuid }));
    });
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.tankRoot = d.renderableManager.getRenderableByGameObject(f.bunker.bunkerTrait.unit).get3DObject();
        f.tankRoot.visible = false;
    });
    await stage('Bunker-wall-without-tank');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.bunker);
        f.rearMaterial = r.animObjects.get(3)[1].getShapeMesh().material;
        f.rearDepthTest = f.rearMaterial.depthTest;
        f.rearMaterial.depthTest = false;
    });
    await stage('Bunker-wall-depth-disabled-diagnostic');
    await page.evaluate(() => {
        const f = window.__allied; f.rearMaterial.depthTest = f.rearDepthTest;
    });
    await page.evaluate(() => window.__allied.tankRoot.visible = true);
    if (process.argv.includes('--calibrate')) for (const height of [32, 64, 96, 128, 192]) {
        await page.evaluate(height => {
            const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.bunker);
            const wall = r.animObjects.get(3)[1].getShapeMesh(), pos = wall.geometry.attributes.position;
            const axis = d.worldScene.camera.matrixWorld.elements.slice(8, 11), inverse = wall.matrixWorld.clone().invert();
            const point = wall.position.clone();
            for (let i = 0; i < pos.count; i++) {
                point.fromBufferAttribute(pos, i).applyMatrix4(wall.matrixWorld);
                const shift = (f.bunker.position.worldPosition.y + height - point.y) / axis[1];
                point.x += axis[0] * shift; point.y += axis[1] * shift; point.z += axis[2] * shift;
                point.applyMatrix4(inverse); pos.setXYZ(i, point.x, point.y, point.z);
            }
            pos.needsUpdate = true; wall.geometry.computeBoundingSphere();
        }, height);
        await stage('Bunker-deck-' + height);
    }
    report.status = 'DIAGNOSED_R4_NATIVE_LAYERS';
} catch (e) { failure = e; report.failure = e.stack; }
await fs.writeFile(path.join(out, 'diagnostics.json'), JSON.stringify(report, null, 2) + '\n');
await close(failure);
if (failure) throw failure;
