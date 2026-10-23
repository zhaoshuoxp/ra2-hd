import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function checkRhinoStates(page, output) {
    const info = await page.evaluate(() => {
        const d = window.__ra2debug, rule = d.game.rules.getObject('HTNK', 7);
        d.gameScreen.gameAnimationLoop.stop();
        const tiles = d.game.map.tiles.getAll(), home = d.localPlayer.getOwnedObjects()[0].tile;
        const legal = t => !d.game.map.tileOccupation.getObjectsOnTile(t).length && d.game.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0;
        const flat = tiles.filter(t => !t.rampType && legal(t) && Math.hypot(t.rx - home.rx, t.ry - home.ry) > 6).sort((a, b) => Math.hypot(a.rx - home.rx, a.ry - home.ry) - Math.hypot(b.rx - home.rx, b.ry - home.ry))[0];
        const ramps = [1, 2, 3, 4].map(type => tiles.filter(t => t.rampType === type && legal(t) && tiles.filter(n => n.rampType === type && Math.abs(n.rx - t.rx) <= 1 && Math.abs(n.ry - t.ry) <= 1).length >= 3).sort((a, b) => Math.hypot(a.rx - home.rx, a.ry - home.ry) - Math.hypot(b.rx - home.rx, b.ry - home.ry))[0]).filter(Boolean);
        const high = tiles.find(t => d.game.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge());
        const low = tiles.find(t => d.game.map.tileOccupation.getBridgeOnTile(t)?.isLowBridge());
        const unit = d.game.createUnitForPlayer(rule, d.localPlayer);
        d.game.spawnObject(unit, flat);
        d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
        window.__states = { unit, flat, ramps, high, low, time: performance.now() };
        d.worldInteraction.minimapHandler.panToTile(flat);
        d.gameScreen.gameAnimationLoop.start();
        return { flat, ramps, high, low, bridgeCount: tiles.filter(t => d.game.map.tileOccupation.getBridgeOnTile(t)).length,
            fixture: 'Explicit local placement on real retail map tiles, native traits and renderer; no rule or renderer injection' };
    });
    await fs.writeFile(`${output}/map.json`, JSON.stringify(info, null, 2));
    console.log('MAP', JSON.stringify(info));
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        d.gameScreen.gameAnimationLoop.stop();
        s.r = d.renderableManager.getRenderableByGameObject(s.unit);
        s.unit.direction = 0;
        s.unit.turretTrait.facing = 90;
        s.unit.turretTrait.desiredFacing = 90;
        s.move = (tile, bridge) => {
            s.unit.moveTrait.teleportUnitToTile(tile, bridge, false, false, d.game);
            s.unit.direction = 0;
            s.unit.turretTrait.facing = 90;
            s.r.setPosition(s.unit.position.worldPosition);
            d.worldInteraction.minimapHandler.panToTile(tile);
        };
        s.capture = (enabled, png = true) => {
            d.generalOptions.graphics.rhinoHd.value = enabled;
            s.r.update(s.time, 0);
            d.worldScene.update(s.time, 0);
            d.worldScene.scene.updateMatrixWorld(true);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.renderer.render();
            const canvas = d.renderer.renderer.domElement, rect = canvas.getBoundingClientRect(), c = d.worldScene.camera, v = d.worldScene.viewport;
            const p = s.r.getPosition().clone().project(c), logical = [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)];
            const hd = s.r.rhinoHd;
            return { png: png ? canvas.toDataURL() : undefined, active: hd.active, buffer: [canvas.width, canvas.height], logical, css: [rect.width, rect.height],
                dpr: devicePixelRatio, ratio: d.renderer.renderer.getPixelRatio(), camera: { zoom: c.zoom, projection: c.projectionMatrix.toArray() },
                center: [(v.x + (p.x + 1) * v.width / 2) * canvas.width / logical[0], (v.y + (1 - p.y) * v.height / 2) * canvas.height / logical[1]],
                tile: [s.unit.tile.rx, s.unit.tile.ry, s.unit.tile.z], ramp: s.unit.tile.rampType, tilt: s.unit.tilterTrait.tilt,
                pose: hd.pose?.toArray(), opacity: (hd.originalMeshes[0].getOpacity?.() ?? hd.originals[0].opacity), onBridge: s.unit.onBridge, elevation: s.unit.tileElevation,
                order: hd.originalMeshes[0].renderOrder, light: hd.light.toArray(), clipping: (hd.originalMeshes[0].getClippingPlanes?.() ?? hd.originals[0].clippingPlanes ?? []).length,
                originalTransforms: hd.originalMeshes.map(m => m.matrixWorld.toArray()),
                layers: [...hd.layers].filter(([, l]) => l.batch.visible || l.translucent?.visible).map(([k, l]) => ({ key: k, opaque: l.batch.visible, proxy: l.proxy.visible, translucent: l.translucent?.visible })),
                glError: d.renderer.renderer.getContext().getError() };
        };
    });
    const captures = [];
    const capture = async (label) => {
        const rows = await page.evaluate(() => [window.__states.capture(false), window.__states.capture(true), window.__states.capture(false)]);
        assert.equal(rows[0].png, rows[2].png, `${label}: original restoration`);
        assert.deepEqual(rows[0].camera, rows[1].camera);
        assert.deepEqual(rows[0].originalTransforms, rows[1].originalTransforms);
        assert(rows[1].active, `${label}: HD active`);
        assert(rows.every(r => r.glError === 0));
        for (const [i, row] of rows.slice(0, 2).entries()) {
            row.file = `${label}-${i ? 'hd' : 'original'}.png`;
            await fs.writeFile(`${output}/${row.file}`, Buffer.from(row.png.split(',')[1], 'base64'));
            delete row.png;
            captures.push({ ...row, label, mode: i ? 'hd' : 'original' });
        }
        if(label==='rocking')assert.notDeepEqual(rows[1].pose,captures.find(r=>r.label==='flat'&&r.mode==='hd').pose,'Native rocking must change the pose');
        console.log('CAPTURE', label);
    };
    await capture('flat');
    if (process.env.M13G_BASELINE === '1') {
        await fs.writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
        return { captures: 2 };
    }
    for (let i = 0; i < info.ramps.length; i++) {
        await page.evaluate(i => { const s = window.__states; s.move(s.ramps[i]); }, i);
        await capture(`ramp-${info.ramps[i].rampType}`);
    }
    await page.evaluate(() => { const s = window.__states; s.move(s.flat); s.r.startRocking(90, 0.9, s.time); s.time += 30; });
    await capture('rocking');
    await page.evaluate(() => { const s = window.__states; s.time += 3000; s.r.update(s.time, 0); });
    if (info.high) {
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.move(s.high, d.game.map.tileOccupation.getBridgeOnTile(s.high)); });
        await capture('bridge-high-on');
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.setActive(true, true, d.game); });
        await capture('bridge-on-warped');
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.expire(d.game); });
        await page.evaluate(() => { const s = window.__states; s.move(s.high); });
        await capture('bridge-high-under');
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.setActive(true, true, d.game); });
        await capture('bridge-under-warped');
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.expire(d.game); s.unit.zone = 1; s.unit.position.tileElevation = 6; s.r.setPosition(s.unit.position.worldPosition); });
        await capture('airborne-over-bridge');
        await page.evaluate(() => { const s = window.__states; s.unit.zone = 0; s.unit.position.tileElevation = 0; s.r.setPosition(s.unit.position.worldPosition); s.capture(true, false); });
        const draws = await page.evaluate(() => {
            const d = window.__ra2debug, s = window.__states, rows = [];
            d.worldScene.scene.traverse(m => { if (m.isMesh) {
                m.__before = m.onBeforeRender;
                m.onBeforeRender = function (rr, sc, c, g, mat) { rows.push({ name: m.name, type: mat.type, order: m.renderOrder, transparent: mat.transparent, depthTest: mat.depthTest, depthWrite: mat.depthWrite, colorWrite: mat.colorWrite, pass: mat.uniforms?.hdPass?.value }); m.__before?.call(this, rr, sc, c, g, mat); };
            } });
            s.capture(true);
            d.worldScene.scene.traverse(m => { if (m.__before) {
                m.onBeforeRender = m.__before;
                delete m.__before;
            } });
            return rows;
        });
        await fs.writeFile(`${output}/bridge-draws.json`, JSON.stringify(draws, null, 2));
    }
    if (info.low) {
        await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.move(s.low, d.game.map.tileOccupation.getBridgeOnTile(s.low)); });
        await capture('bridge-low-on');
    }
    await page.evaluate(() => { const s = window.__states; s.move(s.flat); s.unit.position.tileElevation = 3; s.r.setPosition(s.unit.position.worldPosition); });
    await capture('elevated');
    await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.move(s.flat); s.unit.position.tileElevation = 0; s.r.setPosition(s.unit.position.worldPosition); s.unit.warpedOutTrait.setActive(true, true, d.game); });
    await capture('warped');
    await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.warpedOutTrait.expire(d.game); s.unit.invulnerableTrait.setActiveFor(600, d.game); });
    await capture('iron-curtain');
    await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__states;
        s.unit.invulnerableTrait.timer.reset();
        const rule = [...d.game.rules.vehicleRules.values()].find(r => r.cloakable);
        if (!rule)
            throw Error('No native cloak constructor carrier');
        const carrier = d.game.createUnitForPlayer(rule, d.localPlayer), Ctor = carrier.cloakableTrait.constructor;
        carrier.dispose();
        s.unit.cloakableTrait = new Ctor(s.unit, d.game.rules.general.cloakDelay);
        d.game.addObjectTrait(s.unit, s.unit.cloakableTrait);
        s.unit.cloakableTrait.cooldownTicks = 0;
        const tick = Object.getOwnPropertySymbols(Ctor.prototype).find(k => String(Ctor.prototype[k]).includes('cooldownTicks'));
        // The compiled function may be minified: the tick hook is the only hook with two arguments and a cooldown check.
        const hooks = Object.getOwnPropertySymbols(Ctor.prototype);
        for (const key of hooks) {
            if (String(Ctor.prototype[key]).includes('cooldownTicks'))
                Ctor.prototype[key].call(s.unit.cloakableTrait, s.unit, d.game);
        }
        if (!s.unit.cloakableTrait.isCloaked())
            throw Error('Native cloak did not activate');
    });
    await capture('cloaked-own');
    await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.owner = s.unit.owner; s.unit.owner = d.game.getCombatants().find(p => p !== s.owner && !d.game.alliances.haveSharedIntel(s.owner, p)); });
    await capture('cloaked-enemy');
    const enemyState = await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; return { visible: s.r.get3DObject().visible, cloaked: s.unit.cloakableTrait.isCloaked(), allied: d.game.alliances.haveSharedIntel(d.localPlayer, s.unit.owner), plugins: s.r.plugins.map(p => ({ local: p.localPlayer?.value?.name, canSee: p.lastCanSeeThroughCloak, cloaked: p.lastCloaked })) }; });
    await fs.writeFile(`${output}/enemy-state.json`, JSON.stringify(enemyState, null, 2));
    const enemyHidden = !enemyState.visible;
    assert(enemyHidden);
    await page.evaluate(() => { const d = window.__ra2debug, s = window.__states; s.unit.owner = s.owner; s.unit.cloakableTrait.uncloak(d.game); });
    await capture('restored');
    await fs.writeFile(`${output}/captures.json`, JSON.stringify(captures, null, 2));
    if (process.env.M13G_PLAY === '1') {
        const { playRhinoStateFixture } = await import('./play-rhino-state-fixture.mjs');
        await playRhinoStateFixture(page, output);
        return { captures: captures.length, manual: true };
    }
    const { recordRhinoStateMovement } = await import('./record-rhino-state-movement.mjs');
    const movement = await recordRhinoStateMovement(page, output);
    const { recordRhinoStates } = await import('./record-rhino-states.mjs');
    const video = await recordRhinoStates(page, output);
    return { captures: captures.length, enemyHidden, movement, video };
}
