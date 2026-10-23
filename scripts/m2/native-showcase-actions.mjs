import assert from 'node:assert/strict';

export async function validateShowcaseActions(session, capture) {
    const { page, report, startClip, stopClip } = session;
    const pan = async object => page.evaluate(id => {
        const d = window.__ra2debug, object = d.game.getWorld().getAllObjects().find(object => object.id === id);
        d.worldInteraction.minimapHandler.panToTile(object.tile);
    }, object.id);
    const sample = expression => page.evaluate(expression);
    report.environmentActions = {};
    const results = report.environmentActions;
    if (!process.argv.includes('--environment-tail')) {
    // The unchanged map contains an occupiable house; native infantry enter and leave it.
    results.occupancy = await sample(() => {
        const d = window.__ra2debug, f = window.__allied;
        const house = d.game.getWorld().getAllObjects().find(object => object.isSpawned && !object.isDestroyed
            && object.garrisonTrait?.canBeOccupied()
            && window.__showcaseBinding(object).hd);
        if (!house) throw Error('No native HD occupiable house');
        window.__showcaseGarrison = { house, units: [0, 1, 2].map(() => f.spawn('E1', 3, house.tile)) };
        return window.__showcaseBinding(house);
    });
    await pan(results.occupancy); await startClip();
    await page.evaluate(() => {
        const q = window.__showcaseGarrison;
        window.__ra2debug.actionsApi.orderUnits(q.units.map(unit => unit.id), 8, q.house.id);
    });
    await page.waitForFunction(() => window.__showcaseGarrison.house.garrisonTrait.units.length === 3,
        undefined, { timeout: 45000 });
    results.occupancy.occupied = await sample(() => window.__showcaseBinding(window.__showcaseGarrison.house));
    await capture('house-native-occupied');
    await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__showcaseGarrison.house.id], 10));
    await page.waitForFunction(() => !window.__showcaseGarrison.house.garrisonTrait.units.length);
    results.occupancy.evacuated = await sample(() => {
        const d = window.__ra2debug, q = window.__showcaseGarrison;
        return { house: window.__showcaseBinding(q.house), neutralOwner: q.house.owner === d.game.getCivilianPlayer(),
            units: q.units.map(unit => ({ spawned: unit.isSpawned, limbo: !!unit.limboData,
                renderable: !!d.renderableManager.getRenderableByGameObject(unit) })) };
    });
    assert(results.occupancy.evacuated.neutralOwner && results.occupancy.evacuated.units.every(unit => !unit.limbo && unit.renderable));
    await capture('house-native-evacuated'); await stopClip('house-native-entry-exit');

    results.cow = await sample(() => {
        const d = window.__ra2debug, f = window.__allied;
        const cow = d.game.getWorld().getAllObjects().find(object => object.name === 'COW');
        if (!cow) throw Error('No native map cow');
        window.__showcaseCow = cow;
        d.game.changeObjectOwner(cow, d.localPlayer);
        const target = d.game.map.tiles.getAll().filter(tile => d.game.map.isWithinBounds(tile)
            && d.game.map.terrain.getPassableSpeed(tile, cow.rules.speedType, true, false) > 0
            && !d.game.map.getGroundObjectsOnTile(tile).some(object => object.isTechno() || object.isTerrain()))
            .sort((a, b) => Math.hypot(a.rx - cow.tile.rx - 4, a.ry - cow.tile.ry)
                - Math.hypot(b.rx - cow.tile.rx - 4, b.ry - cow.tile.ry))[0];
        f.cowDestination = target; f.cowOrigin = cow.tile;
        d.actionsApi.orderUnits([cow.id], 0, target.rx, target.ry);
        return window.__showcaseBinding(cow);
    });
    await pan(results.cow); await startClip();
    await page.waitForFunction(() => window.__showcaseCow.isMoving);
    results.cow.walking = await sample(() => window.__showcaseBinding(window.__showcaseCow));
    assert(results.cow.walking.hd); await capture('cow-native-walk');
    await page.waitForFunction(() => window.__showcaseCow.tile === window.__allied.cowDestination
        && !window.__showcaseCow.isMoving, undefined, { timeout: 30000 });
    await page.evaluate(() => {
        const d = window.__ra2debug, cow = window.__showcaseCow;
        window.__showcaseCowRenderable = d.renderableManager.getRenderableByGameObject(cow);
        d.game.destroyObject(cow, { player: d.localPlayer });
    });
    await page.waitForTimeout(100);
    results.cow.death = await sample(() => {
        const r = window.__showcaseCowRenderable;
        return { destroyed: window.__showcaseCow.isDestroyed, frame: r.shpRenderable?.builder?.getFrame(),
            hd: r.shpRenderable?.builder?.hdOverride?.identity };
    });
    assert(results.cow.death.destroyed && results.cow.death.hd);
    await capture('cow-native-death'); await page.waitForTimeout(1500); await stopClip('cow-native-walk-death');

    // A miner gathers real placed ore and uses the ordinary unload/credit path.
    results.harvest = await sample(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        const ore = g.getWorld().getAllObjects().filter(object => object.isOverlay() && object.isTiberium() && object.value > 0)
            .sort((a, b) => Math.hypot(a.tile.rx - f.center.rx, a.tile.ry - f.center.ry)
                - Math.hypot(b.tile.rx - f.center.rx, b.tile.ry - f.center.ry))[0];
        f.miner = f.spawn('CMIN', 7, ore.tile); f.refinery = f.building('GAREFN', ore.tile);
        window.__showcaseOre = ore; f.oreBefore = ore.value; f.harvestCredits = f.player.credits;
        d.actionsApi.orderUnits([f.miner.id], 14, ore.tile.rx, ore.tile.ry);
        return { ore: window.__showcaseBinding(ore), miner: f.sample(f.miner) };
    });
    await pan(results.harvest.ore); await startClip();
    await page.waitForFunction(() => window.__allied.sample(window.__allied.miner).vxlHd,
        undefined, { timeout: 45000 });
    await page.waitForFunction(() => !window.__allied.miner.harvesterTrait.isEmpty(), undefined, { timeout: 60000 });
    results.harvest.gathering = await sample(() => ({ ore: window.__showcaseBinding(window.__showcaseOre),
        miner: window.__allied.sample(window.__allied.miner) }));
    assert(results.harvest.gathering.ore.value < results.harvest.ore.value);
    assert(results.harvest.gathering.ore.hd && results.harvest.gathering.miner.vxlHd);
    await capture('ore-native-harvest'); await stopClip('ore-native-harvest');
    await page.waitForFunction(() => window.__allied.player.credits > window.__allied.harvestCredits,
        undefined, { timeout: 180000 });
    results.harvest.unloaded = await sample(() => ({ credits: window.__allied.player.credits - window.__allied.harvestCredits,
        miner: window.__allied.sample(window.__allied.miner), ore: window.__showcaseBinding(window.__showcaseOre) }));
    assert(results.harvest.unloaded.credits > 0); await capture('ore-native-unload-credits');

    // Observe native ore-generator ticks without editing its probability or clock.
    results.regrowth = await sample(() => {
        const d = window.__ra2debug;
        const tree = d.game.getWorld().getAllObjects().filter(object => /^TIBTRE/.test(object.name))
            .sort((a, b) => Math.hypot(b.tile.rx - window.__allied.miner.tile.rx, b.tile.ry - window.__allied.miner.tile.ry)
                - Math.hypot(a.tile.rx - window.__allied.miner.tile.rx, a.tile.ry - window.__allied.miner.tile.ry))[0];
        window.__showcaseOreTree = tree;
        window.__showcaseRegrowth = () => d.game.getWorld().getAllObjects().filter(object => object.isOverlay()
            && object.isTiberium() && Math.hypot(object.tile.rx - tree.tile.rx, object.tile.ry - tree.tile.ry) <= 3)
            .map(object => ({ id: object.id, value: object.value, frame: window.__showcaseBinding(object).frame }));
        window.__showcaseGrowthBefore = window.__showcaseRegrowth();
        return { tree: window.__showcaseBinding(tree), tick: d.game.currentTick, before: window.__showcaseGrowthBefore };
    });
    await page.waitForFunction(() => window.__showcaseRegrowth().some(ore => {
        const old = window.__showcaseGrowthBefore.find(before => before.id === ore.id);
        return !old || ore.value > old.value;
    }),
        undefined, { timeout: 30000 });
    results.regrowth.after = await sample(() => ({ tick: window.__ra2debug.game.currentTick,
        tree: window.__showcaseBinding(window.__showcaseOreTree), ore: window.__showcaseRegrowth() }));
    assert(results.regrowth.tree.hd && results.regrowth.after.tree.hd); await pan(results.regrowth.tree);
    await capture('ore-tree-native-regrowth');
    }
    results.bridge = await sample(() => {
        const d = window.__ra2debug, g = d.game;
        const hut = g.getWorld().getAllObjects().find(object => object.cabHutTrait?.getBridgePieces()?.length);
        if (!hut) throw Error('No native repair hut with bridge pieces');
        window.__showcaseBridgeHut = hut;
        const pieces = hut.cabHutTrait.getBridgePieces();
        window.__showcaseBridgePiece = pieces[Math.floor(pieces.length / 2)].obj;
        return { hut: window.__showcaseBinding(hut), spec: hut.cabHutTrait.findClosestBridgeBounds(),
            pieces: pieces.map(piece => window.__showcaseBinding(piece.obj)) };
    });
    assert(results.bridge.pieces.every(piece => piece.hd));
    await pan(results.bridge.hut); await startClip(); await capture('bridge-native-standing');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, pieces = window.__showcaseBridgeHut.cabHutTrait.getBridgePieces();
        f.bridgeVehicle = f.spawn('MTNK', 7, pieces[0].obj.tile);
        f.bridgeOrigin = f.bridgeVehicle.tile;
        f.bridgeDestination = pieces.at(-1).obj.tile;
        f.bridgePassage = [];
        f.bridgeTimer = setInterval(() => f.bridgePassage.push({ tick: d.game.currentTick,
            tile: [f.bridgeVehicle.tile.rx, f.bridgeVehicle.tile.ry], onBridge: f.bridgeVehicle.onBridge,
            hd: f.sample(f.bridgeVehicle).vxlHd }), 50);
        d.actionsApi.orderUnits([f.bridgeVehicle.id], 0, f.bridgeDestination.rx, f.bridgeDestination.ry);
    });
    await page.waitForFunction(() => window.__allied.bridgeVehicle.tile === window.__allied.bridgeDestination
        && !window.__allied.bridgeVehicle.isMoving, undefined, { timeout: 45000 });
    results.bridge.passage = await sample(() => {
        const f = window.__allied; clearInterval(f.bridgeTimer);
        window.__ra2debug.game.unspawnObject(f.bridgeVehicle);
        return f.bridgePassage;
    });
    assert(results.bridge.passage.some(sample => sample.onBridge && sample.hd));
    await capture('bridge-native-passage');
    await page.evaluate(() => {
        const d = window.__ra2debug, piece = window.__showcaseBridgePiece;
        piece.healthTrait.inflictDamage(Math.floor(piece.healthTrait.maxHitPoints * .6), piece, d.game);
    });
    await page.waitForTimeout(500);
    results.bridge.damaged = await sample(() => window.__showcaseBinding(window.__showcaseBridgePiece));
    assert(results.bridge.damaged.hd && results.bridge.damaged.health < 50); await capture('bridge-native-damaged');
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__showcaseBridgeHut.cabHutTrait.demolishBridge(d.game, { player: d.localPlayer });
    });
    await page.waitForTimeout(700);
    results.bridge.destroyed = await sample(() => ({ repairable: window.__showcaseBridgeHut.cabHutTrait.canRepairBridge(),
        pieces: window.__showcaseBridgeHut.cabHutTrait.getBridgePieces().map(piece => window.__showcaseBinding(piece.obj)) }));
    assert(results.bridge.destroyed.repairable); await capture('bridge-native-demolished');
    await page.evaluate(() => {
        const d = window.__ra2debug, hut = window.__showcaseBridgeHut;
        window.__allied.engineer = window.__allied.spawn('ENGINEER', 3, hut.tile);
        d.actionsApi.orderUnits([window.__allied.engineer.id], 15, hut.id);
    });
    await page.waitForFunction(() => !window.__showcaseBridgeHut.cabHutTrait.canRepairBridge(), undefined, { timeout: 45000 });
    results.bridge.repaired = await sample(() => ({ engineerConsumed: !window.__allied.engineer.isSpawned,
        pieces: window.__showcaseBridgeHut.cabHutTrait.getBridgePieces().map(piece => window.__showcaseBinding(piece.obj)) }));
    assert(results.bridge.repaired.engineerConsumed && results.bridge.repaired.pieces.every(piece => piece.hd));
    await capture('bridge-native-engineer-repair'); await stopClip('bridge-native-damage-repair');

    results.waterfalls = await sample(() => window.__ra2debug.mapRenderable.tileLayer.anims
        .filter(anim => /^WB/.test(anim.name)).map(anim => ({ name: anim.name, hd: anim.mainObj.builder.hdOverride?.identity,
            frame: anim.mainObj.builder.getFrame() })));
    assert(results.waterfalls.length > 0 && results.waterfalls.every(anim => anim.hd));
    await page.waitForTimeout(700);
    results.waterfallPhase = await sample(() => window.__ra2debug.mapRenderable.tileLayer.anims
        .filter(anim => /^WB/.test(anim.name)).map(anim => ({ name: anim.name, frame: anim.mainObj.builder.getFrame() })));
    assert(results.waterfallPhase.some((anim, index) => anim.frame !== results.waterfalls[index].frame));
    // Use the paid queue and ordinary attack order, reusing accepted M1 faction artwork.
    results.production = await sample(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        f.productionBuildings = ['GACNST', 'GAPOWR', 'GAREFN', 'GAPILE', 'GAWEAP'].map(name => f.building(name));
        f.produced = [];
        g.events.subscribe(event => {
            if (event.type === 44 && event.target.owner === d.localPlayer && event.target.name === 'MTNK') f.produced.push(event.target);
        });
        return { fixture: 'Legal owned prerequisites; ordinary paid vehicle production with unchanged cost and native ticks.',
            credits: f.player.credits, buildings: f.productionBuildings.map(building => building.name) };
    });
    await page.waitForFunction(() => window.__allied.productionBuildings.every(building => building.buildStatus === 1));
    await page.evaluate(() => window.__ra2debug.actionsApi.queueForProduction(3, 7, 'MTNK', 1));
    await page.waitForFunction(() => window.__allied.produced.some(unit => unit.isSpawned), undefined, { timeout: 45000 });
    await page.waitForFunction(() => window.__allied.sample(window.__allied.produced[0]).vxlHd);
    results.production.unit = await sample(() => window.__allied.sample(window.__allied.produced[0]));
    await pan(results.production.unit); await startClip(); await capture('native-paid-production');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, tank = f.produced[0];
        f.combatTarget = f.spawn('HTNK', 7, { rx: tank.tile.rx + 3, ry: tank.tile.ry }, f.enemy);
        f.combatTarget.attackTrait.setDisabled(true); f.combatTarget.moveTrait.setDisabled(true);
        f.combatHealth = f.combatTarget.healthTrait.health;
        d.actionsApi.orderUnits([tank.id], 2, f.combatTarget.id);
    });
    await page.waitForFunction(() => window.__allied.combatTarget.healthTrait.health < window.__allied.combatHealth,
        undefined, { timeout: 45000 });
    results.production.combat = await sample(() => ({ attacker: window.__allied.sample(window.__allied.produced[0]),
        target: window.__allied.sample(window.__allied.combatTarget),
        targetRhinoHd: !!window.__ra2debug.renderableManager.getRenderableByGameObject(window.__allied.combatTarget)?.rhinoHd?.active,
        beforeHealth: window.__allied.combatHealth }));
    assert(results.production.combat.attacker.vxlHd && results.production.combat.targetRhinoHd);
    await capture('native-combat-damage'); await stopClip('native-paid-production-combat');
    results.status = 'PASS_SELECTED_NATIVE_ENVIRONMENT_ACTIONS';
}
