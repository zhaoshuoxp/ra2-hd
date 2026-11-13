import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const root = '.artifacts/yr-campaign', read = async file => JSON.parse(await fs.readFile(file));
const evidence = async (file, allowed = ['PASS_']) => {
    const bytes = await fs.readFile(file), report = JSON.parse(bytes);
    assert(allowed.some(prefix => report.status.startsWith(prefix)), `${file}: ${report.status}`);
    assert.deepEqual(report.errors ?? [], []); assert.deepEqual(report.failedResources ?? [], []);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex'), status: report.status };
};
const cases = [
    'allied-feedback-fixed-all01-r1', 'allied-feedback-fixed-all02-r1',
    'allied-feedback-native-ui-r2', 'allied-feedback-autofire-all01-factions46-r1',
    'allied03-autofire47-r1', 'allied01-garrison-feedback48-r2',
    'allied01-tanya-naval-mouse-4x-r1', 'allied-feedback-all04-overflight-r1',
    'generated-crate-lighting-feedback-4x-r1', 'allied05-robot-feedback48-r2',
    'allied05-live-battle48-4x-stress-r2', 'allied-feedback-all07-redeploy-r2',
    'loading-briefing-flow-r3', 'boris-return47-r1',
    'soviet03-tanya-handoff47-trainer-r3', 'soviet06-ending-drain-r1',
    'soviet06-ending-public-next-r2', 'dog-protection-native-r2',
    'soviet02-building-state-2x-r2', 'soviet02-building-state-4x-r2',
    'allied01-building-state-2x-r3', 'allied01-building-state-4x-r2',
    'soviet02-chronosphere-charge-2x-r2', 'soviet02-chronosphere-charge-4x-r2',
    'ground-slope-real-2x-r1', 'ground-slope-real-4x-r1',
    'lunar-contact-native-2x-r4', 'lunar-contact-native-4x-r4',
    'cahead-material-native-2x-r2', 'cahead-material-native-4x-r2',
    'cahead-material-combat-4x-r2', 'cahead-material-missing-bearing-4x-r2',
    'castle-footing-state-4x-r3', 'castle-footing-all87-native-2x-r3',
    'castle-footing-all87-native-4x-r3', 'castle-combat-footing-4x-r3',
    'allied-feedback-hd-tour-all02-4x-r1', 'allied-feedback-hd-tour-all05-4x-r1',
    'allied-feedback-hd-tour-all02-2x-r1', 'allied-feedback-hd-tour-all05-2x-r1',
];
const native = [];
for (const name of cases) native.push(await evidence(`${root}/${name}/report.json`));
for (const name of ['allied06-bridge-feedback48-post-timer-4x-r3',
    'allied06-bridge-approach-r9-2x-r1', 'allied06-bridge-approach-r9-4x-r1',
    'allied06-real-towers-bridge-r9-4x-r1', 'allied06-real-towers-bridge-original-r3',
    'soviet01-opening47-r1', 'soviet05-squid-heading48-2x-r3', 'soviet05-squid-heading48-4x-r3',
    'water-dinosaur-idle-repair-2x-r4', 'water-dinosaur-idle-repair-r2'])
    native.push(await evidence(`${root}/${name}/report.json`, ['OBSERVED_']));
const hostFile = `${root}/combined-feedback-host-r2/summary.json`, host = await read(hostFile);
assert.equal(host.acceptance, 'HOST_TESTS_PASS_NATIVE_RUNTIME_NOT_RUN');
assert.equal(host.omitted.length, 0);
for (const key of ['failedCases', 'loadErrors', 'skipped', 'processErrors']) assert.equal(host.counts[key], 0);
const win = await read(`${root}/allied05-robot-feedback48-r2/report.json`);
const final = win.feedbackSamples.at(-1);
assert.equal(final.result, 'victory'); assert(final.houses.every(house => house.objects.length === 0));
const performance = await read(`${root}/allied05-live-battle48-4x-stress-r2/report.json`);
const { intervals, longTasks, ...realTime } = performance.realTime;
const bridge = await read(`${root}/allied06-bridge-feedback48-post-timer-4x-r3/report.json`);
assert.equal(bridge.launch.semanticsVersion, 48);
assert.equal(bridge.commands.length, 0, 'No attacks during the bridge observation');
const seen = new Map();
for (const sample of bridge.bridgeSamples) for (const unit of sample.units) {
    const rows = seen.get(unit.id) ?? []; rows.push({ tick: sample.tick, ...unit }); seen.set(unit.id, rows);
}
const crossings = [...seen].filter(([, rows]) => rows.some(unit => unit.onBridge));
const continued = crossings.filter(([, rows]) => { const first = rows.findIndex(unit => unit.onBridge);
    return rows.slice(first + 1).some(unit => JSON.stringify(unit.tile) !== JSON.stringify(rows[first].tile)); });
