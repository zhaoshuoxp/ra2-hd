import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function recordRhinoStateMovement(page, output) {
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        s.unit.traits.remove(s.unit.cloakableTrait);
        s.unit.cloakableTrait.dispose();
        s.unit.cloakableTrait = undefined;
        s.unit.invulnerableTrait.timer.reset();
        s.unit.warpedOutTrait.expire(d.game);
        s.r.rockingStartTime = undefined;
        s.r.rockingTiltObj.position.set(0, 0, 0);
        s.r.rockingTiltObj.rotation.set(0, 0, 0);
        s.r.rockingTiltObj.updateMatrix();
        s.time = performance.now();
        s.move(s.ramps[1]);
        s.capture(true, false);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d'), source = d.renderer.renderer.domElement, chunks = [];
        const rec = new MediaRecorder(canvas.captureStream(20), { mimeType: 'video/webm;codecs=vp9' });
        rec.ondataavailable = e => chunks.push(e.data);
        s.movement = { trace: [], on: true, phase: 'ramp', rec, stop: () => new Promise(resolve => { rec.onstop = () => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); }; rec.stop(); }) };
        const draw = () => {
            if (!s.movement.on)
                return;
            const c = d.worldScene.camera, v = d.worldScene.viewport, p = s.r.getPosition().clone().project(c), l = [Number(source.dataset.logicalWidth), Number(source.dataset.logicalHeight)];
            const x = Math.round((v.x + (p.x + 1) * v.width / 2) * source.width / l[0] - 320), y = Math.round((v.y + (1 - p.y) * v.height / 2) * source.height / l[1] - 180);
            ctx.drawImage(source, x, y, 640, 360, 0, 0, 640, 360);
            s.movement.trace.push({ phase: s.movement.phase, tick: d.game.currentTick, moving: s.unit.isMoving, tile: [s.unit.tile.rx, s.unit.tile.ry], ramp: s.unit.tile.rampType,
                onBridge: s.unit.onBridge, elevation: s.unit.tileElevation, active: s.r.rhinoHd.active, pose: s.r.rhinoHd.pose.toArray(), gl: d.renderer.renderer.getContext().getError() });
            requestAnimationFrame(draw);
        };
        draw();
        rec.start();
        const tile = d.game.map.tiles.getByMapCoords(s.unit.tile.rx, s.unit.tile.ry + 4);
        s.movement.rampTarget = [tile.rx, tile.ry];
        d.actionsApi.orderUnits([s.unit.id], 0, tile.rx, tile.ry);
        d.gameScreen.gameAnimationLoop.start();
    });
    await page.waitForTimeout(4500);
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        d.actionsApi.orderUnits([s.unit.id], 11);
        d.gameScreen.gameAnimationLoop.stop();
        s.move(s.high, d.game.map.tileOccupation.getBridgeOnTile(s.high));
        s.movement.phase = 'bridge';
        const tiles = d.game.map.tiles.getAll().filter(t => d.game.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge() && Math.hypot(t.rx - s.high.rx, t.ry - s.high.ry) > 3 && Math.hypot(t.rx - s.high.rx, t.ry - s.high.ry) < 7);
        const tile = tiles[0];
        if (!tile)
            throw Error('No bridge route');
        s.movement.bridgeTarget = [tile.rx, tile.ry];
        d.actionsApi.orderUnits([s.unit.id], 0, tile.rx, tile.ry);
        d.gameScreen.gameAnimationLoop.start();
    });
    await page.waitForTimeout(4500);
    const result = await page.evaluate(async () => {
        const d = window.__ra2debug, s = window.__states;
        s.movement.on = false;
        const data = await s.movement.stop();
        d.actionsApi.orderUnits([s.unit.id], 11);
        d.gameScreen.gameAnimationLoop.stop();
        s.unit.moveTrait.teleportUnitToTile(s.flat, undefined, false, false, d.game);
        s.time = performance.now();
        s.move(s.flat);
        return { data, trace: s.movement.trace, rampTarget: s.movement.rampTarget, bridgeTarget: s.movement.bridgeTarget };
    });
    await fs.writeFile(`${output}/movement.webm`, Buffer.from(result.data.split(',')[1], 'base64'));
    delete result.data;
    await fs.writeFile(`${output}/movement.json`, JSON.stringify(result, null, 2));
    assert(result.trace.some(r => r.phase === 'ramp' && r.moving && r.ramp));
    assert(result.trace.some(r => r.phase === 'bridge' && r.moving && r.onBridge));
    assert(result.trace.every(r => r.active && r.gl === 0));
    return { samples: result.trace.length, rampMoving: result.trace.filter(r => r.phase === 'ramp' && r.moving && r.ramp).length,
        bridgeMoving: result.trace.filter(r => r.phase === 'bridge' && r.moving && r.onBridge).length };
}
