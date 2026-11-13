// Serialized into the production renderer. Setup is artificial; gameplay remains native.
export function configureScene({ edition, scene }) {
    const d = window.__ra2debug, g = d.game, players = g.getCombatants();
    if (players.length !== 8 || g.botManager.bots.size !== 7 || d.localPlayer.isObserver) {
        throw Error('Expected one human combatant and seven live AI');
    }
    const tiles = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t));
    const center = tiles.reduce((sum, t) => ({ rx: sum.rx + t.rx / tiles.length, ry: sum.ry + t.ry / tiles.length }), { rx: 0, ry: 0 });
    const nearest = (near, valid) => tiles.filter(valid).sort((a, b) =>
        (a.rx - near.rx) ** 2 + (a.ry - near.ry) ** 2 - (b.rx - near.rx) ** 2 - (b.ry - near.ry) ** 2)[0];
    const counts = { dense: 48, overload: 96, sustained: 48 };
    const count = counts[scene];
    if (!count) throw Error('Unknown pressure scene');
    const actors = [], placements = [], groups = [];
    const inputs = [];
    for (let i = 0; i < players.length; i++) {
        const owner = players[i], start = owner.getOwnedObjects().find(o => /MCV$|^PCV$/.test(o.name))?.tile;
        if (!start) throw Error('Missing initial native MCV');
        const soviet = i % 2 === 1, yuri = edition === 'yr' && i >= 6;
        const buildings = yuri ? ['YAPOWR', 'YABRCK', 'YAWEAP', 'YAREFN', 'YAPOWR']
            : soviet ? ['NAPOWR', 'NAHAND', 'NAWEAP', 'NAREFN', 'NAPOWR']
                : ['GAPOWR', 'GAPILE', 'GAWEAP', 'GAREFN', 'GAPOWR'];
        const worker = g.getConstructionWorker(owner);
        for (const name of buildings) {
            const tile = nearest(start, t => worker.canPlaceAt(name, t, { normalizedTile: true, ignoreAdjacent: true }));
            if (!tile) throw Error('Missing legal foundation: ' + name);
            const object = g.createObject(2, name);
            g.changeObjectOwner(object, owner); g.spawnObject(object, tile);
            placements.push({ id: object.id, name, owner: owner.name, tile: [tile.rx, tile.ry] });
        }
        const angle = i * Math.PI / 4;
        const near = { rx: center.rx + Math.cos(angle) * 22, ry: center.ry + Math.sin(angle) * 22 };
        const names = yuri ? ['LTNK', 'YTNK', 'TELE', 'LTNK']
            : soviet ? ['HTNK', 'HTNK', 'APOC', 'V3'] : ['MTNK', 'MTNK', 'FV', 'SREF'];
        const ids = [];
        for (let j = 0; j < count; j++) {
            const infantry = j % 3 === 2, type = infantry ? 3 : 7;
            const name = infantry ? (yuri ? 'INIT' : soviet ? 'E2' : 'E1') : names[j % names.length];
            const rule = g.rules.getObject(name, type);
            const tile = nearest(near, t => !t.rampType && g.map.terrain.getPassableSpeed(t, rule.speedType, infantry, false) > 0
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()));
            if (!tile) throw Error('Missing legal unit tile: ' + name);
            const object = g.createUnitForPlayer(rule, owner); g.spawnObject(object, tile);
            actors.push(object); ids.push(object.id);
            placements.push({ id: object.id, name, owner: owner.name, tile: [tile.rx, tile.ry] });
        }
        const api = owner === d.localPlayer ? d.actionsApi : g.botManager.bots.get(owner).actionsApi;
        const destination = nearest(center, t => !t.rampType && g.map.terrain.getPassableSpeed(t, actors.at(-1).rules.speedType, true, false) > 0);
        api.orderUnits(ids, 4, destination.rx, destination.ry);
        groups.push({ player: owner.name, ids, destination: [destination.rx, destination.ry] });
    }
    // Reveal is a documented setup parameter; AI, weapons, pathfinding and fog rules stay native.
    g.mapShroudTrait.revealMap(d.localPlayer, g);
    const limits = d.worldScene.cameraPan.getPanLimits();
    const panBase = { x: limits.x + limits.width / 2, y: limits.y + limits.height / 2 };
    d.worldScene.cameraPan.setPan(panBase);
    window.__m4Scene = { actors, placements, groups, center, panBase, inputs };
    if (scene === 'sustained') {
        // Initial funds and queues create continued native production; nothing is
        // spawned after setup and all seven AI continue their ordinary updates.
        for (const owner of players) owner.credits = 100000;
        const mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        d.actionsApi.orderUnits([mcv.id], 10);
        const nativeUpdate = g.update;
        g.update = function(...args) {
            const result = nativeUpdate.apply(this, args);
            if (g.currentTick === 120) for (let i = 0; i < players.length; i++) {
                const owner = players[i], yuri = edition === 'yr' && i >= 6;
                const api = owner === d.localPlayer ? d.actionsApi : g.botManager.bots.get(owner).actionsApi;
                for (const [name, type] of [[yuri ? 'LTNK' : i % 2 ? 'HTNK' : 'MTNK', 7], [yuri ? 'INIT' : i % 2 ? 'E2' : 'E1', 3]]) {
                    const rule = g.rules.getObject(name, type), queue = owner.production.getQueueForObject(rule);
                    api.queueForProduction(queue.type, type, name, 99);
                    inputs.push({ tick: g.currentTick, player: owner.name, action: 'queue', name, quantity: 99 });
                }
            }
            if (g.currentTick % 450 === 0 && g.status === 1) {
                const ids = d.localPlayer.getOwnedObjects().filter(o => o.isUnit() && o.armedTrait && !o.harvesterTrait).map(o => o.id);
                const target = groups[0].destination;
                d.actionsApi.orderUnits(ids, 4, target[0], target[1]);
                inputs.push({ tick: g.currentTick, player: d.localPlayer.name, action: 'attack-move', ids, destination: target });
            }
            return result;
        };
    }
    return { scene, kind: 'artificial-native-simulation', initialTick: g.currentTick, countPerPlayer: count,
        placements, groups, center, panBase, zoom: d.worldScene.cameraZoom.getZoom(),
        players: players.map(p => ({ name: p.name, ai: p.isAi, country: p.country?.name, credits: p.credits })),
        map: { size: g.map.size, bounds: g.map.mapBounds }, hash: g.getHash(), rng: g.prng.snapshot() };
}

