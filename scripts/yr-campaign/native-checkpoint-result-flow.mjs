import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { worldState } from '../m3-2/native-session.mjs';

const [output, mission] = process.argv.slice(2);
const source = process.argv.find(value => value.startsWith('--checkpoint='))?.slice(13);
assert(source, 'Provide the unchanged legitimate current-source checkpoint');
const checkpoint = JSON.parse(await fs.readFile(source));
const pilot = new NativeCampaignPilot(output, mission);
let failure;
try {
    await pilot.open();
    assert.equal(pilot.report.launch.semanticsVersion, 45);
    const restored = await worldState(pilot.page);
    assert.deepEqual({ worldHash: restored.hash, rng: restored.rng, mission: restored.mission,
        world: restored.world, pendingCallbacks: restored.pendingCallbacks }, checkpoint.expected);
    pilot.report.exactCheckpointRestoration = { tick: restored.tick, hash: restored.hash,
        worldRngMissionQueuesTeamsAndCallbacksExact: true, originalCheckpointUnchanged: true };
    await pilot.commands.step(900, { defend: false });
    const result = await pilot.observe('restored-current-source-natural-result');
    assert.equal(result.result, 'victory', 'Only the original pending result may complete this regression');
    pilot.report.victory = { tick: result.tick, hash: result.hash, result: result.result, extraPlayerInputs: 0 };
    await pilot.completeResultFlow();
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    assert.deepEqual(pilot.report.consoleErrors ?? [], []);
    pilot.report.status = 'PASS_CURRENT_CHECKPOINT_EXACT_RESTORE_NATURAL_SOURCE_VICTORY_AND_SCORE';
} catch (error) { failure = error; }
await pilot.finish(failure);
