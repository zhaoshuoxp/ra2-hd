// Test-only entry bundled by build-conscript-state-game.mjs, never normal builds.
import { MoveTask } from '@/game/gameobject/task/move/MoveTask';
import { AttackTask } from '@/game/gameobject/task/AttackTask';
import { ParadropTask } from '@/game/gameobject/task/ParadropTask';
import { Target } from '@/game/Target';
import { Warhead } from '@/game/Warhead';
import { ChronoSphereEffect } from '@/game/superweapon/ChronoSphereEffect';
import { PowerupType } from '@/game/type/PowerupType';
import { GameSpeed } from '@/game/GameSpeed';

(window as any).__installConscriptStates = () => {
    const d = (window as any).__ra2debug, g = d.game, manager = d.renderableManager;
    d.gameScreen.gameAnimationLoop.stop();
    const tiles = g.map.tiles.getAll(), rule = g.rules.getObject('E2', 3);
    const home = d.localPlayer.getOwnedObjects()[0].tile;
    const distance = (a: any, b: any) => Math.hypot(a.rx - b.rx, a.ry - b.ry);
    const legal = (t: any, bridge = false) => t && g.map.mapBounds.isWithinBounds(t)
        && g.map.terrain.getPassableSpeed(t, rule.speedType, true, bridge) > 0
        && !g.map.tileOccupation.getObjectsOnTile(t).some((o: any) => o.isTechno() || o.isTerrain());
    const flat = tiles.filter((t: any) => !t.rampType && !t.onBridgeLandType && legal(t) && distance(t, home) > 8)
        .sort((a: any, b: any) => distance(a, home) - distance(b, home))[0];
    const ramps = [1, 2, 3, 4].map(type => tiles.filter((t: any) => t.rampType === type && legal(t)
        && tiles.filter((n: any) => n.rampType === type && distance(n, t) < 2).length >= 3)
        .sort((a: any, b: any) => distance(a, home) - distance(b, home))[0]);
    const high = tiles.find((t: any) => g.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge());
    const low = tiles.find((t: any) => g.map.tileOccupation.getBridgeOnTile(t)?.isLowBridge());
    const enemy = g.getCombatants().find((p: any) => p !== d.localPlayer && !g.alliances.haveSharedIntel(p, d.localPlayer));
    g.mapShroudTrait.revealMap(d.localPlayer, g);
    const s: any = { d, g, flat, ramps, high, low, enemy, units: [], trace: [], effects: [], milestones: {}, time: performance.now(), label: 'setup' };
    const tileInfo = (t: any) => t && ({ rx: t.rx, ry: t.ry, z: t.z, ramp: t.rampType });
    const render = () => {
        d.worldScene.update(s.time, 0);
        d.worldScene.scene.updateMatrixWorld(true);
        d.worldScene.meshBatchManager.updateMeshes();
        d.worldScene.meshBatchManager.processRenderQueue();
        d.renderer.render();
    };
    for (const method of ['createAnim', 'createTransientAnim']) {
        const native = manager[method];
        manager[method] = function(name: string, ...args: any[]) {
            s.effects.push({ name, method, label: s.label, tick: g.currentTick });
            return native.call(this, name, ...args);
        };
    }
    s.spawn = (tile = flat, owner = d.localPlayer, name = 'E2', type = 3, bridge = false, altitude?: number) => {
        const u = g.createUnitForPlayer(g.rules.getObject(name, type), owner);
        u.position.subCell = 2;
        if (altitude !== undefined) {
            u.stance = 4; u.position.tileElevation = altitude; u.onBridge = bridge;
        } else if (bridge) {
            u.onBridge = true;
            u.position.tileElevation = g.map.tileOccupation.getBridgeOnTile(tile).tileElevation;
        }
        g.spawnObject(u, tile);
        if (altitude !== undefined) u.unitOrderTrait.addTask(new ParadropTask(g).setCancellable(false));
        const r = manager.getRenderableByGameObject(u);
        s.units.push({ u, r }); s.u = u; s.r = r;
        d.worldInteraction.minimapHandler.panToTile(tile);
        render();
        return u;
    };
    s.focus = (u: any) => { s.u = u; s.r = s.units.find((x: any) => x.u === u)?.r ?? manager.getRenderableByGameObject(u);
        d.worldInteraction.minimapHandler.panToTile(u.tile); render(); };
    s.clear = () => { for (const { u } of s.units) if (u.isSpawned && !u.isDestroyed) { g.unspawnObject(u); u.dispose(); } };
    s.sample = () => {
        const u = s.u, r = s.r, b = r.shpRenderable?.builder, mesh = r.shpRenderable?.getShapeMesh();
        const hd = b?.hdOverride, frame = b?.getFrame(), page = hd?.pages[hd.frames[frame + b.frameOffset]?.page];
        return { label: s.label, tick: g.currentTick, id: u.id, tile: tileInfo(u.tile), position: u.position.worldPosition.toArray(),
            ramp: u.tile.rampType, onBridge: u.onBridge, elevation: u.tileElevation, zone: u.zone, stance: u.stance,
            moving: u.isMoving, firing: u.isFiring, destroyed: u.isDestroyed, disposed: u.isDisposed,
            rendererPresent: !!manager.getRenderableByGameObject(u), frame, hd: !!hd,
            pageMatches: !hd || (mesh.material.map === page?.base && mesh.material.uniforms.remapMap.value === page?.data),
            opacity: b?.opacity, visible: r.get3DObject().visible, order: mesh?.renderOrder,
            cloaked: u.cloakableTrait?.isCloaked() ?? false, warped: u.warpedOutTrait?.isActive() ?? false,
            parachute: !!r.paradropAnim, blobShadow: !!r.blobShadow?.get3DObject().visible,
            bodyShadow: r.shpRenderable?.getShadowMesh()?.visible,
            blobWorldY: r.blobShadow?.get3DObject().getWorldPosition(d.worldScene.camera.position.clone()).y,
            orderedCoverage: mesh?.orderedHdCoverage,
            deathEffect: !!r.deathAnimRenderable, corpse: !!r.deadBodyAnimRenderable,
            infDeathType: u.infDeathType, deathType: u.deathType, gl: d.renderer.renderer.getContext().getError() };
    };
    s.step = async (ticks: number, label: string) => {
        s.label = label;
        const rows = [];
        for (let i = 0; i < ticks; i++) {
            g.update();
            s.time += 1000 / (GameSpeed.BASE_TICKS_PER_SECOND * g.speed.value);
            if (s.videoFrame) d.worldInteraction.minimapHandler.panToTile(s.u.tile);
            render();
            await Promise.resolve(); // Complete native asynchronous removal/disposal.
            const row = s.sample(); rows.push(row); s.trace.push(row);
            const key = label.replace(/-\d+$/, '');
            const movingRamp = /^ramp-([1-4])-/.exec(label);
            const movingBridge = /bridge-(out|back)/.test(label) && row.moving && row.onBridge
                && distance(s.u.tile,s.bridgeStart)>3 && distance(s.u.tile,s.bridgeEnd)>3;
            if (!s.milestones[key] && ((movingRamp && row.moving && row.ramp===Number(movingRamp[1])) || movingBridge)) {
                s.milestones[key] = s.pair();
            }
            if (s.videoFrame && i % 4 === 0) { s.videoFrame(); await new Promise(resolve => setTimeout(resolve, 17)); }
            if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return rows;
    };
    s.move = (tile: any, onBridge = false) => {
        s.u.unitOrderTrait.addTask(new MoveTask(g, tile, onBridge, { strictCloseEnough: true, closeEnoughTiles: 0 }));
    };
    s.relocate = (tile: any, onBridge = false) => {
        s.u.unitOrderTrait.cancelAllTasks();
        s.u.unitOrderTrait.clearOrders();
        s.u.moveTrait.teleportUnitToTile(tile, onBridge ? g.map.tileOccupation.getBridgeOnTile(tile) : undefined, false, false, g);
        d.worldInteraction.minimapHandler.panToTile(tile); render();
    };
    s.capture = () => {
        render();
        const canvas = d.renderer.renderer.domElement, v = d.worldScene.viewport;
        const p = s.r.getPosition().clone().project(d.worldScene.camera);
        const logical = [Number(canvas.dataset.logicalWidth), Number(canvas.dataset.logicalHeight)];
        return { ...s.sample(), buffer: [canvas.width, canvas.height], logical,
            center: [(v.x + (p.x + 1) * v.width / 2) * canvas.width / logical[0],
                (v.y + (1 - p.y) * v.height / 2) * canvas.height / logical[1]], png: canvas.toDataURL() };
    };
    s.startVideo = () => {
        const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 472;
        const ctx = canvas.getContext('2d')!, stream = canvas.captureStream(0), track: any = stream.getVideoTracks()[0];
        const chunks: Blob[] = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        recorder.ondataavailable = e => chunks.push(e.data);
        s.videoFrame = () => {
            const source = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = s.r.getPosition().clone().project(d.worldScene.camera);
            const logical = [Number(source.dataset.logicalWidth), Number(source.dataset.logicalHeight)];
            const x = Math.round((v.x + (p.x+1)*v.width/2)*source.width/logical[0] - 384);
            const y = Math.round((v.y + (1-p.y)*v.height/2)*source.height/logical[1] - 216);
            ctx.fillStyle = '#171c23'; ctx.fillRect(0,0,768,472);
            ctx.drawImage(source,x,y,768,432,0,40,768,432);
            ctx.fillStyle = 'white'; ctx.font = '22px sans-serif';
            ctx.fillText(`${s.label} | native tick ${g.currentTick} | accelerated`,12,28);
            track.requestFrame();
        };
        s.stopVideo = () => new Promise(resolve => {
            recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(new Blob(chunks,{type:'video/webm'})); stream.getTracks().forEach(t=>t.stop()); };
            s.videoFrame = undefined; recorder.stop();
        });
        recorder.start();
    };
    s.pair = () => {
        const hd = s.capture(), b = s.r.shpRenderable.builder, mesh = s.r.shpRenderable.getShapeMesh();
        const original = new b.constructor(b.shpFile, b.palette, b.camera, b.scale, b.depth, b.depthOffset);
        for (const key of ['batchPalettes', 'useMeshBatching', 'opacity', 'forceTransparent', 'offset',
            'frameOffset', 'flat', 'uiAnchorCompensation', 'shpSize', 'extraLight', 'align']) original[key] = b[key];
        original.setFrame(b.getFrame());
        const native = original.build(), geometry = mesh.geometry, material = mesh.material;
        // Capture without advancing animation or reconstructing the unit.
        const draw = () => { d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true); d.renderer.render(); return d.renderer.renderer.domElement.toDataURL(); };
        let originalPng;
        try { mesh.geometry = native.geometry; mesh.material = native.material; originalPng = draw(); }
        finally { mesh.geometry = geometry; mesh.material = material; draw(); original.dispose(); }
        return { hd, originalPng, restored: draw() === hd.png };
    };
    s.occlusion = () => {
        // Counterfactual pixel probe: unit contribution with/without native bridge overlays.
        const root = s.r.get3DObject(), gl = d.renderer.renderer.getContext(), canvas = d.renderer.renderer.domElement;
        const read = () => {
            d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
        };
        const bridges = g.getWorld().getAllObjects().filter((o: any) => o.isOverlay() && o.isBridge())
            .map((o: any) => manager.getRenderableByGameObject(o)?.get3DObject()).filter(Boolean);
        const oldVisible = root.visible, bridgeVisible = bridges.map((o: any) => o.visible);
        let full = 0, hidden = 0, leaked = 0;
        try {
            root.visible = false; const absent = read();
            root.visible = true; const present = read();
            bridges.forEach((o: any) => o.visible = false);
            root.visible = false; const bareAbsent = read();
            root.visible = true; const barePresent = read();
            for (let i = 0; i < present.length; i += 4) {
                const delta = (a: Uint8Array, b: Uint8Array) => Math.max(...[0, 1, 2].map(c => Math.abs(a[i+c] - b[i+c])));
                if (delta(barePresent, bareAbsent) > 3) {
                    full++;
                    if (delta(absent, bareAbsent) > 3) {
                        hidden++;
                        if (delta(present, absent) > 3) leaked++;
                    }
                }
            }
        } finally { root.visible = oldVisible; bridges.forEach((o: any, i: number) => o.visible = bridgeVisible[i]); read(); }
        return { full, hidden, leaked };
    };
    s.grantCloak = () => {
        const powerup = g.rules.powerups.powerups.find((p: any) => p.type === PowerupType.Cloak);
        if (!powerup) throw Error('Original cloak powerup unavailable');
        const result = g.crateGeneratorTrait.grantPowerup(s.u, powerup, s.u.tile, g);
        if (result !== PowerupType.Cloak) throw Error('Native cloak grant failed');
    };
    s.damage = (infDeath: number) => {
        const candidates = [...g.rules.warheadRules.values()];
        const rule = candidates.find((w: any) => w.infDeath === infDeath && !w.temporal);
        if (!rule) throw Error(`No original warhead for infantry death ${infDeath}`);
        s.label = `death-${infDeath}`;
        new Warhead(rule).inflictDamage(s.u.healthTrait.getHitPoints(), s.u, undefined, g);
        return { name: rule.name, infDeath: rule.infDeath };
    };
    s.chronosphere = () => {
        const effect = new ChronoSphereEffect(0, d.localPlayer, s.u.tile, flat);
        effect.onStart(g); return s.u.isDestroyed;
    };
    s.temporal = (victim: any) => {
        const target = new Target(victim, victim.tile, g.map.tileOccupation);
        const weapon = s.u.primaryWeapon;
        s.u.unitOrderTrait.addTask(new AttackTask(g, target, weapon));
    };
    s.crush = () => {
        s.clear();
        const victim = s.spawn(flat, enemy);
        victim.moveTrait.setDisabled(true); victim.attackTrait.setDisabled(true);
        const tankRules = g.rules.getObject('HTNK',7);
        const start = tiles.filter((t: any) => t.z===flat.z && !t.rampType && legal(t)
            && distance(t,flat)>=2 && distance(t,flat)<=3
            && g.map.terrain.getPassableSpeed(t,tankRules.speedType,false,false)>0)
            .sort((a: any,b: any)=>distance(a,flat)-distance(b,flat))[0];
        if (!start) throw Error('No legal starting tile for native crusher');
        const tank = s.spawn(start, d.localPlayer, 'HTNK', 7);
        tank.attackTrait.setDisabled(true);
        tank.unitOrderTrait.addTask(new MoveTask(g, flat, false, { forceMove: true, closeEnoughTiles: 0, strictCloseEnough: true }));
        s.focus(victim);
    };
    s.info = { flat: tileInfo(flat), ramps: ramps.map(tileInfo), high: tileInfo(high), low: tileInfo(low),
        rules: { organic: rule.organic, teleporter: rule.teleporter },
        warheads: [...g.rules.warheadRules.values()].map((w: any) => ({ name: w.name, infDeath: w.infDeath, temporal: w.temporal })) };
    s.tiles = tiles; s.legal = legal; s.render = render;
    (window as any).__conscriptStates = s;
    return s.info;
};