export function sceneSnapshot() {
    const d = window.__ra2debug, g = d.game, objects = g.getWorld().getAllObjects();
    const renderables = d.renderableManager.getRenderableContainer().getChildren();
    const names = {};
    for (const o of objects) names[o.name] = (names[o.name] ?? 0) + 1;
    return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), status: g.status,
        units: objects.filter(o => o.isUnit()).length, buildings: objects.filter(o => o.isBuilding()).length,
        projectiles: objects.filter(o => o.isProjectile()).length, objects: objects.length,
        inputs: window.__m4Scene?.inputs,
        moving: objects.filter(o => o.isMoving).length, firing: objects.filter(o => o.isFiring).length, names,
        bots: g.botManager.bots.size, players: g.getCombatants().map(p => ({ name: p.name,
            defeated: p.defeated, credits: p.credits, owned: p.getOwnedObjects().length })),
        output: d.renderer.outputMetrics, shadows: d.generalOptions.graphics.shadows.value,
        hdDensity: d.generalOptions.graphics.hdDensity.value, hdEnabled: d.generalOptions.graphics.hdEnabled.value,
        zoom: d.worldScene.cameraZoom.getZoom(), prepared: { ...d.preparedHdCache },
        demand: { gpuBytes: d.sovietUnitsHd?.gpuBytes, families: d.sovietUnitsHd?.families,
            preparation: d.sovietUnitsHd?.preparation },
        renderables: renderables.length, visibleRoots: renderables.filter(r => r.get3DObject()?.visible).length,
        hdVehicles: renderables.filter(r => r.unitVxlHd?.active).length,
        glError: d.renderer.renderer.getContext().getError() };
}
