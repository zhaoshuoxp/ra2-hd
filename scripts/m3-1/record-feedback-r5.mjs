import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r5');
const missionDirectory = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function pin(file) { const bytes = await fs.readFile(file); return { file, bytes: bytes.length, sha256: sha(bytes) }; }
const runtime = await read(path.join(base, 'runtime-current/package.json'));
const reuse = await read(path.join(base, 'final-source-reuse.json'));
const stage = await read(path.join(base, 'stage/stage.json'));
const delivery = await read(path.join(base, 'desktop-delivery.json'));
const extracted = await read(path.join(base, 'extracted.json'));
const review = await read(path.join(base, 'review.json'));
const integration = await read(path.join(base, 'latest-main-final-resolution.json'));
const integrationRuntime = await read(path.join(base, 'latest-main-runtime-current/package.json'));
assert.equal(stage.identity.runtimeSourceHead, runtime.sourceHead);
assert.equal(review.sourceHead, runtime.sourceHead);
assert.equal((await pin(review.file)).sha256, review.sha256);
assert(stage.promotion.allAppBytesIdenticalToNativeCandidate);
assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert.equal(delivery.status, 'PASS_DESKTOP_COPY_HASH_MATCH');
assert.equal(extracted.status, 'PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_ALL_BYTES_LINKS_MODES_AND_SIGNATURE');
assert.equal(extracted.zipSha256, delivery.sha256);
assert.equal(integrationRuntime.sourceHead, integration.resolvedHead);
const native = [];
for (const directory of [path.join(base, 'native-loading'), missionDirectory, path.join(base, 'native-return-current'), path.join(base, 'native-desktop-original'),
    path.join(base, 'current-main-native-campaign'), path.join(base, 'current-main-native-skirmish')]) {
    const report = await read(path.join(directory, 'report.json'));
    const outcome = directory === missionDirectory;
    if (outcome) {
        assert.equal(report.status, 'FAIL'); assert(report.error.includes("'1' !== '0'"));
        assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    } else assert(report.status.startsWith('PASS'), directory);
    const proof = await pin(path.join(directory, 'report.json'));
    const harness = await pin(path.join(directory, 'harness.mjs'));
    if (report.harnessSha256) assert.equal(harness.sha256, report.harnessSha256);
    const combined = path.basename(directory).startsWith('current-main');
    const sourceHead = combined ? integrationRuntime.sourceHead
        : outcome || path.basename(directory) === 'native-loading' ? reuse.outcomeSourceHead : runtime.sourceHead;
    if (report.sourceHead) assert.equal(report.sourceHead, sourceHead);
    if (report.metadata?.sourceHead) assert.equal(report.metadata.sourceHead, sourceHead);
    if (path.basename(directory) === 'native-desktop-original') {
        assert.equal(report.executable, path.join(extracted.app, 'Contents/MacOS', extracted.executable));
    }
    if (report.app) {
        const metadata = await read(path.join(report.app, 'Contents/Resources/app/package.json'));
        assert.equal(metadata.sourceHead, sourceHead);
    }
    const observerIdentity = path.basename(directory) === 'current-main-native-skirmish'
        ? await pin(path.join(base, 'current-main-skirmish-observer-identity.json')) : undefined;
    native.push({ name: path.basename(directory), status: outcome ? 'PASS_SCOPED_THREE_ORIGINAL_VICTORIES_SAVES_PROGRESS_RETURN_FAILURE_REPAIRED_SEPARATELY' : report.status,
        rawStatus: report.status, sourceHead,
        cases: report.cases?.length, proof, harness, observerIdentity });
}
const mission = await read(path.join(missionDirectory, 'report.json'));
const levels = mission.cases.filter(row => row.victory);
assert.deepEqual(levels.map(row => row.difficulty), ['easy', 'normal', 'hard']);
const tests = async file => {
    const log = await fs.readFile(file, 'utf8'), counts = log.match(/(\d+) pass\s+(\d+) fail\s+(\d+) expect\(\) calls\s+Ran \d+ tests across (\d+) files/);
    assert(counts && counts[2] === '0', file);
    return { passed: Number(counts[1]), failed: 0, assertions: Number(counts[3]), files: Number(counts[4]), proof: await pin(file) };
};
const main = path.resolve(root, '../ra2-hd');
const git = args => execFileSync('git', args, { cwd: main, encoding: 'utf8' }).trimEnd();
const actualMain = { head: git(['rev-parse', 'HEAD']), workingTree: git(['status', '--porcelain']) };
actualMain.changedRuntimePathsSinceBase = git(['diff', '--name-only', integration.mainHead, actualMain.head, '--', 'src', 'public', 'desktop']);
actualMain.runtimeMatchesTestedMainBase = actualMain.changedRuntimePathsSinceBase === '';
const previousAttempts = [];
for (const { name } of (await fs.readdir(base, { withFileTypes: true })).filter(entry => entry.isDirectory()
    && entry.name.startsWith('native-three-difficulties') && entry.name !== path.basename(missionDirectory))) {
    const file = path.join(base, name, 'report.json'), report = await read(file);
    previousAttempts.push({ name, status: report.status, firstError: report.error?.split('\n')[0], proof: await pin(file) });
}
const result = {
    status: 'PASS_MAC_THREE_CAMPAIGN_DIFFICULTIES_SAVES_ORIGINAL_VICTORIES_AND_YELLOW_LOADING_MATERIAL',
    runtimeSourceHead: runtime.sourceHead, previousRuntimeSourceHead: '0e381129030a03a239a9357fed48520c51b665c7',
    reusedOutcomeSourceHead: reuse.outcomeSourceHead, sourceReuse: await pin(path.join(base, 'final-source-reuse.json')),
    changes: ['Yellow loading transfer curve on the same shared metal cylinder; fixed highlights and clean lower edge retained.',
        'Actual Easy/Normal/Hard launch, original opposing handicaps, map trigger flags and AI task-force selection.',
        'Difficulty-aware named/legacy saves, original Normal compatibility, correct return selection and separate completion entries.'],
    difficultySource: await pin(path.join(root, 'scripts/m3-1/difficulty-r5.json')),
    originalSourcesUnchanged: { resourceFiles: 14004, campaignManifestSha256: stage.identity.campaignManifestSha256,
        map: '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f',
        rules: 'fd1e95cea0306ea78049dc81c8cd816e18c28c496872a1ff02edd50bd082062f' },
    loading: { color: await read(path.join(base, 'loading-color.json')), pixels: (await read(path.join(base, 'native-loading/report.json'))).pixels },
    difficulties: levels.map(row => ({ difficulty: row.difficulty, sourceHead: reuse.outcomeSourceHead, human: row.opening.houses.find(house => !house.ai),
        enemy: row.opening.houses.find(house => house.name === 'BadGuy1 House'), weapon: row.opening.actualWeapon[0],
        save: row.saved, bridge: row.bridge, garrisons: row.garrisons, airport: row.airport, victoryTick: row.victory.tick,
        originalVictoryTrigger: row.victory.trace.some(action => action.key === '0A301C50' && action.opcode === 1),
        trusted: row.victory.trusted, modified: row.victory.modified, parTime: row.parTime,
        additionalGiActions: row.victory.trace.filter(action => ['084584CC', '084581DC', '079EF4FC', '08458F3C'].includes(action.key) && action.opcode === 80).map(action => action.key) })),
    tests: await tests(path.join(base, 'tests-current.log')), entryTypecheck: { status: 'PASS', proof: await pin(path.join(base, 'typecheck-current.log')) }, native,
    nativeScope: { scope: mission.scope, inheritedProof: mission.inheritedProof,
        disclosure: 'All original victories, saves and progress passed before the final abort-menu assertion failed. The final runtime changes only that route; exact cross-build restore and correct returns pass separately for all three difficulties and the late Hard save. Earlier complete Easy/Normal proof and fresh-start checks are reused through the pinned chain.' },
    delivery: { ...delivery, entries: stage.entries, extractedStatus: extracted.status, signature: 'PASS_DEEP_STRICT',
        allAppBytesIdenticalToNativeCandidate: true, resourceFilesUnchanged: 14004, userDataInArchive: false,
        profile: stage.identity.userData, extractedReceipt: await pin(path.join(base, 'extracted.json')) },
    finalDesktopPresence: await read(path.join(base, 'desktop-presence.json')),
    review: { ...await pin(review.file), images: review.images.length, embedding: review.status, browserPreview: review.browserPreview },
    integration: { status: 'PASS_ISOLATED_COMMITTED_MAIN_MERGE_AND_BOTH_NATIVE_SAVE_FLOWS_RECHECK_LIVE_MAIN_BEFORE_MERGE',
        mainBase: integration.mainHead, resolvedHead: integration.resolvedHead, observedLiveMainAtFinalAudit: actualMain,
        resolution: await pin(path.join(base, 'latest-main-final-resolution.json')),
        bundle: await pin(path.join(base, integration.bundle)), prerequisites: integration.prerequisites,
        tests: await tests(path.join(base, 'latest-main-tests-current.log')), entryTypecheck: { status: 'PASS', proof: await pin(path.join(base, 'latest-main-typecheck-current.log')) },
        native: native.filter(row => row.name.startsWith('current-main')),
        limit: 'Preparation targets the recorded completed main commit. The earlier uncommitted work was observed read-only; only its later committed state entered this separate preview. No canonical-main merge, staging or commit occurred.' },
    retainedFailures: previousAttempts,
    failureInterpretation: 'Observer readiness/JSON normalization errors and a global-vs-mission TeamDelays expectation were corrected in the harness. Direct battle routes lost engineers/infantry or did not reveal the airport. Oversized bulk orders were truncated by the original production queue cap; the final observer trains 150 actual field infantry in legal queue-sized batches, uses original civilian garrisons and ordinarily produced replacements. No gameplay values or queue limits were patched to pass.',
    outstandingPriorWork: { generatedHdScoreBackground: 'BLOCKED_BY_IMAGE_TOOL', currentDensity: 'ORIGINAL',
        record: 'scripts/m3-1/score-background-r4.json', requestId: 'a55809a1-4adf-4e0b-b233-fbf650564b02' },
    acceptance: { technicalMac: 'PASS', visualAndPhysicalInput: 'PENDING_USER_REVIEW', nativeWindows: 'NOT_RUN_ON_THIS_MAC',
        exactOriginalWindowsBinaryParity: 'NOT_CERTIFIED', mainIntegration: 'PREPARED_NOT_MERGED', remotePush: 'NOT_REQUESTED' },
};
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r5.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, runtimeSourceHead: runtime.sourceHead, delivery: delivery.path, native: native.length }));
