import assert from 'node:assert/strict';

// Tactical assistance stays in the ordinary input queue. Source inspection
// guides routes; every actor target must be currently visible and detected.
export async function advanceSupportedPrisms(pilot, goal, army, label, maximum = 650) {
    const commands = pilot.commands;
    for (let i = 0; i < maximum; i++) {
        if (await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) {
            await commands.step(60, { defend: false });
            if (i % 12 === 0) await pilot.observe(label + '-original-locked-presentation-' + i);
            continue;
        }
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
            const danger = visible.filter(unit => unit.isUnit() && unit.zone !== 1 && distance(unit) < 12
                && (unit.primaryWeapon || unit.rules.threatPosed > 0))
                .sort((a, b) => Number(b.name === 'YURI') - Number(a.name === 'YURI') || distance(a) - distance(b))[0];
            const tower = visible.filter(unit => unit.isBuilding() && distance(unit) < 18
                && (unit.rules.isBaseDefense || unit.primaryWeapon || unit.bunkerTrait?.unit
                    || unit.garrisonTrait?.getOccupants().length))
                .sort((a, b) => distance(a) - distance(b))[0];
            const psychic = visible.filter(unit => unit.name === 'YAPSYT' && distance(unit) < 18)
                .sort((a, b) => distance(a) - distance(b))[0];
            const airObjective = objective.isUnit() && objective.zone === 1 && visible.includes(objective) ? objective : undefined;
            const target = danger && distance(danger) < 6 ? danger : psychic ?? tower ?? danger
                ?? (!airObjective && !shroud.isShrouded(objective.tile, objective.tileElevation) ? objective : undefined);
            const air = own.filter(unit => army.air.includes(unit.id));
            const airTarget = airObjective ?? (danger && Math.min(...air.map(unit => Math.hypot(unit.tile.rx - danger.tile.rx,
                unit.tile.ry - danger.tile.ry))) < 16 ? danger : undefined);
            const orders = [{ ids: prisms.map(unit => unit.id), type: target ? 2 : airObjective ? 11 : 4,
                target: target?.id, tile: target || airObjective ? undefined : goal.tile }];
            if (air.length) orders.push({ ids: air.map(unit => unit.id), type: airTarget ? 2 : 0,
                target: airTarget?.id, tile: airTarget ? undefined : center.map(Math.round) });
            return { cleared: false, center, prisms: prisms.length, air: air.length, target: target?.name, orders };
        }, { army, goal });
        if (plan.cleared) return;
        for (const order of plan.orders) await commands.order(order.ids, order.type, order.target, order.tile);
        await commands.step(60, { defend: false });
        if (i % 12 === 0) await pilot.observe(label + '-' + i);
    }
    assert.fail('Original objective remains: ' + JSON.stringify(goal));
}
