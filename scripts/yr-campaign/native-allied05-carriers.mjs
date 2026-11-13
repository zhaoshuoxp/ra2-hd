import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all05umd.map');
let failure;
try {
    let state = await pilot.open();
    let commands = pilot.commands;
    commands.groundDefenders = ['SREF', 'MTNK', 'E1', 'GGI'];
    commands.airDefenders = ['FV', 'GGI', 'JUMPJET']; commands.groundPriority = ['YURI', 'MIND', 'VIRUS'];
    await commands.order(['SREF', 'JUMPJET'], 0, undefined, [53, 90]);
    if (state.own.filter(unit => unit.name === 'CARRIER').length < 6) {
        await commands.build('GAPOWR', [45, 111]);
        for (const [name, tile] of [['AMRADR', [43, 100]], ['GAWEAP', [47, 108]], ['GATECH', [42, 107]],
            ['GASPYSAT', [44, 105]]]) {
            state = await pilot.observe('ordinary-sydney-carrier-prerequisites-' + name);
            if (!state.own.some(unit => unit.name === name)) await commands.build(name, tile);
        }
        for (const tile of [[56, 87], [54, 100]]) await commands.build('ATESLA', tile);
        await commands.queue('CARRIER', 6); await commands.queue('AEGIS', 2);
        for (let i = 0; i < 900; i++) {
            await commands.attackVisible(['DEST', 'DLPH'], undefined, 'any');
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe('ordinary-sydney-paid-carrier-and-aegis-production-' + i);
            assert(state.own.some(unit => unit.name === 'GACNST'));
            if (state.own.filter(unit => unit.name === 'CARRIER').length >= 6
                && state.own.filter(unit => unit.name === 'AEGIS').length >= 2) break;
        }
    }
    state = await pilot.observe('original-sydney-carrier-strike-fleet');
    assert(state.own.filter(unit => unit.name === 'CARRIER').length >= 6);
    await pilot.checkpoint('original-sydney-carrier-fleet-checkpoint.json');
    let savedStrike = false;
    for (let stage = 0; stage < 100 && !state.result; stage++) {
        const goal = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, carriers = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'CARRIER'
                && unit.isSpawned && !unit.isDestroyed);
            if (!carriers.length) throw Error('The ordinary Sydney carrier fleet was lost');
            const center = carriers.reduce((sum, unit) => [sum[0] + unit.tile.rx / carriers.length,
                sum[1] + unit.tile.ry / carriers.length], [0, 0]);
            const buildings = ['BadGuy1 House', 'BadGuy2 House'].flatMap(name => g.campaign.resolveHouse(name).getOwnedObjects())
                .filter(unit => unit.isBuilding() && !unit.isDestroyed && !unit.rules.insignificant);
            const target = buildings.sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        });
        if (!goal) break;
        let targeted = false, cleared = false;
        for (let i = 0; i < 800; i++) {
            const plan = await pilot.page.evaluate(goal => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const target = g.world.getAllObjects().find(unit => unit.id === goal.id && !unit.isDestroyed);
                if (!target) return { cleared: true };
                const fleet = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'CARRIER' && unit.isSpawned && !unit.isDestroyed);
                if (!fleet.length) throw Error('The original paid carrier fleet was lost');
                const center = fleet.reduce((sum, unit) => [sum[0] + unit.tile.rx / fleet.length,
                    sum[1] + unit.tile.ry / fleet.length], [0, 0]);
                const water = g.map.tiles.getAll().filter(tile => Math.hypot(tile.rx - center[0], tile.ry - center[1]) < 6
                    && g.map.terrain.getPassableSpeed(tile, 4, false, false) > 0)
                    .sort((a, b) => Math.hypot(a.rx - center[0], a.ry - center[1]) - Math.hypot(b.rx - center[0], b.ry - center[1]))[0];
                return { cleared: false, visible: !shroud.isShrouded(target.tile, target.tileElevation),
                    water: water && [water.rx, water.ry], inputLocked: g.campaign.inputLocked };
            }, goal);
            if (plan.cleared) { cleared = true; break; }
            if (!plan.inputLocked) {
                if (plan.visible && !targeted) { await commands.order(['CARRIER'], 2, goal.id); targeted = true; }
                if (i % 10 === 0 && plan.water) await commands.order(['AEGIS'], 0, undefined, plan.water);
                await commands.attackVisible(['DEST', 'DLPH'], undefined, 'any');
            }
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe('ordinary-sydney-carrier-goal-' + stage + '-' + goal.name + '-' + i);
        }
        assert(cleared, 'Original carrier objective remains: ' + JSON.stringify(goal));
        state = await pilot.observe('original-sydney-carrier-objective-cleared-' + stage + '-' + goal.name);
        if (!state.result) await pilot.checkpoint('last-sydney-carrier-progress-checkpoint.json');
        if (!savedStrike && goal.name === 'NACLON') {
            await pilot.restart('Original YR Allied05 first cloning vat destroyed by paid carriers and active aircraft');
            commands = pilot.commands; savedStrike = true;
        }
    }
    for (let i = 0; i < 80 && !state.result; i++) {
        await commands.step(60); state = await pilot.observe('original-sydney-carrier-victory-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED05_PAID_CARRIERS_AEGIS_NAVAL_DEFENSE_THREE_CLONING_VATS_BOTH_BASES_AND_SOURCE_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
