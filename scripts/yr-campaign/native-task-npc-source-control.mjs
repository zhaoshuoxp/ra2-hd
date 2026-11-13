import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { openNpcSource } from './open-npc-source.mjs';

const [output, mission, identity] = process.argv.slice(2);
assert(['CAML', 'EINS', 'MUMY', 'RMNV', 'PENTGEN', 'DNOB'].includes(identity));
const out = path.resolve(output);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, identity, errors: [], failedResources: [],
    scope: 'Original-mode control of an original YR source NPC. A fresh mission or exactly verified '
        + 'ordinary-input checkpoint supplies the world. Optional source-arrival observation advances '
        + 'only original ticks with the existing original orders. '
        + 'Diagnostic reveal, frozen renderer and camera framing only. No actor creation, '
        + 'health, position, ownership, animation, rules, simulation state or mission result is assigned. '
        + 'This records the original source appearance and carries no HD artwork or gameplay credit.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density: 0 }));
    await openNpcSource(page, out, report, mission, identity);
    await page.evaluate(identity => {
        const d = window.__ra2debug, g = d.game;
        const actor = g.world.getAllObjects().find(actor => actor.name === identity
            && actor.isSpawned && !actor.isDestroyed);
        if (!actor) throw Error('Original source NPC absent: ' + identity);
        window.__originalNpcControl = actor;
        g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g); d.mapRenderable.shroudLayer?.update(0);
        d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
    }, identity);
    report.before = await worldState(page);
    report.control = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldScene, actor = window.__originalNpcControl;
        const r = d.renderableManager.getRenderableByGameObject(actor);
        if (!r) throw Error('Original source NPC renderable absent');
        const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
        try { d.worldInteraction.minimapHandler.panToTile(actor.tile); }
        finally { free.value = previous; }
        w.cameraZoom.zoom = w.lastCameraZoom = 1; w.camera.zoom = 1; w.camera.updateProjectionMatrix();
        w.updateCamera(w.cameraPan.getPan(), 1);
        d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
        const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
        try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
        w.meshBatchManager.updateMeshes(); d.renderer.render();
        const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
        const width = Math.min(1000, Math.floor(v.width*ratio));
        const height = Math.min(800, Math.floor(v.height*ratio));
        const x = Math.floor((v.x+v.width/2)*ratio-width/2);
        const y = Math.floor((v.y+v.height/2)*ratio-height/2);
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(gl.domElement,x,y,width,height,0,0,width,height);
        const describe = object => object && Object.fromEntries(Object.keys(object)
            .filter(key => /frame|anim|shp|image|builder|body/i.test(key)).map(key => {
                const value = object[key];
                return [key, value && typeof value === 'object'
                    ? { type: value.constructor?.name, keys: Object.keys(value).slice(0,12),
                        frameNo: value.frameNo, filename: value.filename }
                    : typeof value === 'function' ? 'function' : value];
            }));
        return { actor: actor.id, tile: [actor.tile.rx,actor.tile.ry], direction: actor.direction,
            health: actor.healthTrait?.health, noShadow: actor.rules.noShadow,
            hdEnabled: d.generalOptions.graphics.hdEnabled.value,
            renderable: { type: r.constructor.name, properties: describe(r) },
            shp: { type: r.shpRenderable?.constructor.name, properties: describe(r.shpRenderable) },
            glError: gl.getContext().getError(), crop: [x,y,width,height], png: canvas.toDataURL('image/png') };
    });
    assert.equal(report.control.hdEnabled, false); assert.equal(report.control.glError, 0);
    await fs.writeFile(path.join(out, 'original-npc-world.png'),
        Buffer.from(report.control.png.split(',')[1], 'base64')); delete report.control.png;
    await page.screenshot({ path: path.join(out, 'original-context.png') });
    report.after = await worldState(page); assert.deepEqual(report.after, report.before);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_ORIGINAL_SOURCE_NPC_CONTROL_FROZEN_WORLD_NO_HD_CREDIT';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report,null,2)+'\n'); await app?.close();
}
console.log(JSON.stringify({status:report.status,error:report.error,out}));
