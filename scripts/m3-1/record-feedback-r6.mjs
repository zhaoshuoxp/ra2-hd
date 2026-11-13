import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r6');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function sha(file) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex');
}
const pin = async file => ({ path: path.relative(root, file), bytes: (await fs.stat(file)).size, sha256: await sha(file) });
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const runtime = await read(path.join(base, 'runtime-current/package.json'));
const stage = await read(path.join(base, 'stage-current/stage.json')), review = await read(path.join(base, 'final-review/review.json'));
const archive = await read(path.join(base, 'archive.json')), delivery = await read(path.join(base, 'desktop-delivery.json'));
const extracted = await read(path.join(base, 'extracted.json'));
assert.equal(stage.identity.runtimeSourceHead, runtime.sourceHead); assert.equal(review.sourceHead, runtime.sourceHead);
assert.equal(await sha(review.file), review.sha256);
assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert.equal(stage.promotion.allAppBytesIdenticalToNativeCandidate, true);
assert.equal(archive.status, 'PASS_ZIP_ALL_BYTES_LINKS_AND_MODES'); assert.equal(delivery.status, 'PASS_DESKTOP_COPY_HASH_MATCH');
assert.equal(extracted.status, 'PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_ALL_BYTES_LINKS_MODES_AND_SIGNATURE');
assert.equal(await sha(delivery.path), delivery.sha256); assert.equal(delivery.sha256, archive.sha256);
assert.equal(extracted.zipSha256, delivery.sha256); assert.equal(extracted.entries, stage.entries);
const native = [];
for (const name of ['native-loading-current', 'native-arrow-d', 'native-desktop-original']) {
    const directory = path.join(base, name), report = await read(path.join(directory, 'report.json'));
    assert(report.status.startsWith('PASS'), name); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.equal(await sha(path.join(directory, 'harness.mjs')), report.harnessSha256);
    const metadata = await read(path.join(report.app ?? extracted.app, 'Contents/Resources/app/package.json'));
    const changed = git(['diff', '--name-only', metadata.sourceHead, runtime.sourceHead, '--', 'src', 'public', 'desktop']).split('\n').filter(Boolean);
    if (name === 'native-arrow-d') assert.deepEqual(changed, ['src/gui/campaign/CampaignBackdrop.tsx']);
    else assert.deepEqual(changed, []);
    native.push({ name, status: report.status, sourceHead: metadata.sourceHead, changedRuntimePathsSinceCapture: changed,
        proof: await pin(path.join(directory, 'report.json')), harness: await pin(path.join(directory, 'harness.mjs')),
        ...(name === 'native-arrow-d' ? { cases: report.cases.map(row => ({ density: row.density, before: row.before,
            after: row.after, referenceGreen: row.referenceGreen, visibleGreen: row.visibleGreen, visibleFraction: row.visibleFraction })) } : {}) });
}
async function tests(file) {
    const text = await fs.readFile(file, 'utf8'); assert(text.includes('0 fail'));
    return { status: 'PASS', cases: Number(text.match(/(\d+) pass/)[1]), assertions: Number(text.match(/(\d+) expect\(\) calls/)[1]), proof: await pin(file) };
}
const previousRuntime = '81f19a1e38a9b6fec1b6a1eae8e54833240abbb4';
const changedRuntimePaths = git(['diff', '--name-only', previousRuntime, runtime.sourceHead, '--', 'src', 'public', 'desktop']).split('\n');
assert.deepEqual(changedRuntimePaths, ['src/engine/renderable/fx/handler/TriggerActionFxHandler.ts', 'src/gui/campaign/CampaignBackdrop.tsx']);
assert.equal(git(['diff', '--name-only', previousRuntime, runtime.sourceHead, '--', 'src/game', 'src/data',
    'src/gui/screen/game/GameScreen.ts', 'src/gui/campaign/CampaignProgress.ts', 'src/gui/campaign/CampaignSaveStore.ts',
    'src/gui/campaign/CampaignSaveLibrary.ts', 'public', 'desktop']), '');
