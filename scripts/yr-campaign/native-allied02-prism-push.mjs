import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['CLNT', 'MTNK', 'SREF', 'E1', 'GGI'];
    commands.airDefenders = ['FV', 'GGI'];
    await commands.queue('SREF', 6);
    await commands.queue('JUMPJET', 12);
    await commands.order(['GAWEAP'], 0, undefined, [166, 126]);
    await commands.order(['GAPILE'], 0, undefined, [163, 122]);
    for (let i = 0; i < 160; i++) {
        await commands.step(90);
        if (i % 10 === 0) state = await pilot.observe('ordinary-hollywood-prism-and-air-support-production-' + i);
        if (!state.queues.some(queue => queue.items.some(item => ['SREF', 'JUMPJET'].includes(item.name)))) break;
    }
    state = await pilot.observe('ordinary-hollywood-paid-supported-prism-army');
    const army = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
        const prisms = own.filter(unit => unit.name === 'SREF').sort((a, b) =>
            Math.hypot(b.tile.rx - 166, b.tile.ry - 127) - Math.hypot(a.tile.rx - 166, a.tile.ry - 127));
        return { prisms: prisms.slice(0, -4).map(unit => unit.id), air: own.filter(unit => unit.name === 'JUMPJET').map(unit => unit.id),
            defense: prisms.slice(-4).map(unit => unit.id) };
    });
    assert(army.prisms.length >= 10); assert(army.air.length >= 8);
    pilot.report.army = army;
    await pilot.checkpoint('original-supported-prism-army-checkpoint.json');
    for (let stage = 0; stage < 100; stage++) {
        const goal = await pilot.page.evaluate(ids => {
            const g = window.__ra2debug.game;
            const units = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id) && unit.isSpawned && !unit.isDestroyed);
            if (!units.length) throw Error('The ordinary prism assault force was lost');
            const center = units.reduce((sum, unit) => [sum[0] + unit.tile.rx / units.length,
                sum[1] + unit.tile.ry / units.length], [0, 0]);
            const grinders = g.world.getAllObjects().filter(unit => unit.name === 'YAGRND' && !unit.isDestroyed);
            const buildings = grinders.length ? grinders : [g.campaign.resolveHouse(9), g.campaign.resolveHouse(14)]
                .flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isBuilding() && !unit.isDestroyed && !unit.rules.insignificant);
            const target = buildings.sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        }, army.prisms);
        if (!goal) break;
        let cleared = false;
        for (let i = 0; i < 650; i++) {
            const plan = await pilot.page.evaluate(({ army, goal }) => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
                const prisms = own.filter(unit => army.prisms.includes(unit.id));
                if (!prisms.length) throw Error('The ordinary supported prism column was lost');
                const objective = g.world.getAllObjects().find(unit => unit.id === goal.id && !unit.isDestroyed);
                if (!objective) return { cleared: true };
                const center = prisms.reduce((sum, unit) => [sum[0] + unit.tile.rx / prisms.length,
                    sum[1] + unit.tile.ry / prisms.length], [0, 0]);
                const distance = unit => Math.min(...prisms.map(tank => Math.hypot(tank.tile.rx - unit.tile.rx, tank.tile.ry - unit.tile.ry)));
                const visible = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                    && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                    && unit.rules.legalTarget !== false && !unit.rules.invisibleInGame
                    && g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                        .some(tile => !shroud.isShrouded(tile, unit.tileElevation))
                    && !unit.cloakableTrait?.isCloaked()
                    && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
                const danger = visible.filter(unit => unit.isUnit() && unit.zone !== 1 && distance(unit) < 12)
                    .sort((a, b) => Number(b.name === 'YURI') - Number(a.name === 'YURI') || distance(a) - distance(b))[0];
                const tower = visible.filter(unit => unit.isBuilding() && unit.rules.isBaseDefense && distance(unit) < 16)
                    .sort((a, b) => distance(a) - distance(b))[0];
                const target = danger ?? tower ?? (!shroud.isShrouded(objective.tile, objective.tileElevation) ? objective : undefined);
                const air = own.filter(unit => army.air.includes(unit.id));
                const airTarget = danger && Math.min(...air.map(unit => Math.hypot(unit.tile.rx - danger.tile.rx,
                    unit.tile.ry - danger.tile.ry))) < 16 ? danger : undefined;
                const orders = [{ ids: prisms.map(unit => unit.id), type: target ? 2 : 4,
                    target: target?.id, tile: target ? undefined : goal.tile }];
                if (air.length) orders.push({ ids: air.map(unit => unit.id), type: airTarget ? 2 : 0,
                    target: airTarget?.id, tile: airTarget ? undefined : center.map(Math.round) });
                const hero = own.find(unit => unit.name === 'CLNT');
                if (hero && danger?.isInfantry() && Math.hypot(hero.tile.rx - danger.tile.rx, hero.tile.ry - danger.tile.ry) < 10)
                    orders.push({ ids: [hero.id], type: 2, target: danger.id });
                return { cleared: false, center, prisms: prisms.length, air: air.length, target: target?.name, orders };
            }, { army, goal });
            if (plan.cleared) { cleared = true; break; }
            for (const order of plan.orders) await commands.order(order.ids, order.type, order.target, order.tile);
            await commands.step(60, { defend: false });
            if (i % 12 === 0) state = await pilot.observe('ordinary-supported-prism-goal-' + stage + '-' + goal.name + '-' + i);
        }
        assert(cleared, 'Original objective remains: ' + JSON.stringify(goal));
        state = await pilot.observe('original-hollywood-goal-cleared-' + stage + '-' + goal.name);
        await pilot.checkpoint('last-supported-prism-progress-checkpoint.json');
    }
    for (let i = 0; i < 80 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-hollywood-supported-army-result-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED02_PROTECTED_ECONOMY_PAID_SUPPORTED_PRISMS_FOUR_GRINDERS_BOTH_BASES_AND_SOURCE_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
