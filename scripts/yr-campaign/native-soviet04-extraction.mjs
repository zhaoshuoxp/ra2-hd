import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'DRON']; commands.airDefenders = [];
    const romanov = state.own.find(unit => unit.name === 'RMNV' && unit.spawned);
    assert(romanov, 'Resume the original discovered and controllable Romanov');
    await commands.order([romanov.id], 11);
    for (const goal of [[149, 69], [145, 55], [134, 44], [123, 33], [112, 22], [103, 18]]) {
        await commands.order([romanov.id], 0, undefined, goal);
        for (let i = 0; i < 70 && !state.result; i++) {
            await commands.step(45); state = await pilot.observe('ordinary-romanov-route-' + goal.join('-') + '-' + i);
            const hero = state.own.find(unit => unit.id === romanov.id);
            assert(hero, 'Original Romanov left ordinary player control');
            if (Math.hypot(hero.tile[0] - goal[0], hero.tile[1] - goal[1]) < 2) break;
        }
        await pilot.checkpoint('last-romanov-route-checkpoint.json');
        if (state.result) break;
    }
    for (let i = 0; i < 100 && !state.result; i++) {
        await commands.step(60); state = await pilot.observe('original-airport-departure-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_DISCOVERY_ORDINARY_ROMANOV_AIRPORT_AND_SOURCE_VICTORY';
    pilot.report.goalQualification = 'Ordinary Romanov movement exercises the original airport trigger and departure. Source safe-base conditions are inspected separately; this pilot does not claim their destruction.';
} catch (error) { failure = error; }
await pilot.finish(failure);