const preview = path.join(base, 'latest-main-preview'), previewHead = git(['rev-parse', 'HEAD'], preview);
assert.equal(git(['status', '--porcelain'], preview), '');
assert.deepEqual(git(['diff', '--name-only', 'c2cd235c4360e5a69989225981557663519bdab9', previewHead, '--', 'src', 'public', 'desktop'], preview).split('\n'), changedRuntimePaths);
for (const file of changedRuntimePaths) assert.equal(await sha(path.join(root, file)), await sha(path.join(preview, file)));
const main = path.resolve(root, '../ra2-hd'), mainHead = git(['rev-parse', 'HEAD'], main);
const mainRuntimeDelta = git(['diff', '--name-only', '9ab3c54441bf21b6872da0c7f63937a4e577fb31', mainHead, '--', 'src', 'public', 'desktop'], main);
const bundle = path.join(base, 'M3.1-R6-Final-Latest-Main-Integration-Preparation.bundle');
execFileSync('git', ['bundle', 'verify', bundle], { cwd: preview, stdio: 'pipe' });
const result = { status: 'PASS_M3_1_R6_MAC_MAP_PROPORTIONS_AND_TOP_LAYER_ARROW_PENDING_USER_ACCEPTANCE',
    runtimeSourceHead: runtime.sourceHead, previousRuntimeSourceHead: previousRuntime, changedRuntimePaths,
    changes: { world: { proportionalScale: 0.8, sourceCrop: [0, 0, 1760, 821], sourceDimensions: [1915, 821],
        sourceWashington: [520, 248], originalLocator: [264, 160], drawCopies: 1, extension: 'Empty ocean and source-aligned grid only' },
        arrow: { sourceAnimation: 'ARRWSE', originalArtLayer: 'Top', renderOrder: 1000000, depthTest: false,
            sourceFramesTimingAndPositionUnchanged: true } },
    tests: await tests(path.join(base, 'tests-current.log')), entryTypecheck: { status: 'PASS', proof: await pin(path.join(base, 'typecheck-current.log')) },
    native, review: { ...review, proof: await pin(path.join(base, 'final-review/review.json')) },
    delivery, extraction: extracted, packageInventory: await pin(path.join(base, 'stage-current/inventory.json')),
    sourceReuse: { previousThreeDifficultyProof: await pin(path.join(root, 'docs/m3-1-feedback-r5.json')),
        gameplayDataSourceArtSaveRoutesAndResourcesUnchangedFromR5: true,
        disclosure: 'R6 reruns only affected loading and bridge presentation plus relocated package entry. The three unchanged complete battles and difficulty/save outcomes remain pinned to R5. Arrow proof uses 859f7a43; final 580c9854 changes only background-grid rendering.' },
    integrationPreparation: { status: 'PASS_ISOLATED_SOURCE_RESOLUTION_TESTS_AND_TYPECHECK', sourceHead: previewHead,
        previousPreparedSourceHead: 'c2cd235c4360e5a69989225981557663519bdab9', changedRuntimePaths,
        mainObservedHead: mainHead, mainCleanAtAudit: git(['status', '--porcelain'], main) === '', mainRuntimeChangesSinceTestedFlagsBase: mainRuntimeDelta,
        canonicalMainModifiedByThisTask: false, tests: await tests(path.join(base, 'latest-main-tests-current.log')),
        entryTypecheck: { status: 'PASS', proof: await pin(path.join(base, 'latest-main-typecheck-current.log')) },
        bundle: await pin(bundle), bundlePrerequisites: ['dc494dbd59363439ae830fad5e81134ef36ee95b', '34e6fbe6b5d2808db4034e21d9e2dad36e7a7c3a', '9ab3c54441bf21b6872da0c7f63937a4e577fb31'],
        nativeScope: 'The isolated combined source was not rerun natively for R6. Its unchanged save/flag routes retain the pinned R5 native proof; both new runtime files equal the R6 Mac-tested task files.' },
    retainedAttempts: await Promise.all(['native-arrow', 'native-arrow-b', 'native-arrow-c'].map(async name => {
        const file = path.join(base, name, 'report.json'), report = await read(file); assert.equal(report.status, 'FAIL');
        return { name, error: report.error, proof: await pin(file) };
    })),
    priorDesktopPresence: await Promise.all(['RA2-HD-M3.1-Mac-arm64-20261024-R5.zip', 'RA2-HD-M3.1-Mac-arm64-20261024-R4.zip']
        .map(async name => ({ path: path.join('/Users/Aone/Desktop', name), present: await fs.stat(path.join('/Users/Aone/Desktop', name)).then(() => true, () => false),
            modifiedByThisTask: false }))),
    limits: { userVisualAndPhysicalAcceptance: 'PENDING', nativeWindows: 'NOT_RUN_ON_THIS_MAC',
        earlierScoreBackgroundLimitation: 'Original-density background retained as documented in R4/R5; no new generated score background.',
        inAppBrowser: 'Prior file-URL policy rejection was not retried or bypassed. Embedded PNG bytes decode and hashes match.' } };
