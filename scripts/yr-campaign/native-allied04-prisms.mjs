import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';
import { completeAllied04Victory } from './allied04-victory-flow.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['TNKD', 'MTNK', 'E1', 'GGI', 'TANY'];
    commands.airDefenders = ['FV', 'GGI'];
    commands.groundPriority = ['YURI', 'MMTNK', 'VIRUS'];
    const waitIncome = async (amount, label) => {
        for (let i = 0; i < 700; i++) {
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe(label + '-' + i);
            assert(state.own.some(unit => unit.name === 'GACNST'));
            assert(state.own.some(unit => unit.name === 'CMIN'), 'The ordinary Egypt economy lost its miners');
            if (state.credits >= amount) return;
        }
        assert.fail('The original paid economy did not earn ' + amount);
    };
    await commands.order(['SHAD'], 0, undefined, [82, 155]);
    await commands.order(['TANY'], 0, undefined, [82, 155]);
    await commands.cancel('MTNK', 999);
    if (state.own.filter(unit => unit.name === 'SREF').length < 10) {
        if (!state.own.some(unit => unit.name === 'GAREFN')) {
            for (const [name, tile] of [['GAPOWR', [84, 166]], ['GAREFN', [85, 157]],
                ['GAPILE', [77, 160]], ['GAWEAP', [87, 162]]]) {
                if (!state.own.some(unit => unit.name === name)) await commands.build(name, tile);
                state = await pilot.observe('ordinary-egypt-early-base-' + name);
            }
        }
        for (const [name, tile] of [['GAAIRC', [80, 168]], ['GAPOWR', [78, 165]],
            ['ATESLA', [77, 155]], ['ATESLA', [88, 156]]]) {
            await commands.build(name, tile); state = await pilot.observe('ordinary-egypt-early-defense-' + name);
        }
        for (let miners = state.own.filter(unit => unit.name === 'CMIN').length; miners < 3; miners++) {
            await waitIncome(1600, 'ordinary-egypt-miner-funding'); await commands.queue('CMIN', 1);
            for (let i = 0; i < 100; i++) {
                await commands.step(90);
                state = await pilot.observe('ordinary-egypt-paid-miner-' + miners + '-' + i);
                if (state.own.filter(unit => unit.name === 'CMIN').length > miners) break;
            }
        }
        await waitIncome(6500, 'ordinary-egypt-technology-funding');
        for (const [name, tile] of [['GAPOWR', [78, 165]], ['GAAIRC', [80, 168]],
            ['GATECH', [78, 171]], ['GASPYSAT', [84, 169]], ['GAPOWR', [86, 169]]]) {
            if (name === 'GAAIRC' && state.own.some(unit => unit.name === name)) continue;
            await commands.build(name, tile); state = await pilot.observe('ordinary-egypt-technology-' + name);
        }
        for (const [name, tile] of [['GAPOWR', [76, 168]], ['GAPOWR', [88, 168]],
            ['ATESLA', [77, 155]], ['ATESLA', [88, 156]], ['ATESLA', [89, 168]], ['ATESLA', [75, 168]]]) {
            await commands.build(name, tile); state = await pilot.observe('ordinary-egypt-fixed-defense-' + name + '-' + tile.join('-'));
        }
        await commands.queue('FV', 3); await commands.queue('GGI', 8);
        await commands.queue('SREF', 20); await commands.queue('JUMPJET', 12);
        await commands.order(['GAWEAP'], 0, undefined, [83, 155]);
        await commands.order(['GAPILE'], 0, undefined, [83, 155]);
        let ggiDeployed = false;
        for (let i = 0; i < 800; i++) {
            await commands.step(90);
            if (i % 10 === 0) state = await pilot.observe('ordinary-egypt-supported-prism-production-' + i);
            if (!ggiDeployed && state.own.filter(unit => unit.name === 'GGI').length >= 8) {
                await commands.order(['GGI'], 9); ggiDeployed = true;
            }
            if (state.own.filter(unit => unit.name === 'SREF').length >= 10
                && state.own.filter(unit => unit.name === 'JUMPJET').length >= 8
                && !state.queues.some(queue => queue.items.some(item => ['SREF', 'JUMPJET'].includes(item.name)))) break;
        }
    }
    const army = { prisms: state.own.filter(unit => unit.name === 'SREF').map(unit => unit.id),
        air: state.own.filter(unit => unit.name === 'JUMPJET').map(unit => unit.id) };
    assert(army.prisms.length >= 10 && army.air.length >= 8);
    pilot.report.army = army;
    await pilot.checkpoint('original-egypt-supported-prism-army-checkpoint.json');
    for (let stage = 0; stage < 40; stage++) {
        const goal = await pilot.page.evaluate(ids => {
            const g = window.__ra2debug.game;
            const units = g.localPlayer.getOwnedObjects().filter(unit => ids.includes(unit.id) && unit.isSpawned && !unit.isDestroyed);
            const center = units.reduce((sum, unit) => [sum[0] + unit.tile.rx / units.length, sum[1] + unit.tile.ry / units.length], [0, 0]);
            const target = g.campaign.resolveHouse('Arabs').getOwnedObjects().filter(unit => unit.isBuilding()
                && !unit.isDestroyed && unit.name !== 'YAPPET')
                .sort((a, b) => Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                    - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0];
            return target && { id: target.id, name: target.name, tile: [target.tile.rx, target.tile.ry] };
        }, army.prisms);
        if (!goal) break;
        await advanceSupportedPrisms(pilot, goal, army, 'ordinary-egypt-prison-defense-' + stage + '-' + goal.name);
        state = await pilot.observe('original-egypt-prison-goal-cleared-' + stage + '-' + goal.name);
        await pilot.checkpoint('last-egypt-prison-progress-checkpoint.json');
    }
    await commands.step(600);
    pilot.report.rescueFlags = await pilot.page.evaluate(() => Object.fromEntries(window.__ra2debug.game.campaign.machine.variables));
    assert(pilot.report.rescueFlags['3'], 'The original Einstein rescue did not complete');
    if (process.argv.includes('--complete')) await completeAllied04Victory(pilot);
    else {
        await pilot.restart('Original YR Allied04 prison power destroyed, Einstein rescued and Dominator retained');
        await pilot.checkpoint('original-egypt-einstein-rescue-checkpoint.json');
        state = await pilot.observe('original-einstein-dominator-rescue-stage');
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED04_PAID_ARMY_PRISON_POWER_EINSTEIN_RESCUE_AND_RESTART_STAGE';
    }
} catch (error) { failure = error; }
await pilot.finish(failure);
