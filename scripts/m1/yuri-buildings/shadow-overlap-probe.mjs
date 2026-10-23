// Frozen native actor/ground coverage comparison. Only the fixture shadow's
// placement is exaggerated to make body overlap measurable at both densities.
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../allied-units/desktop-session.mjs';
const density = process.argv.includes('--2x') ? 2 : 4, original = process.argv.includes('--original');
const session = await startSession(process.argv[2], process.argv[3], 'yr', false,
    async ({ page }) => page.evaluate(({ density, original }) => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdDensity.value = density; g.hdEnabled.value = !original;
    }, { density, original }), async ({ page }) => page.evaluate(() => {
        window.__ra2debug.mainMenuController.getCurrentScreen().buildFormProps().onCountrySelect('YuriCountry', 0);
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
        const d = window.__ra2debug, f = window.__allied, worker = d.game.getConstructionWorker(f.player);
        const name = 'YABRCK';
        const tile = d.game.map.tiles.getAll().filter(t => worker.canPlaceAt(name, t,
            { normalizedTile: true, ignoreAdjacent: true })).sort((a, b) =>
            Math.hypot(a.rx-f.center.rx, a.ry-f.center.ry)-Math.hypot(b.rx-f.center.rx, b.ry-f.center.ry))[0];
        const powerTile = d.game.map.tiles.getAll().find(t => worker.canPlaceAt('YAPOWR', t, { normalizedTile: true, ignoreAdjacent: true }));
        f.power = worker.placeAt('YAPOWR', powerTile, true)[0];
        f.gun = worker.placeAt(name, tile, true)[0]; f.actors[f.gun.id] = f.gun;
        f.actor = f.gun; f.detailSize = [640, 540]; f.gun.attackTrait?.setDisabled(true);
        d.worldInteraction.minimapHandler.panToTile(f.gun.tile);
    });
    await page.waitForFunction(() => window.__allied.gun.buildStatus === 1 && window.__allied.power.buildStatus === 1);
    await page.waitForTimeout(2000);
    report.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, r = d.renderableManager.getRenderableByGameObject(f.gun);
        d.gameScreen.gameAnimationLoop.stop();
        const power = d.renderableManager.getRenderableByGameObject(f.power);
        const candidates = [];
        power.get3DObject().traverseVisible(m => {
            if (m.geometry && m.material?.type === 'ShpShadowMaterial') {
                m.geometry.computeBoundingBox();
                const box = m.geometry.boundingBox;
                candidates.push({ mesh: m, area: (box.max.x-box.min.x)*(box.max.z-box.min.z) });
            }
        });
        const source = candidates.sort((a,b) => b.area-a.area)[0]?.mesh;
        if (!source?.visible) throw Error('Fixture native shadow is empty');
        const shadow = source.clone(false);
        shadow.isBatchedMesh = false; shadow.layers.set(0); shadow.frustumCulled = false;
        shadow.material = source.material.clone(); shadow.material.opacity = .5;
        source.updateWorldMatrix(true, false);
        shadow.geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        shadow.geometry.computeBoundingBox();
        const center = shadow.geometry.boundingBox.getCenter(source.position.clone()), p = r.getPosition();
        const v = shadow.geometry.attributes.position;
        for (let i = 0; i < v.count; i++) v.setXYZ(i,
            (v.getX(i)-center.x)*5+p.x, p.y + .01, (v.getZ(i)-center.z)*5+p.z);
        v.needsUpdate = true; shadow.geometry.computeBoundingSphere();
        shadow.position.set(0,0,0); shadow.rotation.set(0,0,0); shadow.scale.set(1,1,1); shadow.updateMatrix();
        shadow.visible = false; d.worldScene.scene.add(shadow); shadow.updateWorldMatrix(true, false);
        f.shadow = shadow; f.root = r.get3DObject(); source.visible = false;
        f.root.traverse(m => {
            if (m.geometry && (m.material?.type === 'ShpShadowMaterial' || m.material?.type === 'ShadowMaterial'))
                m.visible = false;
            m.castShadow = false;
        });
        return { material: shadow.material.type, order: shadow.renderOrder, depthWrite: shadow.material.depthWrite,
            transparent: shadow.material.transparent, sourceArea: candidates[0].area, sourceOpacity: source.opacity, hd: !!r.mainObj.builder.hdOverride };
    });
    for (const [name, actor, shadow] of [['actor-clear',true,false],['actor-shadow',true,true],
        ['ground-clear',false,false],['ground-shadow',false,true]]) {
        await page.evaluate(({ actor, shadow }) => {
            window.__allied.root.visible = actor; window.__allied.shadow.visible = shadow;
        }, { actor, shadow });
        await stage(name);
    }
    report.density = density; report.original = original;
} catch (e) { failure = e; report.failure = e.stack; }
await close(failure);
if (failure) throw failure;
console.log(path.join(out, 'report.json'));
