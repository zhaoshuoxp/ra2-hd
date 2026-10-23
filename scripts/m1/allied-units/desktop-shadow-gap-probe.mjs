import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';
const s = await startSession(process.argv[2], process.argv[3]);
let failure;
try {
    await s.page.evaluate(name => {
        const d = window.__ra2debug, f = window.__allied;
        f.actor = f.spawn(name, 7, {rx:f.center.rx+7,ry:f.center.ry});
        f.control = f.spawn('HTNK', 7);
        f.airport = f.building('GAAIRC', {rx:f.center.rx+12,ry:f.center.ry});
        f.soviet = f.building('NAWEAP', {rx:f.center.rx+18,ry:f.center.ry});
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
    }, process.argv.find(a => a.startsWith('--actor='))?.split('=')[1] ?? 'AMCV');
    await s.page.waitForTimeout(5000);
    s.report.buildings = await s.page.evaluate(() => {
        const d=window.__ra2debug,f=window.__allied;
        return [f.airport,f.soviet].map(u=>{
            const r=d.renderableManager.getRenderableByGameObject(u);
            return {name:u.name,shapes:[r.mainObj,r.bib,...[...r.animObjects.values()].flat()].filter(Boolean).map(s=>{
                const b=s.builder,m=s.getShapeMesh?.()?.material;
                return {hd:!!b?.hdOverride,smoothCoverage:b?.smoothCoverage,material:m?.type,minFootprint:m?.uniforms?.hdMinFootprint?.value,pass:m?.uniforms?.hdPass?.value,minFilter:m?.map?.minFilter,magFilter:m?.map?.magFilter,depthWrite:m?.depthWrite};
            })};
        });
    });
    await s.page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
    s.report.variants = [];
    for (const variant of ['baseline', 'legacy-mask', 'no-native-depth', 'no-hd-depth', 'no-shadow', 'restore']) {
        const result = await s.page.evaluate(variant => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.actor), h = r.unitVxlHd;
            h.update();
            for (const m of h.meshes) m.castShadow = variant !== 'no-shadow';
            for (const m of h.shadowOccluders) {
                if (variant === 'no-native-depth') m.visible = false;
                else if (variant === 'legacy-mask') m.visible = undefined;
            }
            for (const l of h.layers) for (const frame of l.frames) {
                if (variant === 'no-hd-depth') { frame.depth.visible = false; frame.batch.material.depthWrite = false; }
                else frame.batch.material.depthWrite = true;
            }
            d.worldScene.scene.updateMatrixWorld(true); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
            const gl = d.renderer.renderer, c = gl.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio, y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const crop = document.createElement('canvas'); crop.width = 640; crop.height = 420;
            crop.getContext('2d').drawImage(c, Math.round(x - 320), Math.round(y - 250), 640, 420, 0, 0, 640, 420);
            return { variant, png: crop.toDataURL(), occluders: h.shadowOccluders.map(m => m.visible),
                meshes: h.meshes.map(m => ({type:m.type,batched:m.isBatchedMesh,depthWrite:m.material.depthWrite,castShadow:m.castShadow})) };
        }, variant);
        await fs.writeFile(path.join(s.out, variant + '.png'), Buffer.from(result.png.split(',')[1], 'base64'));
        delete result.png; s.report.variants.push(result);
    }
    if (process.argv.includes('--expect-fixed')) {
        const baseline = await fs.readFile(path.join(s.out, 'baseline.png'));
        const disabled = await fs.readFile(path.join(s.out, 'no-native-depth.png'));
        if (!baseline.equals(disabled)) throw Error('Ground/water still draws the bridge-only depth mask');
        if (!s.report.variants.find(v => v.variant === 'baseline').occluders.every(v => v === false))
            throw Error('Depth-mask visibility must be an explicit false');
    }

} catch (e) { failure = e; console.error(e); }
await s.close(failure);
if (failure) process.exitCode = 1;
