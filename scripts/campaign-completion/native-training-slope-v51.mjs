import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const density = Number(process.argv.find(value => value.startsWith('--density='))?.slice(10) ?? 4);
assert([2, 4].includes(density));
const report = { status: 'RUNNING', errors: [], failedResources: [], frames: [],
    scope: 'Original Training02 scripted MCV entry, without player orders. Direct turns only accelerate observation. The actual opening ramp is frozen and revealed for renderer inspection; no actor, tilt, source rule or objective is changed. Original/HD density and camera zoom are presentation-only.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, 'trn02t.map'));
    await waitWorld(page, 'trn02t.map');
    report.sourceRamp = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, old = c.restoring;
        let object; c.restoring = true;
        try {
            for (let turns = 0; turns < 5000 && !c.result; turns++) {
                object = g.world.getAllObjects().find(o => o.isSpawned && !o.isDestroyed && o.rules.deploysInto === 'GACNST'
                    && g.map.mapBounds.isWithinBounds(o.tile) && Math.abs(o.tilterTrait?.tilt.pitch ?? 0) > 1);
                if (object) break;
                g.update();
            }
        } finally { c.restoring = old; }
        if (!object) throw Error('Original opening MCV ramp state was not reached');
        window.__slopeActor = object; c.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.worldInteraction.minimapHandler.panToTile(object.tile); d.gameScreen.pointer.unlock(true);
        document.querySelector('[data-campaign-diagnostic]')?.remove();
        return { id: object.id, name: object.name, tick: g.currentTick, hash: g.getHash(),
            tile: [object.tile.rx, object.tile.ry], rampType: object.tile.rampType, tilt: object.tilterTrait.tilt };
    });
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__slopeActor)?.unitVxlHd?.active,
        undefined, { timeout: 30000 });
    const before = await worldState(page);
    for (const hd of [true, false]) {
        await page.evaluate(hd => {
            const d = window.__ra2debug;
            d.generalOptions.graphics.hdEnabled.value = hd;
            if (!hd) {
                const r = d.renderableManager.getRenderableByGameObject(window.__slopeActor);
                window.__slopeRendererType = r.unitVxlHd.constructor; window.__slopeFamily = r.unitVxlHd.family;
                r.unitVxlHd?.dispose(); r.unitVxlHd = undefined;
            }
        }, hd);
        await page.waitForTimeout(900);
        const frame = await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldScene, object = window.__slopeActor;
            const r = d.renderableManager.getRenderableByGameObject(object);
            const gl = d.renderer.renderer, v = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const center = w.camera.position.clone().setFromMatrixPosition(r.get3DObject().matrixWorld).project(w.camera);
            const x = Math.max(0, Math.min(gl.domElement.width - 640, Math.round((v.x + (center.x + 1) * v.width / 2) * ratio - 320)));
            const y = Math.max(0, Math.min(gl.domElement.height - 480, Math.round((v.y + (1 - center.y) * v.height / 2) * ratio - 240)));
            const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
            canvas.getContext('2d').drawImage(gl.domElement, x, y, 640, 480, 0, 0, 640, 480);
            return { hd: !!r.unitVxlHd?.active, tilt: object.tilterTrait.tilt, tick: d.game.currentTick,
                crop: [x, y, 640, 480], glError: gl.getContext().getError(), png: canvas.toDataURL('image/png') };
        });
        assert.equal(frame.hd, hd); assert.equal(frame.glError, 0);
        const file = hd ? `native-mcv-ramp-${density}x.png` : 'native-mcv-ramp-original.png';
        await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
        delete frame.png; report.frames.push({ ...frame, file });
    }
    assert.deepEqual(await worldState(page), before); report.worldTickRngTeamsUnchanged = true;
    report.levelReturn = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, c = g.campaign, object = window.__slopeActor, restoring = c.restoring;
        d.generalOptions.graphics.hdEnabled.value = true; c.restoring = true;
        try {
            while (g.currentTick < 1200 && Math.abs(object.tilterTrait.tilt.pitch) > .01) g.update();
        } finally { c.restoring = restoring; }
        const r = d.renderableManager.getRenderableByGameObject(object);
        r.unitVxlHd = new window.__slopeRendererType(r, window.__slopeFamily, r.camera);
        return { tick: g.currentTick, tile: [object.tile.rx, object.tile.ry], tilt: object.tilterTrait.tilt, hash: g.getHash() };
    });
    assert(Math.abs(report.levelReturn.tilt.pitch) <= .01);
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__slopeActor)?.unitVxlHd?.active);
    await page.waitForTimeout(300);
    report.levelReturn.geometry = await page.evaluate(() => {
        const r = window.__ra2debug.renderableManager.getRenderableByGameObject(window.__slopeActor);
        const frames = r.unitVxlHd.layers.flatMap(layer => layer.frames).filter(frame => frame.levelPositions);
        return { frames: frames.length, exactOriginalLevelPositions: frames.every(frame =>
            frame.source.geometry.getAttribute('position').array.every((value, index) => value === frame.levelPositions[index])) };
    });
    assert(report.levelReturn.geometry.frames > 0 && report.levelReturn.geometry.exactOriginalLevelPositions);
    await page.screenshot({ path: path.join(out, `native-mcv-after-ramp-${density}x.png`) });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ORIGINAL_MCV_RAMP_OBSERVATION_AND_DENSITY_COMPARISON';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
