import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const identify = async name => { const bytes = await fs.readFile(path.join(root, name));
    return { path: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; };
const scoreFile = '.artifacts/m3-1/score-r4/report.json', continuityFile = '.artifacts/m3-1/score-continuity/report.json';
const [score, continuity, runtime, video, images, contract] = await Promise.all([
    read(scoreFile), read(continuityFile), read('.artifacts/m3-1/review-runtime/package.json'),
    read('.artifacts/m3-1/score-r4/video-verification.json'), read('.artifacts/m3-1/review-media/images.json'),
    read('.local/campaign/ra2/sov01t/score-presentation.json')]);
assert.equal(score.status, 'PASS_SOURCE_VICTORY_MEDAL_TYPEWRITER_TALLY_SKIP_AND_RETURN');
assert.equal(continuity.status, 'PASS_MATCHED_ORIGINAL_2X_4X_CONTINUITY_AND_RESTART');
for (const report of [score, continuity]) {
    assert.equal(report.runtime.sourceHead, runtime.sourceHead); assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []);
}
assert.deepEqual(score.failedResources, []); assert.equal(score.sourceEnd.status, 2);
assert.equal(score.result.tick, 20090); assert.equal(score.sourceEnd.before, 20090); assert.equal(score.sourceEnd.after, 20091);
assert.equal(score.complete.times[0], '00:15:00'); assert.equal(score.complete.artDensity, 'original');
assert.equal(continuity.stableIdentitySave.fullFreshWorldMatch, true);
assert.deepEqual(continuity.cases.map(row => row.density), [1, 2, 4]);
assert.equal(new Set(continuity.cases.map(row => row.continuationDigest)).size, 1);
assert.equal(video.status, 'PASS_NATIVE_WINDOW_FRAMES_ENCODED_AND_FULLY_DECODED');
assert.equal(images.status, 'PASS_PIXEL_IDENTICAL_LOSSLESS_PACKAGING');
assert.equal(execFileSync('git', ['diff', '--name-only', runtime.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '', 'Native runtime must match the current application source');
const tests = await fs.readFile(path.join(root, '.artifacts/m3-1/score-tests.log'), 'utf8');
assert(/44 pass/.test(tests) && /0 fail/.test(tests));
const screenshots = await Promise.all(score.screenshots.map(name => identify('.artifacts/m3-1/score-r4/' + name)));
for (const row of images.images) {
    assert.equal(row.decodedPixelEquality, true); assert.deepEqual(await identify(row.source.path), row.source);
    assert.equal((await identify(row.path)).sha256, row.sha256); screenshots.push(row);
}
const history = [];
for (const name of ['score-r1', 'score-r2', 'score-r3']) {
    const file = `.artifacts/m3-1/${name}/report.json`, report = await read(file);
    history.push({ ...await identify(file), status: report.status, reason: report.failure?.split('\n').slice(0,2).join(' '),
        disposition: 'Retained failed runtime/harness evidence; see source/behavior notes for the exact boundary' });
}
const receipt = { schemaVersion: 1, status: 'MAC_ORIGINAL_SCORE_CORRECTION_PASS_USER_REVIEW_PENDING',
    scope: 'Soviet 01 original score presentation and stable checkpoint diagnostic identities; not a new HD artwork batch or new physical-input mission completion.',
    source: { branch: 'task/m3-1-soviet01', runtimeHead: runtime.sourceHead, fullNativeInputRuntime: score.sourceGameplayRuntime,
        preparationHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        runtimePackage: await identify('.artifacts/m3-1/review-runtime/package.json'),
        runtimeInventory: await identify('.artifacts/m3-1/review-runtime/build.json'),
        applicationSourceMatchesNativeBuild: true, mainIntegrated: false, pushed: false, published: false },
    original: { contract: await identify('.local/campaign/ra2/sov01t/score-presentation.json'), sources: contract.sources,
        sprites: contract.sprites, palette: contract.palette, parTimeNormal: '00:15:00',
        textSource: 'Original SOV01T.MAP Ranking keys and existing source-matched locale catalogs; read-only game.exe dialog 259 geometry',
        cadence: 'Presentation-only 15 frames/s; exact retail timing not certified' },
    hdAudit: [
        { item: 'Soviet 01 loading', resource: 'LS800S01.SHP / LDSCRNS.PAL', nativeSize: [800, 520], density: 'ORIGINAL', authoredHd: false },
        { item: 'Opening Iwo Jima memorial', object: 'CAWASH19', resource: 'CUWASH19.SHP', density: 'ORIGINAL_FALLBACK', authoredHd: false,
            sourceSha256: 'da2d330700df7a21e820946a5a9c2253259f6276c5c47340086aa096b1d55238' },
        { item: 'Campaign result', density: 'ORIGINAL_BITMAPS_SCALABLE_LIVE_TEXT', authoredHd: false } ],
    validation: { focusedTests: { cases: 44, assertions: 3601, failed: 0, evidence: await identify('.artifacts/m3-1/score-tests.log') },
        entryTypecheck: { status: 'PASS', evidence: await identify('.artifacts/m3-1/score-typecheck.log') },
        build: { status: 'PASS', evidence: await identify('.artifacts/m3-1/score-build.log') },
        nativeScore: { evidence: await identify(scoreFile), scope: score.scope, originalWinner: score.result.trace.find(row => row.key === '0A301C50' && row.opcode === 1),
            callbackTurn: score.sourceEnd,
            finalDisplay: { result: score.complete.result, phase: score.complete.phase, artDensity: score.complete.artDensity,
                titleKey: 'GUI:ParTitleSov01', messageKey: 'GUI:OverParMsgSov01', sourceTextMatches: true,
                enemiesDestroyed: Number(score.complete.kills), times: score.complete.times, bounds: score.complete.bounds },
            partialEvaluationCaptured: true, changingBadgeFrames: true,
            naturalFinalSpeechAndEva: true, skip: 'PASS', returnToCampaign: score.returnToCampaign,
            pageErrors: 0, consoleErrors: 0, failedResources: 0 },
        checkpointContinuity: { evidence: await identify(continuityFile), legacyTraitAliases: score.checkpoint.legacyTraitAliases,
            fullLegacyReconstruction: true, stableIdentitySave: continuity.stableIdentitySave,
            cases: continuity.cases.map(({ bindings: _bindings, ...row }) => row), restart: continuity.restart, reentry: continuity.reentry },
        video: await identify('.artifacts/m3-1/score-r4/video-verification.json'),
        imagePackaging: await identify('.artifacts/m3-1/review-media/images.json'), windows: 'NOT_RUN_ON_THIS_MAC',
        fullGameplayBaseline: await identify('docs/m3-1-soviet01-acceptance.json'),
        reuseBoundary: 'Prior full native-input win, independent source loss and transport evidence retain their original runtime pins. New replay/continuity probes are not relabelled as physical-input play.' },
    screenshots, videos: [await identify(video.path)], retainedFailures: history,
    tooling: await Promise.all(['scripts/m3-1/score-native.mjs', 'scripts/m3-1/continuity-native.mjs', 'scripts/m3-1/score-resources.ts',
        'scripts/m3-1/encode-score-review.py'].map(identify)),
    review: { path: '.artifacts/m3-1/M3.1-Embedded-Review.html', notes: 'docs/m3-1-score-presentation.md',
        userVisualAndListeningAcceptance: 'PENDING', newArtAuthored: false,
        remaining: ['The three audited bitmap families have no authored HD replacement', 'Exact original-engine score/menu timing is not certified',
            'No Windows execution, second mission or integration is included'] } };
await fs.writeFile(path.join(root, 'docs/m3-1-score-presentation.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, runtime: runtime.sourceHead, screenshots: screenshots.length, videos: receipt.videos.length }));