await save(path.join(root, 'docs/m3-1-feedback-r6.json'), result);
const text = `# M3.1 feedback R6: proportional loading world and visible capture hints

Runtime \`${runtime.sourceHead}\` fixes two presentation issues. Loading uses one world with uniform 0.8 scale, excludes the sheet's wrapped Alaska seam, and extends only empty ocean and a grid aligned to the source image. Source Washington (520,248) remains registered to the original mission locator (264,160) at all tested aspect ratios. Scripted animations authored Layer=Top now render above world depth, including the original green ARRWSE capture hint. Position, source frames and animation timing are unchanged.

The actual Desktop delivery is \`${delivery.path}\` (${delivery.bytes} bytes), SHA-256 \`${delivery.sha256}\`. All ${extracted.entries} ZIP entries, bytes, links, modes and the relocated signature pass. The extracted app passes native campaign entry, display/edition recovery, twelve Original faction hover checks, original introduction/loading, playable opening keyboard input and return routes. It retains the existing M3.1 user profile; tests use isolated profiles.

Focused source checks pass ${result.tests.cases} cases / ${result.tests.assertions} assertions plus typecheck. Native final loading checks cover 4:3, 16:9, ultrawide, portrait and 32:9 with one proportional world and exact locator registration. R5 loading-metal checks retain a continuous lower edge, fixed progress highlights and shared material. UI allocation remains within the 16 MiB budget and the 1.7 MP backdrop cap.

Native bridge evidence uses source 859f7a43; the final source changes only background-grid rendering. In Original and HD, the real broken-bridge arrow retains all 1,557 reference green pixels. The observer briefly holds one naturally triggered render pose and hides other world meshes for a silhouette reference. It changes no game values or source scripts. Restoring the authentic checkpoint and replaying only its ordinary recorded orders reaches the accepted pre-repair world hash 1110797913 at tick 9440, then actual engineer repair at tick 10548 with hash 282093055. Both modes produce identical states and remain trusted/unmodified. Earlier failed observers are retained: two missed the short-lived arrow; a depth-toggle control did not reproduce occlusion at that pose. The final silhouette check supersedes those observer assertions without relabeling their raw results.

The self-contained review at \`.artifacts/m3-1/feedback-r6/final-review/M3.1-Feedback-R6-Review.html\` embeds nine native PNGs. All embedded PNGs decode and match capture hashes. The prior file-URL browser rejection is not retried or bypassed. R5 three-difficulty victories, save compatibility and completion proof are reused: gameplay/data, saved-game routes, retail map/rules/media and all 14,004 bundled resource files are unchanged. No repeat of unchanged full battles is claimed.

Isolated integration source \`${previewHead}\` preserves the prior combined-main loading flags and both save backends, adding exactly the two R6 runtime files. It passes ${result.integrationPreparation.tests.cases} focused checks / ${result.integrationPreparation.tests.assertions} assertions and typecheck. Its final bundle verifies with the same three prerequisites as R5. Canonical main was observed at \`${mainHead}\`; its runtime trees remain ${mainRuntimeDelta ? 'different from' : 'identical to'} the tested loading-flags base. This task never writes main. R6 combined-source native execution is not claimed; unchanged R5 combined-source native save proof remains identified in its earlier receipt.

User visual/physical acceptance is pending. Native Windows is NOT_RUN_ON_THIS_MAC. Existing score-background limitations remain as recorded in R4/R5. Earlier candidate builds, raw failures, accepted evidence and real user profiles are preserved. No earlier Desktop delivery was modified by this task; their observed presence is recorded separately. No remote push, main merge, cleanup or next mission is part of this correction.
`;
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r6.md'), text, { flag: 'wx' });
const agentsFile = path.join(root, 'AGENTS.md'), previous = await fs.readFile(agentsFile, 'utf8');
const authority = `# Current authority: M3.1 feedback R6 Mac delivery - 2026-10-24

Read \`docs/m3-1-feedback-r6.json\` and \`.md\`. Final runtime \`${runtime.sourceHead.slice(0, 8)}\` draws one proportional loading world, excludes wrapped Alaska, aligns extended grid lines and retains the original Washington locator. Triggered Layer=Top animations, including the green capture hint, clear world depth without changing source positions, frames or timing. The final Desktop R6 ZIP is \`${delivery.path}\`, SHA-256 \`${delivery.sha256}\`; every entry and the relocated signature pass.

Final loading passes five native aspect ratios. Original/HD arrow proof from 859f7a43 retains the complete 1,557-pixel green silhouette over the real broken bridge, then original engineer repair; only backdrop-grid rendering changed afterward. Preserve the source-reuse chain and raw failed observers. Gameplay/data, save routes, all retail resources and R5 difficulty/progress behavior remain unchanged. Reuse their pinned full-mission proof instead of rerunning unchanged battles for narrow rendering feedback.

Isolated combined-main source \`${previewHead.slice(0, 8)}\` and its final verified bundle preserve both save backends and current-main loading flags. Focused checks/typecheck pass; R6 combined-source native execution is not claimed. Canonical main is untouched. Recheck live identities before any actual integration. User visual/physical acceptance remains pending; native Windows is NOT_RUN_ON_THIS_MAC. No next mission, push, cleanup or new image generation is authorized by this correction.

`;
await fs.writeFile(agentsFile, authority + previous);
console.log(JSON.stringify({ status: result.status, runtimeSourceHead: runtime.sourceHead, delivery: delivery.path, integration: previewHead }));
