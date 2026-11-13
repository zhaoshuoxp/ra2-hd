import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    let commands = pilot.commands;
    const fortress = state.own.find(unit => unit.name === 'BFRT' && unit.spawned);
    if (fortress && !fortress.passengers?.length) {
        await commands.order(['GGI'], 17, fortress.id); await commands.step(300, { defend: false });
        state = await pilot.observe('ordinary-hollywood-fortress-boarding');
    }
    const column = { tanks: ['MTNK', 'BFRT', 'CLNT', 'STLN', 'ARND'], artillery: ['SREF'], escort: [] };
    const advance = async (goal, label, until, maximum = 650) => {
        for (let i = 0; i < maximum; i++) {
            if (await until()) return;
            const plan = await orderGroundColumn(commands, goal, column);
            assert(plan && plan.front, 'The ordinary Hollywood assault force was lost');
            const objective = await pilot.page.evaluate(({ goal, center }) => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const unit = g.world.getAllObjects().find(unit => unit.isBuilding() && !unit.isDestroyed
                    && unit.tile.rx === goal[0] && unit.tile.ry === goal[1] && unit.owner !== g.localPlayer);
                return unit && !shroud.isShrouded(unit.tile, unit.tileElevation)
                    && Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]) < 18 ? unit.id : undefined;
            }, { goal, center: plan.center });
            if (objective !== undefined) await commands.order(column.tanks, 2, objective);
            await commands.step(45, { defend: false });
            if (i % 5 === 0) state = await pilot.observe(label + '-' + i);
            if (!until && plan.distance < 5) return;
        }
        assert(await until(), 'Original Hollywood approach or objective remains: ' + label);
    };
    const grinders = [
        { tile: [193, 102], route: [[182, 120], [191, 110]] },
        { tile: [151, 69], route: [[181, 94], [171, 78], [154, 78]] },
        { tile: [128, 78], route: [[139, 82]] },
        { tile: [104, 127], route: [[121, 102], [110, 119]] },
    ];
    for (const [index, grinder] of grinders.entries()) {
        const gone = () => pilot.page.evaluate(tile => !window.__ra2debug.game.world.getAllObjects()
            .some(unit => unit.name === 'YAGRND' && !unit.isDestroyed && unit.tile.rx === tile[0] && unit.tile.ry === tile[1]), grinder.tile);
        if (await gone()) continue;
        for (const goal of grinder.route) {
            await advance(goal, 'ordinary-hollywood-grinder-approach-' + index + '-' + goal.join('-'),
                () => pilot.page.evaluate(({ goal, names }) => {
                    const units = window.__ra2debug.game.localPlayer.getOwnedObjects()
                        .filter(unit => names.includes(unit.name) && unit.isSpawned && !unit.isDestroyed);
                    return units.length && units.filter(unit => Math.hypot(unit.tile.rx - goal[0], unit.tile.ry - goal[1]) < 8).length >= Math.ceil(units.length / 2);
                }, { goal, names: column.tanks }), 400);
        }
        await advance(grinder.tile, 'original-hollywood-grinder-' + index, gone);
        await pilot.checkpoint('original-grinder-' + index + '-cleared-checkpoint.json');
        if (index === 1) {
            await pilot.restart('Original YR Allied02 first two destroyed grinders and paid assault force');
            commands = pilot.commands;
        }
    }
    for (let stage = 0; stage < 70; stage++) {
        const goal = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, owners = [g.campaign.resolveHouse(9), g.campaign.resolveHouse(14)];
            const army = g.localPlayer.getOwnedObjects().filter(unit => ['SREF', 'BFRT', 'CLNT', 'STLN', 'ARND'].includes(unit.name)
                && unit.isSpawned && !unit.isDestroyed);
            if (!army.length) throw Error('The ordinary Hollywood column was lost');
            const center = army.reduce((sum, unit) => [sum[0] + unit.tile.rx / army.length, sum[1] + unit.tile.ry / army.length], [0, 0]);
            const target = owners.flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isBuilding()
                && !unit.isDestroyed && !unit.rules.insignificant).sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                    - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        });
        if (!goal) break;
        await advance(goal.tile, 'original-hollywood-required-base-' + stage + '-' + goal.name,
            () => pilot.page.evaluate(id => !window.__ra2debug.game.world.getAllObjects()
                .some(unit => unit.id === id && !unit.isDestroyed), goal.id));
        if (stage % 5 === 0) await pilot.checkpoint('last-hollywood-base-goals-checkpoint.json');
    }
    for (let i = 0; i < 100 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-hollywood-result-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_ALLIED02_FOUR_GRINDERS_BOTH_BASE_HOUSES_AND_SOURCE_VICTORY`;
} catch (error) { failure = error; }
await pilot.finish(failure);
