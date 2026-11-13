import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const identify = async name => {
    const bytes = await fs.readFile(path.join(root, name));
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const names = { input: '.artifacts/m3-1/input-final/report.json', continuity: '.artifacts/m3-1/continuity-final/report.json',
    failure: '.artifacts/m3-1/failure-final/report.json', transport: '.artifacts/m3-1/transport-final/report.json' };
const [input, continuity, failure, transport, runtime, audit] = await Promise.all([
    ...Object.values(names).map(read), read('.artifacts/m3-1/review-runtime/package.json'), read('docs/m3-1-source-audit.json')]);
assert.equal(input.status, 'PASS_NATIVE_INPUT_ORIGINAL_VICTORY_AND_RESTORE');
assert.equal(continuity.status, 'PASS_MATCHED_ORIGINAL_2X_4X_CONTINUITY_AND_RESTART');
assert.equal(failure.status, 'PASS_ORIGINAL_FAILURE_FROM_ORDINARY_COMMANDS');
assert.equal(transport.status, 'PASS_BOUNDED_ORIGINAL_PRELOAD_UNLOAD_TRANSFER_AND_WITHDRAWAL');
assert.equal(input.sourceHead, runtime.sourceHead);
for (const report of [continuity, failure, transport]) assert.equal(report.runtime.sourceHead, runtime.sourceHead);
for (const report of [input, continuity, failure, transport]) {
    assert.equal(report.errors.length, 0); assert.equal(report.consoleErrors.length, 0);
}
assert.equal(input.final.diagnostic, false); assert.equal(input.final.inspectionModified, false);
assert.equal(input.final.trusted, true); assert.equal(input.final.botCount, 0); assert.equal(input.final.result, 'victory');
assert(!input.final.failure); assert(!input.final.commands.some(command => command.type === 4));
const winner = input.final.trace.find(action => action.key === '0A301C50' && action.opcode === 1);
assert(winner); assert([1, 2, 3, 4].every(id => input.final.variables.some(([key, value]) => key === String(id) && value)));
assert(input.final.observedEvents.some(event => event.type === 14)); assert(input.final.observedEvents.some(event => event.type === 20 && event.name === 'CAAIRP'));
assert.equal(input.inputs.filter(item => item.operation === 'garrison').length, 2);
assert.equal(input.introOutcomes[0].outcome, 'ended'); assert(input.intro.audioDecodedBytes > 0);
for (const id of ['Mis_S1_SofiaVictorySpeech', 'EVA_YouAreVictorious']) assert(input.speechAtResult.some(item => item.id === id && item.reason === 'ended'));
const progress = JSON.parse(input.progress); assert.equal(progress.nextPlayable, false); assert.equal(progress.completed.length, 1);
assert.equal(progress.completed[0].mission, 'sov01t.map'); assert.equal(progress.completed[0].difficulty, 'normal');
assert.deepEqual(continuity.cases.map(item => item.density), [1, 2, 4]);
assert(continuity.cases.every(item => item.worldHash === input.checkpoint.worldHash && item.fullStateMatches));
assert.equal(new Set(continuity.cases.map(item => item.continuationDigest)).size, 1);
assert.equal(continuity.restart.freshWorld, true); assert.equal(continuity.restart.tick, 0); assert.equal(continuity.restart.commands, 0);
assert.equal(continuity.reentry.campaignMenuPresent, true);
const defeat = failure.samples.find(item => item.label === 'original-failure-result');
assert.equal(defeat.result, 'defeat'); const loser = defeat.trace.find(item => item.key === '0A115A1C' && item.opcode === 2); assert(loser);
assert.equal(audit.currentGaps.length, 0);
const screenshots = [];
for (const [key, report] of Object.entries({ input, continuity, failure, transport })) {
    for (const name of report.screenshots) screenshots.push({ ...await identify(path.posix.join(path.posix.dirname(names[key]), name)),
        scope: key === 'input' ? 'Formal Normal native mouse/keyboard run, Original world display' : key + ' probe; see its report' });
}
try {
    const packaged = await read('.artifacts/m3-1/review-media/images.json');
    assert.equal(packaged.status, 'PASS_PIXEL_IDENTICAL_LOSSLESS_PACKAGING');
    for (const image of packaged.images) {
        assert.equal(image.decodedPixelEquality, true); assert.deepEqual(await identify(image.source.path), image.source);
        assert.equal((await identify(image.path)).sha256, image.sha256); screenshots.push(image);
    }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const historicalNames = ['input-r1', 'input-r2', 'input-r3', 'mission-r1', 'mission-r2', 'mission-r3', 'mission-r4', 'failure-r1', 'continuity-r1', 'continuity-r2'];
const historical = [];
for (const name of historicalNames) {
    const filename = `.artifacts/m3-1/${name}/report.json`, report = await read(filename);
    historical.push({ ...await identify(filename), status: report.status, disposition: 'Retained historical development evidence; final matched receipts take precedence',
        ...(report.failure ? { reason: report.failure.split('\n')[0] } : {}) });
}
const testLog = await fs.readFile(path.join(root, '.artifacts/m3-1/final-tests.log'), 'utf8');
assert(/45 pass/.test(testLog) && /0 fail/.test(testLog));
const receipt = { schemaVersion: 2, status: 'M3_1_IMPLEMENTED_MAC_NORMAL_PASS_USER_REVIEW_PENDING', edition: 'ra2', mission: 'sov01t.map', difficulty: 'normal',
    formalPlayEnabled: true, campaignCompletionRecordedInIsolatedValidationProfile: true,
    userAcceptance: { originalFactionAndLoadingCorrection: 'Approved to continue in the current conversation', finalMissionVisualAndListening: 'PENDING' },
    newArtAuthored: false,
    source: { branch: 'task/m3-1-soviet01', mainBaseline: 'dc494dbd59363439ae830fad5e81134ef36ee95b',
        reviewRuntimeHead: runtime.sourceHead, receiptPreparedAtHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        canonicalMainAtReceipt: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(root, '../ra2-hd'), encoding: 'utf8' }).trim(),
        originalMapSha256: audit.sourceHash, mainIntegrated: false, pushed: false, published: false },
    review: { launcher: 'M3.1-Campaign-Review.command', gallery: '.artifacts/m3-1/M3.1-Embedded-Review.html',
        galleryReceipt: '.artifacts/m3-1/embedded-review-receipt.json', galleryVerification: '.artifacts/m3-1/embedded-review-verification.json',
        handoff: 'docs/m3-1-handoff.md', payload: '.artifacts/m3-1/review-runtime', canonicalResources: '../ra2-hd/.local',
        campaignResources: '.local/campaign/ra2/sov01t', isolatedUserProfile: '.local/m3-1-review-profile', portableDistribution: false,
        buildIdentity: await identify('.artifacts/m3-1/review-runtime/package.json'), buildInventory: await identify('.artifacts/m3-1/review-runtime/build.json'),
        remoteReview: 'Single offline file embeds actual native screenshots, silent canvas recording and evidence documents; no local game/server is required.' },
    validation: { nativeMouseKeyboardNormalPlay: { status: 'PASS', evidence: await identify(names.input), humanPhysicalInputCertification: 'NOT_RUN',
            winner: { ...winner, resultTick: input.final.tick }, objectives: 'All four original Pentagon sections', bridgeRepair: true, twoCivilianGarrisons: true,
            airportCapture: true, sourceReinforcements: true, skirmishBots: 0, debugCommands: 0, directSimulationTicks: false, injectedOrders: false,
            finalMissionSpeechAndEva: 'NATURAL_COMPLETION', nextMissionPlayable: false },
        originalFailure: { status: 'PASS', evidence: await identify(names.failure), mode: 'Accelerated ordinary serialized player commands; independent of native input victory', loser, resultTick: defeat.tick },
        saveAndDensityContinuity: { status: 'PASS', evidence: await identify(names.continuity),
            checkpoint: { ...input.checkpoint, file: await identify('scripts/m3-1/fixtures/mid-mission-checkpoint.json'), compatibility: 'm3-1-campaign-journal-v3' },
            checks: ['Fresh changed world', 'Full serialized world', 'Full PRNG', 'Triggers/variables/teams/scripts/waits/particles', 'Pending simulation callback count',
                '300-tick matched continuation at Original/2X/4X', 'Actual HD materials', 'Restart at source tick zero', 'Return and reentry'],
            cases: continuity.cases.map(({ bindings: _bindings, ...item }) => item) },
        transportPipeline: { status: 'PASS_BOUNDED_INSTRUCTION_PROBE', evidence: await identify(names.transport),
            scope: transport.scope, originalTeamTypes: ['0AA795CC', '09D3357C'], preloadedPassengers: 'Four HTNK and four SENGINEER',
            originalReturnTrigger: '0C67682C', withdrawalScriptOpcode: 37 },
        tests: { status: 'PASS', cases: 45, assertions: 2046, evidence: await identify('.artifacts/m3-1/final-tests.log') },
        typecheck: { status: 'PASS', evidence: await identify('.artifacts/m3-1/final-typecheck.log') },
        wholeSuite: { status: 'NOT_RERUN', note: 'Relevant shared checks pass; historic whole-suite failures are not reclassified as a clean suite.' },
        windows: 'NOT_RUN_ON_THIS_MAC', easy: 'PARSED_NOT_VALIDATED_OR_ADMITTED', hard: 'PARSED_NOT_VALIDATED_OR_ADMITTED' },
    media: { manifest: 'docs/m3-1-media-manifest.json', intro: input.intro, naturalIntroEnd: true,
        transmission: 'No source-bound ingame movie in Soviet 01; reusable top-right candidate end/skip/cancel evidence is retained separately',
        sourceSpeechResources: 16, observedOpening: input.openingSpeech, observedAfterRestore: input.speechAtResult,
        savingWhilePending: 'REFUSED_EXPLICITLY; save after mission media finishes', hdVideoReplacement: 'NONE_ACCEPTED_OR_DOWNLOADED' },
    resources: { audit: 'docs/m3-1-source-audit.json', declaredPrimaryIdentities: audit.declaredResourceIdentities,
        additionalNativePrimaryIdentities: audit.nativeAdditionalResourceIdentities, counts: audit.resourceCounts,
        theater: 'Task accepted immutable Urban baseline, opt-in registration; canonical selector and concurrent road work preserved',
        limits: 'Primary images only; Pentagon A/B and unmatched art retain Original fallback. Earlier unchanged Pentagon C/D bindings remain separately identified.' },
    screenshots, videos: [await identify(continuity.video.path)],
    remaining: { requiredMacNormalImplementationBlockers: [], userReview: ['Mission HUD/subtitle readability', 'Mission/results appearance', 'Perceptual speech and audiovisual review'],
        unverified: ['Windows', 'Easy/Hard', 'Exact retail particle motion/menu frame cadence', 'Original Windows-engine differential parity', 'External HD-video candidates'],
        guardedFutureCapabilities: ['Linked-trigger semantics', 'Recruitment into preloaded transports'],
        outsideScope: ['Mission two and other campaigns/YR execution', 'Original RA2/YR binary saves', 'Main integration', 'Push/publication', 'New performance project'] },
    historical, cleanupReceipt: '.artifacts/m3-1/cleanup-final.json',
    nextConversation: 'Continue current execution conversation for M3.1 review/corrections; a new campaign batch requires separate authorization after acceptance.' };
