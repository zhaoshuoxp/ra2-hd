import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]);
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 4);
assert([0, 2, 4].includes(density));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], density,
    scope: 'Fresh-session Original/2X/4X Training02 terrain comparison. Original map and scripted MCV approach; accelerated direct turns and frozen revealed camera are inspection assistance only.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(() => {
        const controller = window.__ra2debug.mainMenuController.screens.get(22).rootController;
        const go = controller.goToScreen.bind(controller);
        controller.goToScreen = (screen, params) => {
            if (params?.gameOpts?.campaign?.mission === 'trn02t.map') {
                params.timestamp = 1700000000000; params.gameId = 'native-training-terrain-v52';
            }
            return go(screen, params);
        };
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'trn02t.map'));
    await waitWorld(page, 'trn02t.map');
    report.sourceRamp = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, old = c.restoring;
        let object; c.restoring = true;
        try {
            while (g.currentTick < 5000 && !c.result) {
                object = g.world.getAllObjects().find(o => o.isSpawned && !o.isDestroyed && o.rules.deploysInto === 'GACNST'
                    && g.map.mapBounds.isWithinBounds(o.tile) && Math.abs(o.tilterTrait?.tilt.pitch ?? 0) > 1);
                if (object) break;
                g.update();
            }
        } finally { c.restoring = old; }
        if (!object) throw Error('Original MCV approach did not reach the opening ramp');
        window.__slopeActor = object; c.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.worldInteraction.minimapHandler.panToTile(object.tile); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        const terrain = d.theater ?? d.gameScreen.theater ?? d.renderableManager.theater;
        const tiles = g.map.tiles.getAll().filter(t => Math.abs(t.rx - object.tile.rx) < 6 && Math.abs(t.ry - object.tile.ry) < 6);
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), tile: [object.tile.rx, object.tile.ry],
            terrainKeys: Object.keys(terrain ?? {}), debugKeys: Object.keys(d),
            tiles: tiles.map(t => ({ x: t.rx, y: t.ry, z: t.z, tileNum: t.tileNum, subTile: t.subTile, rampType: t.rampType,
                files: terrain?.tileSets?.getTile(t.tileNum)?.files?.map(f => ({ file: f.filename,
                    image: f.images[t.subTile] && { x: f.images[t.subTile].x, y: f.images[t.subTile].y,
                        width: f.images[t.subTile].width, height: f.images[t.subTile].height, rampType: f.images[t.subTile].rampType } })) })),
            hd: terrain?.terrainHd?.report };
    });
    if (density) assert.equal(report.sourceRamp.hd.groups.find(g => g.id === 'road-representative')?.status, 'PUBLISHED');
    else assert.equal(report.sourceRamp.hd.gpuBytes, 0);
    if (density) await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__slopeActor)?.unitVxlHd?.active);
    const before = await worldState(page);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, 'native-opening-ramp.png') });
    const frame = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__slopeActor);
        const gl = d.renderer.renderer, w = d.worldScene, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
        const center = w.camera.position.clone().setFromMatrixPosition(r.get3DObject().matrixWorld).project(w.camera);
        const x = Math.max(0, Math.min(gl.domElement.width - 800, Math.round((v.x + (center.x + 1) * v.width / 2) * ratio - 400)));
        const y = Math.max(0, Math.min(gl.domElement.height - 600, Math.round((v.y + (1 - center.y) * v.height / 2) * ratio - 300)));
        const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
        canvas.getContext('2d').drawImage(gl.domElement, x, y, 800, 600, 0, 0, 800, 600);
        return { crop: [x, y, 800, 600], glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
    });
    await fs.writeFile(path.join(out, 'native-opening-ramp-crop.png'), Buffer.from(frame.png.split(',')[1], 'base64'));
    delete frame.png; report.frame = frame;
    assert.deepEqual(await worldState(page), before); report.worldUnchangedDuringObservation = true;
    assert.equal(frame.glError, 0); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_SOURCE_TERRAIN_OBSERVATION';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
