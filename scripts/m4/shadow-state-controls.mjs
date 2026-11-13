// Serialized into the native page. Explicit diagnostic fixtures, never formal timing.
export async function captureShadowStateControls() {
    const d = window.__ra2debug, g = d.game, renderer = d.renderer, screen = d.gameScreen;
    screen.gameAnimationLoop.stop(); screen.gameTurnMgr.setPaused(true); screen.uiAnimationLoop.stop();
    d.worldScene.animationClock.update = () => 0;
    const gl = renderer.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const rows = [], fixtures = [], initial = window.__m4Scene.panBase;
    const active = unit => !unit.isDestroyed && g.getWorld().hasObjectId(unit.id);
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const state = () => ({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), world: g.debugGetState() });
    const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
    const pixels = () => {
        renderer.render();
        const bytes = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
    };
    const settle = async (frames = 40) => {
        for (let i = 0; i < frames; i++) {
            renderer.update(1000 + g.currentTick * 20, 0); renderer.render();
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    };
    const compare = async (label, picture = false) => {
        const before = state();
        renderer.setVehicleShadowInstancing(false); const baseline = pixels();
        renderer.setVehicleShadowInstancing(true); const candidate = pixels(), batch = renderer.vehicleShadowDiagnostics();
        renderer.setVehicleShadowInstancing(false); const repeated = pixels();
        const after = state();
        let differentBytes = 0, repeatedDifferentBytes = 0;
        for (let i = 0; i < baseline.length; i++) {
            if (baseline[i] !== candidate[i]) differentBytes++;
            if (baseline[i] !== repeated[i]) repeatedDifferentBytes++;
        }
        const row = { label, tick: g.currentTick, baselineSha256: await digest(baseline),
            candidateSha256: await digest(candidate), differentBytes, repeatedDifferentBytes,
            simulationUnchanged: JSON.stringify(before) === JSON.stringify(after), batch,
            worldHash: after.hash, rng: after.rng, camera: d.worldScene.cameraPan.getPan(), glError: gl.getError(),
            native: fixtures.filter(active).map(u => {
                const r = d.renderableManager.getRenderableByGameObject(u);
                return { id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry], ramp: u.tile.rampType,
                    onBridge: u.onBridge, elevation: u.tileElevation, direction: u.direction,
                    turret: u.turretTrait?.facing, cloaked: u.cloakableTrait?.isCloaked(),
                    rhino: !!r?.rhinoHd?.active, vxl: !!r?.unitVxlHd?.active,
                    matrices: r?.vxlBuilders?.flatMap(b => [...b.sections.values()].map(m => m.matrixWorld.toArray())) };
            }) };
        if (picture || differentBytes) { renderer.setVehicleShadowInstancing(true); renderer.render(); row.png = renderer.renderer.domElement.toDataURL(); }
        rows.push(row); renderer.setVehicleShadowInstancing(true);
        check(!differentBytes && !repeatedDifferentBytes, label + ': exact RGBA mismatch');
        check(row.simulationUnchanged && !row.glError && !batch.preparationErrors, label + ': state or render failure');
        return row;
    };
    const step = async count => {
        screen.gameTurnMgr.setPaused(false);
        try {
            for (let i = 0; i < count; i++) {
                check(screen.gameTurnMgr.doGameTurn(performance.now()), 'Native simulation turn refused');
                if (i % 30 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
        } finally { screen.gameTurnMgr.setPaused(true); }
        await settle(8);
    };
    const tiles = g.map.tiles.getAll(), rule = g.rules.getObject('HTNK', 7);
    const legal = tile => g.map.isWithinBounds(tile) && !tile.rampType
        && g.map.terrain.getPassableSpeed(tile, rule.speedType, false, false) > 0
        && !g.map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain());
    const center = window.__m4Scene.center;
    const flat = tiles.filter(legal).sort((a, b) => Math.hypot(a.rx - center.rx, a.ry - center.ry)
        - Math.hypot(b.rx - center.rx, b.ry - center.ry))[0];
    const spawn = (name, tile) => {
        const u = g.createUnitForPlayer(g.rules.getObject(name, 7), d.localPlayer);
        g.spawnObject(u, tile); fixtures.push(u); return u;
    };
    let failure;
    try {
        await settle(120); await compare('native-initial-batches', true);
        const rhino = spawn('HTNK', flat), tankTile = tiles.find(t => legal(t) && Math.hypot(t.rx - flat.rx, t.ry - flat.ry) < 4);
        const tank = spawn('MTNK', tankTile);
        d.worldInteraction.minimapHandler.panToTile(flat); await settle(60);
        await compare('rhino-and-normal-tank', true);
        check(d.renderableManager.getRenderableByGameObject(rhino)?.rhinoHd?.active, 'Dedicated Rhino path must be active');
        for (const [body, turret] of [[0, 90], [45, 270], [180, 0], [315, 135]]) {
            for (const u of [rhino, tank]) {
                u.direction = body; u.turretTrait.facing = u.turretTrait.desiredFacing = turret;
            }
            await settle(2); await compare(`independent-body-${body}-turret-${turret}`);
        }
        const move = (tile, bridge) => {
            rhino.moveTrait.teleportUnitToTile(tile, bridge, false, false, g);
            d.renderableManager.getRenderableByGameObject(rhino).setPosition(rhino.position.worldPosition);
            d.worldInteraction.minimapHandler.panToTile(tile);
        };
        for (const type of [1, 2, 3, 4]) {
            const ramp = tiles.find(t => t.rampType === type
                && g.map.terrain.getPassableSpeed(t, rule.speedType, false, false) > 0);
            check(ramp, 'Missing retail ramp ' + type);
            move(ramp); await settle(4); await compare('ramp-' + type, type === 1);
        }
        const high = tiles.find(t => g.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge());
        check(high, 'Missing high bridge');
        move(high, g.map.tileOccupation.getBridgeOnTile(high)); await settle(8); await compare('high-bridge-on', true);
        move(high); await settle(8); await compare('high-bridge-under', true);
        move(flat); rhino.position.tileElevation = 3;
        d.renderableManager.getRenderableByGameObject(rhino).setPosition(rhino.position.worldPosition);
        await settle(4); await compare('elevated');
        const nativeRenderer = d.renderableManager.getRenderableByGameObject(rhino);
        nativeRenderer.updateClippingPlanes(rhino.tile.z, true); await settle(4);
        const clipped = await compare('native-clipping-plane-fallback');
        check(clipped.batch.fallbacks['clipping-planes'] > 0, 'Clipped native sections must use original shadow draws');
        nativeRenderer.vxlBuilders.forEach(builder => builder.setClippingPlanes([])); await settle(4);
        rhino.warpedOutTrait.setActive(true, true, g); await settle(4); await compare('translucent-warp-shadow');
        rhino.warpedOutTrait.expire(g); rhino.position.tileElevation = 0; move(flat);
        const cloakRule = [...g.rules.vehicleRules.values()].find(r => r.cloakable);
        const carrier = g.createUnitForPlayer(cloakRule, d.localPlayer), Cloak = carrier.cloakableTrait.constructor;
        carrier.dispose(); rhino.cloakableTrait = new Cloak(rhino, g.rules.general.cloakDelay);
        g.addObjectTrait(rhino, rhino.cloakableTrait); rhino.cloakableTrait.cooldownTicks = 0;
        for (const symbol of Object.getOwnPropertySymbols(Cloak.prototype))
            if (String(Cloak.prototype[symbol]).includes('cooldownTicks')) Cloak.prototype[symbol].call(rhino.cloakableTrait, rhino, g);
        check(rhino.cloakableTrait.isCloaked(), 'Native cloak fixture must activate');
        await settle(4); await compare('cloaked-own');
        const owner = rhino.owner; rhino.owner = g.getCombatants().find(p => p !== owner && !g.alliances.haveSharedIntel(p, owner));
        await settle(4); await compare('cloaked-enemy-hidden');
        rhino.owner = owner; rhino.cloakableTrait.uncloak(g); await settle(4); await compare('uncloaked');
        d.worldScene.cameraPan.setPan({ x: initial.x - 2000, y: initial.y - 1200 });
        await settle(12); await compare('camera-leave');
        d.worldInteraction.minimapHandler.panToTile(flat); await settle(12); await compare('camera-reenter');
        const hidden = d.renderableManager.getRenderableByGameObject(tank).get3DObject();
        hidden.visible = false; await compare('source-root-hidden'); hidden.visible = true; await compare('source-root-restored');
        const beforeGrowth = renderer.vehicleShadowDiagnostics().growths;
        for (const tile of tiles.filter(legal).filter(t => Math.hypot(t.rx - flat.rx, t.ry - flat.ry) < 10).slice(0, 40)) spawn('HTNK', tile);
        await settle(30); const grown = await compare('capacity-growth', true);
        check(grown.batch.growths > beforeGrowth, 'Native batch capacity must grow');
        const killed = fixtures.filter(u => u.name === 'HTNK');
        for (const u of killed) g.destroyObject(u, undefined, true);
        await settle(8); await compare('destroy-and-release-slots');
        spawn('HTNK', flat); await settle(20); await compare('new-object-reuses-capacity');
        await step(24); await compare('native-motion-tick-24'); await step(36); await compare('native-motion-tick-60');
        const worker = g.getConstructionWorker(d.localPlayer);
        const foundation = tiles.find(t => legal(t) && worker.canPlaceAt('GACNST', t, { ignoreAdjacent: true }));
        check(foundation, 'Missing legal native MCV foundation');
        const mcv = spawn('AMCV', foundation);
        check(worker.canPlaceAt('GACNST', foundation, { ignoreAdjacent: true, ignoreObjects: [mcv] }),
            'The native centered MCV deployment footprint must remain legal');
        d.worldInteraction.minimapHandler.panToTile(foundation); await settle(20); await compare('native-mcv-before-deploy');
        d.actionsApi.orderUnits([mcv.id], 10);
        await step(1); await compare('native-mcv-deploy-transition');
        await step(89);
        const yard = g.getWorld().getAllObjects().find(o => o.name === 'GACNST' && o.owner === d.localPlayer);
        check(yard, 'Native MCV deployment must create its construction yard');
        const readyLimit = g.currentTick + 600;
        while (yard.buildStatus !== 1 && g.currentTick < readyLimit) await step(10);
        check(yard.buildStatus === 1, 'Wait for native buildup completion before requesting repack');
        await compare('native-mcv-deployed', true);
        const destination = tiles.find(t => legal(t) && Math.hypot(t.rx - foundation.rx, t.ry - foundation.ry) < 6);
        check(destination, 'Missing legal native MCV repack destination');
        // The construction yard uses its ordinary move order to pack, as in
        // the retained Allied07 native redeploy regression.
        d.actionsApi.orderUnits([yard.id], 0, destination.rx, destination.ry);
        await step(1); await compare('native-mcv-repack-transition');
        const repackLimit = g.currentTick + 600;
        while (!yard.replacedBy && g.currentTick < repackLimit) await step(10);
        const repacked = yard.replacedBy;
        check(repacked, 'Native yard repack must recreate its MCV'); fixtures.push(repacked);
        await compare('native-mcv-repacked', true);
        for (const u of fixtures) if (active(u)) g.destroyObject(u, undefined, true);
        await settle(8); await compare('fixture-removal');
        d.generalOptions.graphics.hdEnabled.value = false; await settle(30); await compare('runtime-hd-request-off', true);
        d.generalOptions.graphics.hdEnabled.value = true; await settle(60); await compare('hd-restored');
    } catch (error) { failure = error.stack; }
    return { schema: 'm4-3a-shadow-state-controls-v1', status: failure ? 'FAIL' : 'PASS_EXACT_DYNAMIC_RGBA',
        failure, width, height, rows,
        fixtureScope: 'Artificial native placement/teleport, explicit native cloak trait fixture and destruction; production simulation code is unchanged. Every render comparison preserves the complete available state, hash and simulation RNG.' };
}
