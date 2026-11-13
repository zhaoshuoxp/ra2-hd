import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function identify(file) {
    const bytes = await fs.readFile(path.resolve(root, file));
    return { path: file, bytes: bytes.length, sha256: sha(bytes) };
}
const nativePath = '.artifacts/m3-1/feedback-native-r4', scorePath = '.artifacts/m3-1/feedback-score-r1';
const [native, score, runtime, images, exported, contracts, resultVideo, memorialVideo] = await Promise.all([
    read(nativePath + '/report.json'), read(scorePath + '/report.json'), read('.artifacts/m3-1/review-runtime/package.json'),
    read('.artifacts/m3-1/review-media/feedback-images.json'), read('.artifacts/m3-1/memorial/export.json'),
    read('desktop/terrain-theater-hd-contracts.json'), read(scorePath + '/video-verification.json'), read(nativePath + '/video-verification.json'),
]);
assert.equal(native.status, 'PASS_MATCHED_ORIGINAL_2X_4X_CONTINUITY_AND_RESTART');
assert.equal(score.status, 'PASS_SOURCE_VICTORY_MEDAL_TYPEWRITER_TALLY_SKIP_AND_RETURN');
assert.equal(native.runtime.sourceHead, runtime.sourceHead); assert.equal(score.runtime.sourceHead, runtime.sourceHead);
assert.equal(native.harnessSha256, (await identify('scripts/m3-1/continuity-native.mjs')).sha256);
assert(native.factionMenu.length === 4 && native.factionMenu.every(sprite => sprite.sourcePixelsMatch));
assert(native.loading.sourcePixelsMatch && native.loading.source === 'ls800s01.shp');
assert.equal(native.cases.length, 3);
for (const item of native.cases) {
    assert.equal(item.worldHash, 2873760633); assert.equal(item.continuationHash, 3762824249);
    assert.equal(item.continuationDigest, native.cases[0].continuationDigest); assert(item.fullStateMatches);
    assert.equal(item.memorial.glError, 0);
    if (item.density !== 1) {
        assert.equal(item.memorial.family.status, 'PUBLISHED_COMPLETE_FAMILY');
        assert.equal(item.memorial.family.density, item.density);
        assert(item.memorial.parts.filter(part => part.gpuHd && part.frames === 52).length >= 2);
        assert.equal(item.memorial.terrainRevision, contracts.URBAN.revision);
        assert(item.memorial.roadGroups.length === 4 && item.memorial.roadGroups.every(group => group.selectedHashMatches));
    }
}
assert.equal(native.stableIdentitySave.fullFreshWorldMatch, true);
assert.deepEqual(native.failedResources, []); assert.deepEqual(native.errors, []); assert.deepEqual(native.consoleErrors, []);
assert.deepEqual(score.failedResources, []); assert.deepEqual(score.errors, []); assert.deepEqual(score.consoleErrors, []);
const zh = await read('public/res/locale/zh-CN.json');
assert.equal(score.complete.title, zh['gui:partitlesov01']);
assert(images.images.every(image => image.decodedPixelEquality));
assert.equal(resultVideo.status, 'PASS_NATIVE_WINDOW_FRAMES_ENCODED_AND_FULLY_DECODED');
assert.equal(memorialVideo.status, 'PASS_NATIVE_CANVAS_VIDEO_FULLY_DECODED');
const packPath = `../ra2-hd/.local/terrain-packs/${contracts.URBAN.revision}/manifest.json`;
const roadPack = await identify(packPath); assert.equal(roadPack.sha256, contracts.URBAN.sha256);
const previous = JSON.parse(execFileSync('git', ['show', '75d6f5b4:desktop/terrain-theater-hd-contracts.json'], { cwd: root, encoding: 'utf8' }));
for (const theater of Object.keys(previous).filter(name => name !== 'URBAN')) assert.deepEqual(contracts[theater], previous[theater]);
const campaignManifest = await read('.local/campaign/ra2/sov01t/manifest.json');
const map = campaignManifest.files.find(file => file.name === 'sov01t.map');
assert.equal(map.sha256, '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
const focused = await fs.readFile(path.join(root, '.artifacts/m3-1/feedback-focused-tests.log'), 'utf8');
assert(/44 pass\s+0 fail\s+266 expect\(\) calls/.test(focused));
const receipt = {
    schemaVersion: 1, status: 'MAC_TECHNICAL_PASS_USER_VISUAL_REVIEW_PENDING',
    scope: 'Correct localized ranks, replace the premature review capture, author the mission memorial/flag HD family and reuse the verified Urban road/parking repair.',
    source: { runtimeHead: runtime.sourceHead, taskBranch: 'task/m3-1-soviet01', map,
        roadPatch: { origin: 'Concurrent canonical main working tree; no published bugfix commit at reuse time',
            selected: contracts.URBAN, manifest: roadPack,
            notes: await identify('../ra2-hd/docs/road-markings-parking-repair-20261022.json'),
            integration: 'Only the Urban terrain pin is imported. Other theater contracts and concurrent main source edits are preserved.' },
        campaignManifest: await identify('.local/campaign/ra2/sov01t/manifest.json') },
    corrections: {
        ranks: { keys: ['GUI:ParTitleSov01', 'GUI:ParTitleSov02'], languages: ['zh-CN', 'zh-TW'],
            labels: ['Private', 'Corporal'], sourceCatalogs: 'Unmodified retail catalogs; localized UI overrides retain original map rank selection.' },
        captures: { factionCanvasFrames: native.factionMenu, loading: { source: native.loading.source,
            progressAtSample: native.loading.percent, decodedSourcePixelsMatch: true, resourceGate: false,
            reviewPlacement: 'Faction selection and mission loading are unfolded at the start of the embedded review.' } },
        memorial: { family: exported.bundle.identity, revision: exported.bundle.revision, familyHash: exported.bundle.familyHash,
            completeMembers: exported.bundle.members, bodyStates: 4, flagFrames: 48, densities: [2, 4],
            tool: 'Built-in imagegen', prompts: await identify('docs/m3-1-memorial-prompts.json'),
            masters: (await read('docs/m3-1-memorial-prompts.json')).masters, export: await identify('.artifacts/m3-1/memorial/export.json'),
            sourceAnchorsAndAnimation: 'Native canvas, trim, slot order, playback rate, source state rules and separate shadows retained. One continuous source-fitted shaft joins the body and animated flag.',
            nativeGpu: native.cases.map(item => ({ density: item.density, parts: item.memorial.parts, family: item.memorial.family ?? 'ORIGINAL' })) },
        roads: { revision: contracts.URBAN.revision, selectedManifestHash: contracts.URBAN.sha256,
            nativeGroups: native.cases.filter(item => item.density !== 1).map(item => ({ density: item.density, groups: item.memorial.roadGroups })) },
        remainingOriginal: ['Faction/loading bitmaps', 'Campaign result panel and badge bitmaps'],
    },
    validation: {
        focusedTests: { cases: 44, failed: 0, assertions: 266, evidence: await identify('.artifacts/m3-1/feedback-focused-tests.log') },
        entryTypecheck: await identify('.artifacts/m3-1/feedback-typecheck.log'), build: await identify('.artifacts/m3-1/feedback-build.log'),
        localeKeys: await identify('.artifacts/m3-1/feedback-locales.json'),
        nativeContinuity: { evidence: await identify(nativePath + '/report.json'),
            cases: native.cases.map(item => ({ density: item.density, worldHash: item.worldHash, continuationTick: item.continuationTick,
                continuationHash: item.continuationHash, continuationDigest: item.continuationDigest, fullStateMatches: true })),
            stableIdentitySave: native.stableIdentitySave, restart: native.restart, reentry: native.reentry,
            pageErrors: 0, consoleErrors: 0, failedResources: 0 },
        nativeScore: { evidence: await identify(scorePath + '/report.json'), sourceWinner: score.result.trace.find(item => item.key === '0A301C50' && item.opcode === 1),
            callbackTurn: score.sourceEnd, correctedLocalizedRankMatches: true, titleKey: 'GUI:ParTitleSov01',
            changingBadgeFrames: new Set(score.phases.map(phase => phase.emblemFrame)).size, partialTextCaptured: true,
            speech: score.speech, returnToCampaign: score.returnToCampaign,
            scope: score.scope },
        resultVideo: await identify(scorePath + '/video-verification.json'), memorialVideo: await identify(nativePath + '/video-verification.json'),
        nativeCrops: await identify(nativePath + '/crops.json'),
        imagePackaging: await identify('.artifacts/m3-1/review-media/feedback-images.json'),
        fullGameplayBaseline: await identify('docs/m3-1-soviet01-acceptance.json'),
        reuse: 'The frozen full native-input completion retains runtime d1e21e8c. Current assisted reconstruction/replay is identified separately.',
        browserRender: 'NOT_RUN_NO_CONNECTED_TAB', windows: 'NOT_RUN_ON_THIS_MAC',
    },
    screenshots: images.images, videos: [await identify(nativePath + '/native-4x-playback.webm'), await identify(scorePath + '/result-animation.webm')],
    retainedAttempts: await Promise.all(['r1', 'r2', 'r3'].map(async attempt => ({
        attempt, evidence: await identify(`.artifacts/m3-1/feedback-native-${attempt}/report.json`),
        reason: attempt === 'r1' ? 'Real campaign atlas root routing failure; corrected and directly regression tested'
            : attempt === 'r2' ? 'Checker expected separate frame arrays; engine correctly uses a 52-frame aggregate'
            : 'Custom-scheme page interception did not gate requests; ordinary native loading capture replaces that instrument',
    }))),
    review: { path: '.artifacts/m3-1/M3.1-Embedded-Review.html', userVisualAcceptance: 'PENDING',
        sourceIntegratedIntoMain: false, remotePush: false, publication: false, desktopPackagesModified: false },
};
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-corrections.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, runtime: runtime.sourceHead, images: receipt.screenshots.length, videos: receipt.videos.length }));
