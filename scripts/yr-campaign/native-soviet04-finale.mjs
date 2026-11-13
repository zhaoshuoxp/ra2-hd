import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    const coordinatedAssault = [];
    commands.groundDefenders = ['HTNK', 'E2']; commands.airDefenders = [];
    const scan = async () => pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const tanks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
        const center = tanks.reduce((p, unit) => [p[0] + unit.tile.rx / tanks.length, p[1] + unit.tile.ry / tanks.length], [0, 0]);
        const visible = unit => g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
            .some(tile => !shroud.isShrouded(tile, unit.tileElevation));
        const priority = ['YURI', 'YAPSYT', 'YACNST', 'YABRCK', 'YAPOWR'];
        const targets = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
            && unit.tile.rx > 80 && unit.tile.ry < 55 && priority.includes(unit.name)
            && (unit.name !== 'YURI' || Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]) < 14)
            && !g.alliances.areAllied(g.localPlayer, unit.owner) && visible(unit))
            .sort((a, b) => priority.indexOf(a.name) - priority.indexOf(b.name)
                || Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                    - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]));
        const hero = g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).find(unit => unit.name === 'RMNV' && !unit.isDestroyed);
        const control = hero?.mindControllableTrait?.getController();
        const shield = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
        const trucks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'DTRUCK' && unit.isSpawned && !unit.isDestroyed);
        const demolition = g.world.getAllObjects().filter(unit => unit.name === 'YAPOWR' && unit.owner.name === 'YuriCountry'
            && unit.isSpawned && !unit.isDestroyed && visible(unit)
            && (!hero || Math.hypot(unit.tile.rx - hero.tile.rx, unit.tile.ry - hero.tile.ry) > 11))
            .sort((a, b) => Math.hypot(a.tile.rx - 103, a.tile.ry - 32) - Math.hypot(b.tile.rx - 103, b.tile.ry - 32))[0];
        return { tick: g.currentTick, tanks: tanks.map(unit => unit.id), target: targets[0]?.id,
            ready: shield?.status === 2, status: shield?.status, center,
            trucks: trucks.map(unit => ({ id: unit.id, tile: [unit.tile.rx, unit.tile.ry], shielded: unit.invulnerableTrait.isActive() })),
            demolition: demolition && { id: demolition.id, tile: [demolition.tile.rx, demolition.tile.ry] },
            hostileClone: targets.find(unit => unit.name === 'YURI')?.id,
            safe: g.campaign.machine.variables.get('18'),
            controller: control && visible(control) ? control.id : undefined,
            hero: hero && { id: hero.id, owner: hero.owner.name, health: hero.healthTrait.health,
                tile: [hero.tile.rx, hero.tile.ry] } };
    });
    const spy = await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('SpyPlaneSpecial');
        if (weapon?.status !== 2) return;
        d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: 104, ry: 25 });
        return { tick: g.currentTick, type: weapon.rules.type, tile: [104, 25] };
    });
    if (spy) pilot.report.commands.push({ kind: 'ordinary-source-spy-plane', ...spy });
    if (process.argv.includes('--coordinate-shield')) {
        const formation = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game;
            const tanks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
            const trucks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'DTRUCK' && unit.isSpawned && !unit.isDestroyed);
            if (tanks.length !== 3 || trucks.length !== 2) throw Error('Resume the intact original paid three-tank and two-truck force');
            return [...tanks.map((unit, i) => ({ id: unit.id, tile: [[101, 56], [102, 58], [102, 57]][i] })),
                ...trucks.map((unit, i) => ({ id: unit.id, tile: [[102, 56], [100, 56]][i] }))];
        });
        for (const unit of formation) await commands.order([unit.id], 0, undefined, unit.tile);
        for (let i = 0; i < 8; i++) {
            await commands.step(5);
            if (await pilot.page.evaluate(formation => formation.every(wanted => {
                const unit = window.__ra2debug.game.localPlayer.getOwnedObjects().find(unit => unit.id === wanted.id);
                return unit?.tile.rx === wanted.tile[0] && unit.tile.ry === wanted.tile[1];
            }), formation)) break;
        }
        const cast = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
            if (weapon?.status !== 2) throw Error('Original Iron Curtain is not ready for the ordinary coordinated assault');
            d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: 101, ry: 57 });
            return { tick: g.currentTick, tile: [101, 57] };
        });
        pilot.report.commands.push({ kind: 'ordinary-coordinated-iron-curtain', ...cast });
        await commands.step(1);
        pilot.report.originalShieldedForce = await pilot.page.evaluate(formation => {
            const g = window.__ra2debug.game;
            return formation.map(wanted => {
                const unit = g.localPlayer.getOwnedObjects().find(unit => unit.id === wanted.id);
                return unit && { id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry], shielded: unit.invulnerableTrait.isActive() };
            });
        }, formation);
        assert(pilot.report.originalShieldedForce.every(unit => unit?.shielded), 'The ordinary Iron Curtain must actually protect the complete paid force');
    }
    if (process.argv.includes('--coordinate-shield') || process.argv.includes('--continue-coordinated')) {
        state = await pilot.observe('original-shielded-force-starting-assault');
        const trucks = state.own.filter(unit => unit.name === 'DTRUCK'); assert.equal(trucks.length, 2);
        for (let i = 0; i < 2; i++) {
            coordinatedAssault.push({ truck: trucks[i].id, tile: [[94, 33], [103, 32]][i], ordered: false });
            await commands.order([trucks[i].id], 0, undefined, [[94, 37], [103, 35]][i]);
        }
    }
    let previousTarget, previousDroneTarget, truckOrder;
    for (let i = 0; i < 600; i++) {
        const plan = await scan(); assert(plan.tanks.length, 'The ordinary northern tanks were lost');
        for (const task of coordinatedAssault) if (!task.ordered) {
            const visible = await pilot.page.evaluate(tile => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                return g.world.getAllObjects().find(unit => unit.isBuilding() && unit.isSpawned && !unit.isDestroyed
                    && unit.tile.rx === tile[0] && unit.tile.ry === tile[1]
                    && !shroud.isShrouded(unit.tile, unit.tileElevation))?.id;
            }, task.tile);
            if (visible !== undefined) { await commands.order([task.truck], 2, visible); task.ordered = true; }
        }
        if (plan.ready) {
            const cast = await pilot.page.evaluate(() => {
                const d = window.__ra2debug, g = d.game, weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
                const units = g.localPlayer.getOwnedObjects().filter(unit => ['DTRUCK', 'APOC'].includes(unit.name) && unit.isSpawned && !unit.isDestroyed);
                const unit = units.find(unit => unit.name === 'DTRUCK') ?? units[0];
                d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: unit.tile.rx, ry: unit.tile.ry });
                return { tick: g.currentTick, id: unit.id, tile: [unit.tile.rx, unit.tile.ry] };
            });
            pilot.report.commands.push({ kind: 'ordinary-iron-curtain-northern-goals', ...cast });
        }
        const protectedTruck = plan.trucks.find(unit => unit.shielded);
        const safeDemolition = plan.demolition && (!plan.hero || Math.hypot(plan.demolition.tile[0] - plan.hero.tile[0],
            plan.demolition.tile[1] - plan.hero.tile[1]) > 11);
        if (!coordinatedAssault.length && protectedTruck && safeDemolition
            && truckOrder !== protectedTruck.id + ':' + plan.demolition.id) {
            await commands.order([protectedTruck.id], 2, plan.demolition.id);
            truckOrder = protectedTruck.id + ':' + plan.demolition.id;
        }
        const attack = !plan.safe ? plan.target : plan.controller;
        const attackType = !plan.safe ? 2 : 3;
        if (attack !== undefined && previousTarget !== attack + ':' + attackType) {
            await commands.order(['APOC', 'V3'], attackType, attack); previousTarget = attack + ':' + attackType;
        }
        if (plan.hostileClone !== undefined && previousDroneTarget !== plan.hostileClone) {
            await commands.order(['DRON'], 2, plan.hostileClone); previousDroneTarget = plan.hostileClone;
        }
        if (plan.safe && plan.hero?.owner === 'Germans') break;
        await commands.step(15);
        if (i % 5 === 0) state = await pilot.observe('original-yard-power-and-controller-goals-' + i);
        if (i % 40 === 0) await pilot.checkpoint('last-northern-power-checkpoint.json');
    }
    pilot.report.sourceGoals = await scan();
    assert(pilot.report.sourceGoals.safe, 'The original yard and power safety conditions remain incomplete');
    assert.equal(pilot.report.sourceGoals.hero?.owner, 'Germans', 'Original Romanov control was not restored');
    await pilot.restart('Original YR Soviet04 safe airport and recovered Romanov'); commands = pilot.commands;
    await pilot.checkpoint('safe-recovered-romanov-checkpoint.json');
    await commands.order(['RMNV'], 0, undefined, [103, 18]);
    for (let i = 0; i < 300 && state.result !== 'victory'; i++) {
        await commands.step(45);
        if (i % 5 === 0) state = await pilot.observe('original-safe-airport-departure-' + i);
    }
    state = await pilot.observe('original-complete-romanov-result'); assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_DISCOVERY_CAPTURE_RELEASE_YARD_POWER_SAFETY_RESTART_AND_AIRPORT_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
