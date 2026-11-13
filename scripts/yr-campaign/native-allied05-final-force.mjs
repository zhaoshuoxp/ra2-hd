import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all05umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    for (let i = 0; i < 300 && !state.result; i++) {
        for (const owner of ['BadGuy1 House', 'BadGuy2 House']) {
            const target = await commands.attackVisible(['SREF', 'JUMPJET', 'MTNK', 'FV'], owner, 'ground');
            if (target) (pilot.report.finalTargets ??= []).push({ tick: state.tick, ...target });
        }
        await commands.step(60, { defend: false });
        if (i % 5 === 0) state = await pilot.observe('original-sydney-final-required-forces-' + i);
    }
    state = await pilot.observe('original-sydney-source-victory');
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED05_NAVAL_GROUND_THREE_CLONING_VATS_BOTH_HOUSES_ALL_FORCES_AND_SOURCE_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
