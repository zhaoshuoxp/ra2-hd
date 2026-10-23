import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function validateMissilePose(page, report, out) {
    report.missilePose = { poses: [] };
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        for (const u of g.getWorld().getAllObjects()) u.attackTrait?.setDisabled(true);
        g.mapShroudTrait.revealMap(d.localPlayer, g);
    });
    report.missilePose.flights = [];
    for (const launcher of ['V3', 'DRED']) {
        await page.evaluate(launcher => {
            const d = window.__ra2debug, g = d.game, owner = d.localPlayer;
            const enemy = g.getCombatants().find(p => p !== owner);
            const base = owner.getOwnedObjects().find(u => u.rules.constructionYard);
            const rules = g.rules.getObject(launcher, 7), targetRules = g.rules.getObject('SMCV', 7);
            const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t)
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()));
            const passable = (t, rule) => g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0;
            const origins = tiles.filter(t => passable(t, rules));
            origins.sort((a,b) => Math.hypot(a.rx-base.tile.rx,a.ry-base.tile.ry) - Math.hypot(b.rx-base.tile.rx,b.ry-base.tile.ry));
            const origin = origins.find(t => tiles.some(s => passable(s, targetRules) && Math.hypot(s.rx-t.rx,s.ry-t.ry) < 12));
            const destinations = tiles.filter(t => passable(t, targetRules));
            destinations.sort((a,b) => Math.abs(Math.hypot(a.rx-origin.rx,a.ry-origin.ry)-10)
                - Math.abs(Math.hypot(b.rx-origin.rx,b.ry-origin.ry)-10));
            const u = g.createUnitForPlayer(rules, owner), target = g.createUnitForPlayer(targetRules, enemy);
            g.spawnObject(u, origin); g.spawnObject(target, destinations[0]); target.attackTrait?.setDisabled(true);
            window.missileFlight = {u, target, healthBefore:target.healthTrait.health, samples:[]};
            const stream = d.renderer.renderer.domElement.captureStream(20);
            const recorder = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp9', videoBitsPerSecond:6000000});
            window.missileRecording = {stream, recorder, chunks:[]};
            recorder.ondataavailable = e => { if (e.data.size) window.missileRecording.chunks.push(e.data); };
            recorder.start();
            window.missileFlightTimer = setInterval(() => {
                for (const m of g.getWorld().getAllObjects().filter(m => m.name === u.rules.spawns && m.zone === 1)) {
                    const r = d.renderableManager.getRenderableByGameObject(m);
                    const layer = r?.unitVxlHd?.layers.flatMap(p => p.frames).find(f => f.batch.visible);
                    let axisAgreement, longitudinalError;
                    if (layer) {
                        const axis = r.posObj.position.clone().set(1,0,0)
                            .transformDirection(r.posObj.matrix.clone().fromArray(layer.frame.referenceLinear));
                        const native = r.posObj.position.clone().set(0,0,-1).transformDirection(r.tiltObj.matrix);
                        axisAgreement = axis.clone().transformDirection(layer.batch.matrix).dot(native);
                        const p = layer.source.geometry.getAttribute('position');
                        const a = r.posObj.position.clone().fromBufferAttribute(p,0);
                        const b = r.posObj.position.clone().fromBufferAttribute(p,1).sub(a);
                        const c = r.posObj.position.clone().fromBufferAttribute(p,2).sub(a);
                        longitudinalError = Math.abs(b.cross(c).normalize().dot(axis));
                    }
                    window.missileFlight.samples.push({id:m.id, name:m.name, tick:g.currentTick, pitch:m.pitch, yaw:m.yaw,
                        velocity:m.moveTrait.velocity.toArray(), position:m.position.worldPosition.toArray(),
                        hd:r?.unitVxlHd?.active, rotation:r?.tiltObj.rotation.toArray(), axisAgreement, longitudinalError});
                }
            }, 30);
            d.worldScene.cameraPan.setPan(d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper
                .computeCameraPanFromTile(origin.rx, origin.ry));
            d.actionsApi.orderUnits([u.id], 2, target.id);
        }, launcher);
        await page.waitForFunction(() => window.missileFlight.samples.some(s => s.pitch < -40), undefined, {timeout:45000});
        await page.screenshot({path:path.join(out, `${launcher}-flight.png`)});
        await page.waitForFunction(() => window.missileFlight.target.healthTrait.health < window.missileFlight.healthBefore, undefined, {timeout:15000});
        const flight = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.missileFlight;
            clearInterval(window.missileFlightTimer);
            f.u.attackTrait.setDisabled(true); f.u.unitOrderTrait.clearOrders(); f.u.unitOrderTrait.cancelAllTasks();
            return {launcher:f.u.name, samples:f.samples, healthBefore:f.healthBefore, healthAfter:f.target.healthTrait.health};
        });
        report.missilePose.flights.push(flight);
        const video = await page.evaluate(() => new Promise(resolve => {
            const v = window.missileRecording;
            v.recorder.onstop = async () => {
                v.stream.getTracks().forEach(t => t.stop());
                const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(new Blob(v.chunks, {type:'video/webm'}));
            };
            v.recorder.stop();
        }));
        await fs.writeFile(path.join(out, `${launcher}-flight.webm`), Buffer.from(video.split(',')[1], 'base64'));
        assert(flight.samples.some(s => s.hd && s.pitch > 20), 'HD missile climbs');
        assert(flight.samples.some(s => s.hd && s.pitch < -40), 'HD missile dives');
        assert(flight.samples.every(s => Number.isFinite(s.pitch) && s.position.every(Number.isFinite)), 'Finite flight pose');
        assert(flight.samples.filter(s => s.hd).every(s => s.axisAgreement > .99999 && s.longitudinalError < .00001),
            'HD surface must contain the longitudinal axis and follow continuous native yaw/pitch');
        assert(flight.healthAfter < flight.healthBefore, 'Native missile damages its target');
    }
    report.missilePose.status = 'PASS_NATIVE_MISSILE_FLIGHTS';
    if (process.argv.includes('--missile-flight-only')) return;
    for (const id of ['V3ROCKET', 'DMISL']) {
        await page.evaluate(id => {
            const d = window.__ra2debug, g = d.game;
            const base = d.localPlayer.getOwnedObjects().find(u => u.rules.constructionYard);
            const u = g.createUnitForPlayer(g.rules.getObject(id, 1), d.localPlayer);
            const tile = g.map.tiles.getAll().find(t => t.rx === base.tile.rx + 8 && t.ry === base.tile.ry + 8);
            g.spawnObject(u, tile); u.position.tileElevation = 8; u.zone = 1;
            window.missilePoseUnit = u;
            d.worldScene.cameraPan.setPan(d.gameScreen.playerUi.worldInteraction.minimapHandler.mapPanningHelper
                .computeCameraPanFromTile(tile.rx, tile.ry));
        }, id);
        await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.missilePoseUnit)?.unitVxlHd?.active);
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        for (const yaw of [0, 90, 180, 270]) for (const pitch of [60, 0, -60]) {
            const shots = await page.evaluate(({yaw, pitch}) => {
                const d = window.__ra2debug, u = window.missilePoseUnit;
                const r = d.renderableManager.getRenderableByGameObject(u), hd = r.unitVxlHd;
                u.yaw = yaw; u.pitch = pitch;
                r.updateVxlRotation(); hd.update();
                d.worldScene.scene.updateMatrixWorld(true);
                const gl = d.renderer.renderer, v = d.worldScene.viewport;
                const ratio = gl.domElement.width / d.renderer.width;
                const origin = r.posObj.position.clone().set(0,0,0).applyMatrix4(r.posObj.matrixWorld).project(d.worldScene.camera);
                const x = (v.x + (origin.x + 1) * v.width / 2) * ratio;
                const y = (v.y + (1 - origin.y) * v.height / 2) * ratio;
                const shots = [];
                for (const mode of ['hd', 'original']) {
                    if (mode === 'original') {
                        hd.meshes.forEach((m,i) => m.material = hd.originals[i]);
                        for (const {frames} of hd.layers) for (const f of frames)
                            f.batch.visible = f.depth.visible = f.translucent.visible = false;
                    }
                    d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 240;
                    canvas.getContext('2d').drawImage(gl.domElement, Math.round(x-120), Math.round(y-120), 240,240,0,0,240,240);
                    shots.push({mode, png:canvas.toDataURL()});
                }
                hd.update();
                return shots;
            }, {yaw, pitch});
            for (const {mode, png} of shots) {
                const file = `${id}-${yaw}-${pitch}-${mode}.png`;
                await fs.writeFile(path.join(out,file), Buffer.from(png.split(',')[1], 'base64'));
                report.missilePose.poses.push({id,yaw,pitch,mode,file});
            }
        }
        await page.evaluate(() => {
            const d=window.__ra2debug; d.game.unspawnObject(window.missilePoseUnit);
            d.gameScreen.gameAnimationLoop.start();
        });
    }
    assert.equal(report.missilePose.poses.length, 48);
    report.missilePose.status = 'PASS_NATIVE_MISSILE_FLIGHTS_AND_POSE_CAPTURE';
}
