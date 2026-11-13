import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { orderGroundColumn } from './ordinary-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2']; commands.airDefenders = [];
    assert(await pilot.page.evaluate(() => window.__ra2debug.game.campaign.machine.variables.get('18')),
        'Resume the legitimately completed source yard and power safety goals');
    if (!process.argv.includes('--advance-only')) {
        await commands.order(['NAWEAP'], 0, undefined, [95, 141]);
        await commands.queue('DRON', 2); await commands.queue('APOC', 2);
        for (let i = 0; i < 170; i++) {
            await commands.step(60); state = await pilot.observe('ordinary-airport-escort-production-' + i);
            if (state.own.filter(unit => unit.name === 'DRON').length >= 2
                && state.own.filter(unit => unit.name === 'APOC').length >= 2) break;
        }
        assert(state.own.filter(unit => unit.name === 'APOC').length >= 2, 'Ordinary paid airport escort production failed');
        await pilot.checkpoint('paid-airport-escort-checkpoint.json');
    }
    let previousClone;
    for (const goal of [[110, 115], [128, 91], [142, 75], [135, 60], [121, 48], [100, 40]]) {
        for (let i = 0; i < 90; i++) {
            const plan = await orderGroundColumn(commands, goal, { artillery: [], escort: [] });
            assert(plan, 'The ordinary airport escort was lost');
            const clone = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const tanks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
                return g.world.getAllObjects().find(unit => unit.name === 'YURI' && unit.isSpawned && !unit.isDestroyed
                    && !g.alliances.areAllied(g.localPlayer, unit.owner) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                    && tanks.some(tank => Math.hypot(tank.tile.rx - unit.tile.rx, tank.tile.ry - unit.tile.ry) < 14))?.id;
            });
            if (clone !== undefined) {
                if (previousClone !== clone) await commands.order(['DRON'], 2, clone);
                previousClone = clone;
            } else {
                await commands.order(['DRON'], 0, undefined, [Math.round(plan.center[0]), Math.round(plan.center[1])]);
                previousClone = undefined;
            }
            await commands.step(60);
            if (i % 5 === 0) state = await pilot.observe('ordinary-airport-approach-' + goal.join('-') + '-' + i);
            if (plan.distance < 5) break;
        }
        await pilot.checkpoint('last-airport-approach-checkpoint.json');
    }
    let previousGun;
    for (let i = 0; i < 250; i++) {
        const plan = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const tanks = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'APOC' && unit.isSpawned && !unit.isDestroyed);
            const guns = g.world.getAllObjects().filter(unit => unit.name === 'YAGGUN' && unit.owner.name === 'Arabs'
                && unit.isSpawned && !unit.isDestroyed && unit.tile.rx > 80 && unit.tile.ry < 55);
            const target = guns.filter(unit => !shroud.isShrouded(unit.tile, unit.tileElevation))
                .sort((a, b) => Math.min(...tanks.map(tank => Math.hypot(tank.tile.rx - a.tile.rx, tank.tile.ry - a.tile.ry)))
                    - Math.min(...tanks.map(tank => Math.hypot(tank.tile.rx - b.tile.rx, tank.tile.ry - b.tile.ry))))[0];
            const weapon = g.localPlayer.superWeaponsTrait.get('IronCurtainSpecial');
            let shield;
            if (weapon?.status === 2 && target && tanks.length) {
                const tile = tanks[0].tile;
                d.actionsApi.activateSuperWeapon(weapon.rules.type, { rx: tile.rx, ry: tile.ry });
                shield = { tick: g.currentTick, tile: [tile.rx, tile.ry] };
            }
            return { target: target?.id, remaining: guns.length, tanks: tanks.length, shield };
        });
        assert(plan.tanks, 'The ordinary anti-aircraft defense assault was lost');
        if (!plan.remaining) break;
        if (plan.shield) pilot.report.commands.push({ kind: 'ordinary-iron-curtain-airport-escort', ...plan.shield });
        if (plan.target !== undefined && previousGun !== plan.target) {
            await commands.order(['APOC'], 2, plan.target); previousGun = plan.target;
        } else if (plan.target === undefined) await commands.order(['APOC'], 0, undefined, [103, 23]);
        await commands.step(30);
        if (i % 5 === 0) state = await pilot.observe('ordinary-airport-gun-clearance-' + i);
    }
    await pilot.restart('Original YR Soviet04 yard and power goals with the airport defenses cleared');
    commands = pilot.commands;
    await pilot.checkpoint('original-safe-airport-and-captured-romanov-checkpoint.json');
    const controller = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return g.getAllPlayers().flatMap(owner => owner.getOwnedObjects(true)).find(unit => unit.name === 'RMNV' && !unit.isDestroyed)
            ?.mindControllableTrait?.getController()?.id;
    });
    if (controller !== undefined) {
        await commands.order(['APOC', 'DRON'], 3, controller);
        for (let i = 0; i < 150; i++) {
            await commands.step(15); state = await pilot.observe('original-final-romanov-release-' + i);
            if (state.own.some(unit => unit.name === 'RMNV')) break;
        }
    }
    assert(state.own.some(unit => unit.name === 'RMNV'), 'Original Romanov has not returned to player control');
    await commands.order(['RMNV'], 0, undefined, [103, 18]);
    for (let i = 0; i < 280 && state.result !== 'victory'; i++) {
        await commands.step(30);
        if (i % 5 === 0) state = await pilot.observe('original-safe-romanov-departure-' + i);
    }
    state = await pilot.observe('original-complete-romanov-result'); assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_YARD_POWER_SAFETY_AIRPORT_DEFENSES_RESTART_ROMANOV_RELEASE_AND_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