assert(crossings.length >= 15 && continued.length >= 15);
for (const density of [2, 4]) {
    const opening = await read(`${root}/soviet05-squid-heading48-${density}x-r3/report.json`);
    const moving = opening.samples.filter(sample => sample.tick >= 60 && sample.tick <= 180)
        .flatMap(sample => sample.units.filter(unit => unit.name === 'SQD'));
    assert(moving.length >= 9 && moving.every(unit => unit.direction === 180 && unit.frame >= 100 && unit.frame < 120
        && unit.projectedPositiveZ[0] < 0 && unit.projectedPositiveZ[1] > 0));
}
const report = {
    schema: 'yr-combined-campaign-feedback-checkpoint-v1', date: '2026-11-08', revision: 'r3',
    status: 'COMBINED_FEEDBACK_TECHNICALLY_QUALIFIED_USER_REVIEW_PENDING',
    originalPlayableMaps: 26, yrPlayableMaps: 14, semanticsVersion: 48, plannedWorldArtMaterialWaits: [],
    host: { file: hostFile, counts: host.counts, executions: host.files.length, omitted: 0 },
    postHostMaterialChecks: [
        { file: '/private/tmp/ra2-yr-bridge-road-family-r7-tests.log', passed: 2, failed: 0 },
        { file: '/private/tmp/ra2-yr-bridge-approach-r8-tests.log', passed: 213, failed: 0 },
    ],
    typecheck: { status: 'PASS', file: '/private/tmp/ra2-yr-combined-feedback-typecheck-r18.log' },
    native, originalAllied05Victory: { policy: 48, tick: final.tick, remainingHouseObjects: 0,
        priorReproduction: `${root}/allied05-robot-feedback47-r1/live-stranded-garrison-audit.json`,
        rootCause: 'Original house fire sales disposed of occupied zero-cost civilian buildings without releasing residents. New policy48 evacuates residents before disposal; victory event11 still counts legitimate limbo residents.',
        orphanResidentsBefore: 66, assistance: 'Supported trainer invulnerability, reveal, money, power and production; ordinary serialized construction, movement and attacks. Modified-play regression, no unmodified goal-chain credit.' },
    realTimeAllied05: { ...realTime, longTaskCount: longTasks.length,
        maxActorMiB: Math.max(...performance.views.map(view => view.actors.bytes)) / 1048576,
        actualSurvivingCameraTargetsHd: performance.views.every(view => !view.exists || view.actualHdBody),
        capsChanged: false, pressure: 'Two bounded 128 MiB QA workers with 80 ms CPU bursts. Physical 8/16 GiB targets and arbitrary external process loads remain unqualified.' },
    bridgeAssault: { freshPolicy: 48, originalInputReplayUntil: bridge.ordinaryInputReplay.completedTick,
        onBridgeActors: crossings.length, laterMovementObserved: continued.length, playerAttackOrdersDuringObservation: 0,
        originalTriggersRulesAndTasksUnchanged: true, qualification: 'Nineteen original actors cross the bridge. Eighteen are observed moving later; the remaining actor leaves the live sample. The exact user stalled route was not reproduced.' },
    originalRoadMapAudit: await evidence(`${root}/all-map-road-slopes-feedback48-r8/report.json`),
    originalSourceFindings: {
        initialSoviet01Health: 'Original units spawn full. Real Grand Cannon hits subsequently reduce their health; no artificial heal was added.',
        allied01TimeMachine: 'The original CATIME01 contains fixed red trim outside its ownership ramp. This source material is retained.',
        damagedLaboratory: 'Original damaged CALAB/CNLAB has no remap indices. New YR laboratory masks keep the accepted paint bytes and make live stripes follow the house.',
        soviet05StatueObjective: 'Easy/Normal require the submarine pen and source ending chain. Hard also requires non-naval VehicleClass/InfantryClass clearance for the named Yuri houses. Buildings are excluded, so there is no required statue-destruction objective at any difficulty.',
    },
    visualReview: { status: 'PENDING_USER', reopened: ['Aquatic DNOB exposed silhouette', 'Lunar contacts',
        'Yuri statue head metal', 'Castle foundation and destruction states', 'Laboratory faction stripes', 'Bridge road contacts'],
        oldSnowAndConstructionArtwork: 'RETAINED', acceptedUnitArtwork: 'REUSED' },
    userRouteRetests: ['Allied04 transport-over-pyramid rescue did not reproduce in the original source route; source rescue conditions are retained.',
        'Allied06 exact stalled-on-bridge user route did not reproduce; original fresh48 assault observation passes.'],
    retainedOriginalQualifications: ['All14 unmodified source45 campaign goal qualifications remain historical.',
        'Fresh48 targeted and supported-play regressions do not establish all14 new-version unmodified full victories at every difficulty.',
        'The exact prior Soviet01 missing-cell crash trigger was not reproduced technically; the user passed the correction.',
        'Original installation includes CnCNet patches. Pristine executable RNG/AI/particle equivalence retains its existing boundary.'],
    realProfilesTouched: false, windows: 'NOT_RUN_ON_THIS_MAC', userAcceptance: 'PENDING',
    retainedDeliveries: ['V56', 'YR r1', 'YR r2'], localMainOnly: true,
};
await fs.writeFile('docs/yr-campaign-feedback-checkpoint-20261108-r3.json', JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ status: report.status, nativeReports: native.length, host: host.counts.pass }));
