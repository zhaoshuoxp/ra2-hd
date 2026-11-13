import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const mission = process.argv.find(value => value.startsWith('--mission='))?.slice(10) ?? 'all03umd.map';
const pilot = new NativeCampaignPilot(process.argv[2], mission);
let failure;
try {
    await pilot.open();
    pilot.report.scope = 'Original mission actors, supported map reveal and protection. Ordinary infantry occupation, '
        + 'automatic garrison fire without attack orders, ordinary sale and named restart. No source, actor, owner, '
        + 'health, rule, trigger or result assignment. This is a modified-play regression.';
    const pair = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        d.trainer.setEnabled(true);
        const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isInfantry() && unit.isSpawned
            && !unit.isDestroyed && unit.rules.occupier);
        if (!own.length) throw Error('Original occupier infantry absent');
        if (!d.trainer.send({ type: 'reveal' }) || !d.trainer.send({ type: 'protect', targets: own }))
            throw Error('Supported reveal/protection rejected');
        const enemies = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed
            && unit.zone !== 1 && !unit.owner.isNeutral && !g.areFriendly(unit, own[0])
            && !['YURI', 'MIND'].includes(unit.name));
        const controllers = g.world.getAllObjects().filter(unit => ['YURI', 'MIND'].includes(unit.name)
            && unit.isSpawned && !unit.isDestroyed && !g.areFriendly(unit, own[0]));
        const candidates = g.world.getAllObjects().filter(unit => unit.isBuilding() && unit.isSpawned && !unit.isDestroyed
            && unit.owner.isNeutral && !unit.rules.unsellable && unit.garrisonTrait?.canBeOccupied()
            && !unit.garrisonTrait.isOccupied()
            && controllers.every(controller => Math.hypot(controller.tile.rx-unit.tile.rx, controller.tile.ry-unit.tile.ry) > 12)).flatMap(building => {
                const enemy = enemies.find(unit => Math.hypot(unit.tile.rx-building.tile.rx, unit.tile.ry-building.tile.ry) < 5);
                if (!enemy) return [];
                const soldiers = [...own].sort((a, b) => Math.hypot(a.tile.rx-building.tile.rx, a.tile.ry-building.tile.ry)
                    - Math.hypot(b.tile.rx-building.tile.rx, b.tile.ry-building.tile.ry));
                return [{ building, enemy, soldier: soldiers[0], distance: Math.hypot(soldiers[0].tile.rx-building.tile.rx,
                    soldiers[0].tile.ry-building.tile.ry) }];
            }).sort((a, b) => a.distance-b.distance);
        const best = candidates[0];
        if (!best) throw Error('No original neutral garrison near a real hostile ground unit');
        window.__garrisonShots = [];
        g.events.subscribe(2, event => {
            if (event.gameObject === best.building) window.__garrisonShots.push({ tick: g.currentTick,
                id: event.gameObject.id, target: event.target?.obj?.id, weapon: event.weapon?.rules.name });
        });
        return { soldier: best.soldier.id, building: best.building.id, name: best.building.name,
            target: best.enemy.id, distance: best.distance, tile: [best.building.tile.rx, best.building.tile.ry] };
    });
    pilot.report.pair = pair;
    await pilot.commands.step(1, { defend: false });
    await pilot.commands.order([pair.soldier], 8, pair.building);
    for (let i = 0; i < 400; i++) {
        await pilot.commands.step(15, { defend: false, repair: false });
        const occupied = await pilot.page.evaluate(pair => {
            const g = window.__ra2debug.game, b = g.world.getObjectById(pair.building);
            return b.garrisonTrait.getOccupants().some(unit => unit.id === pair.soldier);
        }, pair);
        if (occupied) break;
    }
    await pilot.page.evaluate(pair => {
        const d = window.__ra2debug, g = d.game, b = g.world.getObjectById(pair.building);
        if (b.owner !== g.localPlayer || !b.garrisonTrait.isOccupied()) throw Error('Ordinary occupation did not finish');
        if (!d.trainer.send({ type: 'protect', targets: [b] })) throw Error('Supported occupied-building protection rejected');
        d.worldInteraction.minimapHandler.panToTile(b.tile);
    }, pair);
    for (let i = 0; i < 120; i++) {
        await pilot.commands.step(15, { defend: false, repair: false });
        if (await pilot.page.evaluate(() => window.__garrisonShots.length > 0)) break;
    }
    pilot.report.automaticShots = await pilot.page.evaluate(() => window.__garrisonShots);
    assert(pilot.report.automaticShots.length > 0, 'The occupied original civilian building must acquire and fire automatically');
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-garrison-automatic-fire.png') });
    await pilot.page.evaluate(id => window.__ra2debug.actionsApi.sellObject(id), pair.building);
    for (let i = 0; i < 100; i++) {
        await pilot.commands.step(15, { defend: false, repair: false });
        if (await pilot.page.evaluate(id => !window.__ra2debug.game.world.hasObjectId(id), pair.building)) break;
    }
    pilot.report.afterSale = await pilot.page.evaluate(pair => {
        const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjectById(pair.soldier);
        return { buildingAbsent: !g.world.hasObjectId(pair.building), unitAlive: !!unit && !unit.isDestroyed,
            unitSpawned: unit?.isSpawned, unitInLimbo: !!unit?.limboData };
    }, pair);
    assert(pilot.report.afterSale.buildingAbsent && pilot.report.afterSale.unitAlive
        && pilot.report.afterSale.unitSpawned && !pilot.report.afterSale.unitInLimbo);
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, home = Number(g.campaign.definition.ini.getSection('Basic').getString('HomeCell'));
        d.worldInteraction.minimapHandler.panToTile(g.map.getTileAtWaypoint(home));
    });
    await pilot.page.waitForTimeout(100);
    await pilot.restart('Original civilian garrison automatic fire and resident-safe sale');
    pilot.report.status = 'PASS_NATIVE_SUPPORTED_ORIGINAL_GARRISON_AUTOMATIC_FIRE_RESIDENT_SAFE_SALE_AND_NAMED_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);
