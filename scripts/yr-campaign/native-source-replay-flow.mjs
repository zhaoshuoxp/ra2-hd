import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { NativeCampaignPilot } from './native-pilot.mjs';

const [out, mission] = process.argv.slice(2);
const inputFile = process.argv.find(value => value.startsWith('--replay-commands='))?.slice(18);
assert(inputFile, 'Provide the retained ordinary input envelope');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const seedBytes = await fs.readFile(inputFile), seed = JSON.parse(seedBytes);
assert.equal(seed.schema, 'yr-original-input-replay-seed-v1');
for (const key of ['expected', 'world', 'rng', 'result', 'actors']) assert(!(key in seed));
const journalBytes = await fs.readFile(seed.proof.journal.file);
assert.equal(sha(journalBytes), seed.proof.journal.sha256);
const journalRaw = journalBytes[0] === 0x1f && journalBytes[1] === 0x8b ? gunzipSync(journalBytes) : journalBytes;
const journal = JSON.parse(journalRaw);
assert.equal(sha(journalRaw), seed.proof.journal.rawSha256);
const checkpointBytes = await fs.readFile(seed.proof.checkpoint.file);
assert.equal(sha(checkpointBytes), seed.proof.checkpoint.sha256);
const checkpoint = JSON.parse(checkpointBytes);
assert.deepEqual(seed.identity, checkpoint.identity);
assert.equal(seed.identity.mission, mission);
assert.equal(seed.gameId, journal.gameId); assert.equal(seed.timestamp, journal.timestamp);
assert.equal(seed.gameId, checkpoint.gameId); assert.equal(seed.timestamp, checkpoint.timestamp);
assert.deepEqual(seed.commands, journal.commands);
assert.deepEqual(seed.commands.slice(0, checkpoint.commands.length), checkpoint.commands);
assert.equal(Number(process.argv.find(value => value.startsWith('--replay-until='))?.slice(15)), seed.meaningfulMilestone.tick);
const pilot = new NativeCampaignPilot(out, mission);
pilot.report.inputProvenance = { seed: { file: path.resolve(inputFile), sha256: sha(seedBytes) },
    proof: seed.proof, worldAssigned: false, runningRngAssigned: false,
    scope: 'Current source constructors with the recorded creation seed and historical ordinary local-player inputs. '
        + 'A meaningful named save, process restart, original source goal and normal score flow are observed. '
        + 'Public mission availability and fresh public initialization remain separate. The prepared replay entry skips the opening movie.' };
let failure;
try {
    await pilot.open();
    assert.equal(pilot.report.launch.semanticsVersion, 45);
    assert.equal(pilot.report.launch.difficulty, seed.options.campaign.difficulty);
    assert.equal(pilot.report.launch.sourceSha256, seed.identity.sourceSha256);
    const progress = await pilot.observe('current-source-meaningful-pre-save-progress');
    assert.equal(progress.tick, seed.meaningfulMilestone.tick);
    for (const name of seed.meaningfulMilestone.requiredOwn)
        assert(progress.own.some(object => object.name === name), 'Meaningful source progress requires ' + name);
    assert(!progress.result && !progress.failure);
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-current-source-progress.png') });
    await pilot.restart(`YR ${mission} current source objectives and deployed base`);
    assert.equal(pilot.report.restart.semanticsVersion, 45);
    await pilot.replayOrdinaryInputs(inputFile, { resume: true, until: seed.tick, allowSourceResult: true });
    let result = await pilot.observe('current-source-original-goal-result');
    const grace = Number(process.argv.find(value => value.startsWith('--result-grace='))?.slice(15) ?? 0);
    assert(Number.isSafeInteger(grace) && grace >= 0 && grace <= 1800);
    if (!result.result && grace) {
        const before = result.tick;
        await pilot.commands.step(grace, { defend: false });
        result = await pilot.observe('current-source-natural-result-delay');
        pilot.report.sourceResultDelay = { requestedTicks: grace, from: before, to: result.tick,
            extraPlayerInputs: 0, originalSourceTurnsOnly: true };
    }
    assert.equal(result.result, 'victory', 'Historical ordinary inputs need a current-source strategy continuation');
    pilot.report.victory = { tick: result.tick, result: result.result, fired: result.fired };
    await pilot.completeResultFlow();
    assert.deepEqual(pilot.report.errors, []); assert.deepEqual(pilot.report.failedResources, []);
    assert.deepEqual(pilot.report.consoleErrors ?? [], []);
    pilot.report.status = 'PASS_CURRENT_ORIGINAL_SOURCE_ORDINARY_INPUTS_NAMED_RESTART_VICTORY_AND_SCORE';
} catch (error) { failure = error; }
await pilot.finish(failure);
