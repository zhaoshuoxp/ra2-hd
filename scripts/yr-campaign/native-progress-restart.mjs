import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], process.argv[3]);
let failure;
try {
    const state = await pilot.open();
    assert(state.tick > 900, 'A meaningful original mission checkpoint is required');
    const variable = process.argv.find(value => value.startsWith('--requires-local='))?.slice(17);
    if (variable !== undefined) assert(await pilot.page.evaluate(variable =>
        !!window.__ra2debug.game.campaign.machine.variables.get(variable), variable), 'Required original progress is absent');
    await pilot.restart('Original YR mission progress, source objectives and running world');
    await pilot.checkpoint('original-restarted-progress-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_MEANINGFUL_PROGRESS_NAMED_SAVE_FULL_RESTART_AND_EXACT_180_TICKS';
} catch (error) { failure = error; }
await pilot.finish(failure);
