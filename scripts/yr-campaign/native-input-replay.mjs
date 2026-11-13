import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { worldState } from '../m3-2/native-session.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], process.argv[3]);
let failure;
try {
    await pilot.open();
    const file = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
    assert(file, 'Provide the ordinary applied command history');
    const original = JSON.parse(await fs.readFile(file));
    if (pilot.report.ordinaryInputReplay.until === original.tick
        && pilot.report.launch.semanticsVersion === original.options.campaign.semanticsVersion) {
        const state = await worldState(pilot.page);
        const actual = { worldHash: state.hash, rng: state.rng, mission: state.mission,
            world: state.world, pendingCallbacks: state.pendingCallbacks };
        const differences = Object.keys(actual).filter(key => JSON.stringify(actual[key]) !== JSON.stringify(original.expected[key]));
        assert.equal(differences.length, 0, 'Original input replay diverged: ' + differences.join(', '));
        pilot.report.samePolicyWorldRngAndMission = 'PASS_EXACT_HISTORICAL_SOURCE_ORDINARY_INPUT_REPLAY';
    }
    pilot.report.status = 'PASS_ORIGINAL_SOURCE_CONSTRUCTORS_WITH_HISTORICAL_ORDINARY_INPUT_REPLAY';
} catch (error) { failure = error; }
await pilot.finish(failure);