await fs.writeFile(path.join(root, 'docs/m3-1-soviet01-acceptance.json'), JSON.stringify(receipt, null, 2) + '\n');
const summarize = async (name, source, value) => fs.writeFile(path.join(root, '.artifacts/m3-1/review-media', name),
    JSON.stringify({ sourceReceipt: await identify(source), ...value }, null, 2) + '\n');
await summarize('native-input-summary.json', names.input, { status: input.status, runtimeHead: runtime.sourceHead, scope: input.scope,
    intro: input.intro, introOutcomes: input.introOutcomes, checkpoint: input.checkpoint,
    stages: input.stages.map(item => ({ name: item.name, tick: item.tick, hash: item.hash, result: item.result, failure: item.failure,
        variables: item.variables, playerAssets: item.player.length, commands: item.commands, trusted: item.trusted, botCount: item.botCount })),
    winner, observedEvents: input.final.observedEvents, progress, inputs: input.inputs, serializedCommands: input.final.commands,
    openingSpeech: input.openingSpeech, speechAtResult: input.speechAtResult, errors: input.errors, consoleErrors: input.consoleErrors });
await summarize('continuity-summary.json', names.continuity, { status: continuity.status, runtimeHead: runtime.sourceHead, scope: continuity.scope,
    checkpoint: continuity.checkpoint, cases: continuity.cases.map(({ bindings, ...item }) => ({ ...item,
        actualHdActors: bindings.actors, prepared: bindings.prepared, glError: bindings.glError })),
    restart: continuity.restart, reentry: continuity.reentry, video: continuity.video, errors: continuity.errors, consoleErrors: continuity.consoleErrors });
await summarize('failure-summary.json', names.failure, { status: failure.status, runtimeHead: runtime.sourceHead, scope: failure.scope,
    originalLoser: loser, tick: defeat.tick, remainingPlayerAssets: defeat.player.length, issuedCommands: failure.commands,
    errors: failure.errors, consoleErrors: failure.consoleErrors });
await summarize('transport-summary.json', names.transport, { status: transport.status, runtimeHead: runtime.sourceHead, scope: transport.scope,
    creation: transport.transportCreation, final: transport.transport, errors: transport.errors, consoleErrors: transport.consoleErrors });
console.log(JSON.stringify({ status: receipt.status, runtimeHead: runtime.sourceHead, screenshots: screenshots.length, winnerTick: winner.tick, loserTick: loser.tick }));
