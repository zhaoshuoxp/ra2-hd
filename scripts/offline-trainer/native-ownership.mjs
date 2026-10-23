export async function validateTrainerOwnership(page, report) {
    report.trainer.ownership = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, t = d.trainer, f = window.trainerFixture;
        const results = [], check = (ok, msg) => { if (!ok) throw Error(msg); results.push(msg); };
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        const enemy = g.getCombatants().find(x => x !== p), step = f.step;
        const send = command => { check(t.send(command), `Accepted ${command.type}`); step(); };
        const transfer = target => send({ type: 'transfer', targets: [target] });
        const create = (name, type, owner = enemy) => {
            const unit = g.createUnitForPlayer(g.rules.getObject(name, type), owner);
            const tiles = g.map.tiles.getAll().filter(tile => Math.hypot(tile.rx - f.base.tile.rx, tile.ry - f.base.tile.ry) < 35);
            const tile = tiles.find(tile => g.map.isWithinBounds(tile) && g.map.getTileZone(tile) !== 2 && g.map.terrain.getPassableSpeed(tile, unit.rules.speedType, unit.isInfantry(), false) > 0 &&
                !g.map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain()));
            if (!tile) throw Error(`No unit fixture tile ${name}`);
            g.spawnObject(unit, tile); unit.attackTrait?.setDisabled(true); unit.moveTrait?.setDisabled(true); return unit;
        };
        send({ type: 'effect', effect: 'power', enabled: true, value: 100000 });
        const transport = create(t.session.edition === 'yr' ? 'BFRT' : 'FV', 7), passenger = create('E2', 3);
        g.limboObject(passenger, { selected: false, inTransport: true }); transport.transportTrait.units.push(passenger);
        transfer(transport); check(passenger.owner === p && transport.transportTrait.units.includes(passenger), 'Captured carrier retains passenger with coherent ownership');
        const controller = create('YURI', 3), victim = create('HTNK', 7, p);
        controller.mindControllerTrait.control(victim, g); check(victim.owner === enemy, 'Native control fixture acquired');
        transfer(victim); check(victim.owner === p && !victim.mindControllableTrait.isActive() && controller.mindControllerTrait.getTargets().length === 0, 'Capturing controlled target cleans controller link');
        controller.mindControllerTrait.control(victim, g); transfer(controller);
        check(victim.owner === p && !victim.mindControllableTrait.isActive(), 'Capturing controller releases victims natively');
        const factory = f.place(p.country.side === 0 ? 'GAWEAP' : p.country.side === 1 ? 'NAWEAP' : 'YAWEAP', enemy); step(90);
        const countBefore = p.production.getFactoryCount(factory.rules.factory); transfer(factory);
        check(p.production.getFactoryCount(factory.rules.factory) === countBefore + 1, 'Captured factory updates production counts');
        const rule = g.rules.getObject('HTNK', 7);
        if (t.session.edition === 'yr') {
            const plant = f.place('NAINDP', enemy); step(90);
            const before = g.sellTrait.computePurchaseValue(rule, p); transfer(plant);
            check(g.sellTrait.computePurchaseValue(rule, p) < before, 'Captured Industrial Plant updates native unit cost');
            const reactor = f.place('YAPOWR', enemy); step(90); const occupant = create('INIT', 3);
            reactor.absorberTrait.enter(occupant, g); const power = p.powerTrait.debugGetState().power;
            transfer(reactor); check(occupant.owner === p && occupant.absorbedBy === reactor && p.powerTrait.debugGetState().power > power, 'Bio Reactor owner, contained infantry and supply stay coherent');
            const robot = create('ROBO', 7, p); step(); check(!robot.poweredUnitTrait.isOnline(), 'Robot starts offline without owned control center');
            const center = f.place('GAROBO', enemy); step(90); transfer(center); step();
            check(robot.poweredUnitTrait.isOnline(), 'Captured Robot Control enables owned robot');
            const miner = f.place('YAREFN', enemy); miner.slaveMinerTrait.nextScan = g.currentTick + 10000; step(200);
            const slaves = miner.slaveMinerTrait.getSlaves(); check(slaves.length > 0, 'Native Slave Miner spawned workers');
            transfer(slaves[0]); check(!slaves[0].slaveMaster && !miner.slaveMinerTrait.getSlaves().includes(slaves[0]), 'Individually captured slave is detached and controllable');
            transfer(miner); check(miner.slaveMinerTrait.getSlaves().every(u => u.owner === p && u.slaveMaster === miner), 'Captured Slave Miner retains worker links under new owner');
            const bunker = f.place('NABNKR', enemy); step(90); const defender = create('E2', 3);
            g.limboObject(defender, { selected: false }); bunker.garrisonTrait.units.push(defender);
            transfer(bunker); check(defender.owner === p, 'Captured garrison transfers contained defender');
            bunker.garrisonTrait.evacuate(g); check(defender.isSpawned && defender.owner === p && bunker.owner === p, 'Captured garrison evacuates with coherent owners');
            const vats = f.place('NACLON', enemy); step(90); transfer(vats);
            send({ type: 'effect', effect: 'technology', enabled: true }); send({ type: 'effect', effect: 'production', enabled: true, value: 1 });
            const produced = [], listener = g.events.subscribe(e => { if (e.type === 44 && e.target.owner === p && e.target.name === 'E2') produced.push(e.factory?.name); });
            f.enqueue(2, 3, 'E2'); step(150); listener.dispose?.();
            check(produced.includes('NACLON') && produced.length >= 2, 'Captured Cloning Vats participates in native accelerated production');
        }
        send({ type: 'reset' }); g.speed.value = g.desiredSpeed.value = 6;
        return results;
    });
}
