import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = '.artifacts/m3-1/feedback-r2a';
const carried = new Set(['native-en-r2', 'native-tw', 'native-r1', 'native-r2', 'native-r3', 'native-r4',
    'end-victory-r1', 'repro-r1', 'repro-r2', 'native-en', 'subtitles']);
function evidencePath(file) {
    if (file.startsWith(base + '/')) {
        const relative = file.slice(base.length + 1);
        if (carried.has(relative.split('/')[0])) return '.artifacts/m3-1/feedback-r2/' + relative;
    }
    return file;
}
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, evidencePath(file)), 'utf8'));
async function pin(file) {
    file = evidencePath(file);
    const absolute = path.resolve(root, file), hash = createHash('sha256');
    for await (const bytes of createReadStream(absolute)) hash.update(bytes);
    return { path: file, bytes: (await fs.stat(absolute)).size, sha256: hash.digest('hex') };
}
const accepted = await read('docs/m3-1-final-acceptance.json'), stage = await read(base + '/stage/stage.json');
const delivered = await read(base + '/desktop-delivery.json'), extracted = await read(base + '/extracted.json'), review = await read(base + '/review.json');
const directories = ['native-final-r2', 'native-en-final', 'native-tw-final', 'end-victory-release', 'end-defeat-release', 'native-desktop', 'native-original-final', 'native-default'];
const reports = {};
for (const directory of directories) {
    const report = reports[directory] = await read(base + '/' + directory + '/report.json');
    assert(report.status.startsWith('PASS_'), directory); assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.equal(report.harnessSha256, (await pin(base + '/' + directory + '/harness.mjs')).sha256, directory);
}
assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert(stage.promotion.allAppBytesIdenticalToNativeCandidate);
assert(stage.promotion.nativeSignaturePreservedAndVerified);
assert.equal(delivered.status, 'PASS_DESKTOP_COPY_HASH_MATCH');
assert.equal(extracted.status, 'PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_ALL_BYTES_LINKS_MODES_AND_SIGNATURE');
assert.equal(reports['native-desktop'].app, extracted.app); assert.equal(reports['native-desktop'].cases.length, 9);
assert.equal(reports['native-original-final'].metadata.sourceHead, stage.identity.runtimeSourceHead);
assert.equal(reports['native-original-final'].loading.density, '1');
assert.equal(reports['native-original-final'].loading.housing.width, '800px');
assert(reports['native-default'].savePreservation.unchanged);
assert.equal(reports['native-default'].metadata.sourceHead, stage.identity.runtimeSourceHead);
assert.equal(reports['native-desktop'].lockedInputFixture.handoffs, 1);
assert.deepEqual(reports['native-desktop'].trainerAfter.worldEvents, []);
assert.equal(reports['native-desktop'].trainerLayers[1].tag, 'BODY');
assert.equal(reports['native-desktop'].trainerLayers[0].position, 'fixed');
assert(reports['native-desktop'].loadingArtwork.outsideSubjects.every(row => row.alpha === 0));
assert.equal(reports['native-desktop'].objective.inlineColor, reports['native-desktop'].objective.nativeInlineColor);
assert.equal(reports['native-desktop'].speechHud.fontSize, reports['native-desktop'].objective.fontSize);
assert.equal(reports['end-victory-release'].cheers[0].completion, 'ended');
assert(reports['end-defeat-release'].speech.some(row => row.id === 'EVA_MissionFailed' && row.reason === 'ended'));
for (const directory of ['end-victory-release', 'end-defeat-release']) {
    const app = reports[directory].app;
    assert.equal((await read(path.join(app, 'Contents/Resources/app/package.json'))).sourceHead, stage.identity.runtimeSourceHead);
    for (const row of (await read(base + '/runtime-hud-final-r2/build.json')).web)
        assert.equal((await pin(path.join(app, 'Contents/Resources/app/dist', row.path))).sha256, row.sha256);
}
for (const directory of ['native-final-r2', 'native-en-final', 'native-tw-final', 'native-desktop']) {
    assert.equal((await read(path.join(reports[directory].app, 'Contents/Resources/app/package.json'))).sourceHead, stage.identity.runtimeSourceHead);
}
const sourceDiff = paths => execFileSync('git', ['diff', '--name-only', stage.identity.runtimeSourceHead, '--', ...paths], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(sourceDiff(['src', 'desktop', 'public']), '');
assert.equal(execFileSync('git', ['diff', '--name-only', accepted.source.runtimeHead, '--', 'src/game', 'src/data',
    'src/gui/campaign/CampaignSaveStore.ts'], { cwd: root, encoding: 'utf8' }).trim(), '');
const build = await read(base + '/runtime-hud-final-r2/build.json');
const runtimeModules = build.web.filter(row => /\/(GameScreen|CampaignScreen)-.*\.js$/.test(row.path));
assert.equal(runtimeModules.length, 2);
const resources = path.join(extracted.app, 'Contents/Resources/GameResources');
const manifest = await pin(path.join(resources, 'campaign/ra2/sov01t/manifest.json'));
const map = await pin(path.join(resources, 'campaign/ra2/sov01t/sov01t.map'));
assert.equal(manifest.sha256, accepted.source.campaignManifest.sha256);
assert.equal(map.sha256, '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
const zip = await pin(delivered.path); assert.equal(zip.sha256, delivered.sha256); assert.equal(zip.sha256, extracted.zipSha256);
const priorDelivery = await read('docs/m3-1-campaign-entry-r1.json');
const priorZip = await pin(priorDelivery.delivery.sourceArchive); assert.equal(priorZip.sha256, priorDelivery.delivery.sha256);
const priorDesktopPresent = await fs.stat(priorDelivery.delivery.path).then(() => true, error => {
    if (error.code === 'ENOENT') return false; throw error;
});
const priorDesktop = priorDesktopPresent ? await pin(priorDelivery.delivery.path)
    : { path: priorDelivery.delivery.path, status: 'NOT_PRESENT_AT_FINAL_AUDIT',
        note: 'The preceding delivered Desktop path is absent. Its source ZIP and verified historical delivery receipt remain retained; no cause is inferred.' };
if (priorDesktopPresent) assert.equal(priorDesktop.sha256, priorZip.sha256);
const acceptedGallery = await pin('.artifacts/m3-1/M3.1-Embedded-Review.html');
assert.equal(acceptedGallery.sha256, '6fc934a851f7be5e3a4e9b402d4e31e7a22936d18b85f6694e5c7a53a61221f5');
assert.equal(review.sha256, (await pin(path.relative(root, review.file))).sha256);
const tests = await fs.readFile(path.join(root, base, 'tests-final-r2a.log'), 'utf8'); assert(tests.includes('44 pass') && tests.includes('0 fail'));
const failed = [];
for (const directory of ['native-r1', 'native-r2', 'native-r3', 'native-r4', 'end-victory-r1']) {
    const report = await read(base + '/' + directory + '/report.json'); assert.equal(report.status, 'FAIL');
    assert.equal(report.harnessSha256, (await pin(base + '/' + directory + '/harness.mjs')).sha256);
    failed.push({ directory, error: report.error });
}
const evidence = [];
for (const file of ['stage/stage.json', 'stage/inventory.json', 'archive.json', 'desktop-delivery.json', 'extracted.json',
    'review.json', 'tests-final-r2a.log', 'typecheck-final-r2a.log', 'subtitles/provenance.json', 'repro-r1/report.json', 'repro-r1/harness.mjs',
    'repro-r2/report.json', 'repro-r2/harness.mjs', 'native-en/report.json', 'native-en/harness.mjs', 'native-en/sampled-harness.mjs']) {
    evidence.push(await pin(base + '/' + file));
}
for (const directory of directories) {
    for (const file of ['report.json', 'harness.mjs', ...(reports[directory].screenshots ?? [])]) evidence.push(await pin(base + '/' + directory + '/' + file));
}
for (const row of failed) for (const file of ['report.json', 'harness.mjs']) evidence.push(await pin(base + '/' + row.directory + '/' + file));
for (const directory of ['native-wide-r1', 'native-wide-r2', 'native-foreground', 'native-final', 'native-original', 'native-original-r2']) {
    for (const file of ['report.json', 'harness.mjs']) evidence.push(await pin(base + '/' + directory + '/' + file));
}
for (const file of ['scripts/m3-1/backdrops-r2a.json', 'scripts/m3-1/loading-housing-r2.json']) evidence.push(await pin(file));
const receipt = {
    status: 'M3_1_FEEDBACK_R2A_MAC_TECHNICAL_AND_DESKTOP_DELIVERY_PASS_USER_TEST_PENDING', recordedAt: new Date().toISOString(),
    source: { runtimeHead: stage.identity.runtimeSourceHead, acceptedBaseHead: accepted.source.runtimeHead,
        changedRuntimePaths: stage.identity.changedRuntimePaths, unchangedGameRulesScriptsAndSaveSchema: true,
        gameAndCampaignModulesVerifiedInReleaseNativeEndChecks: runtimeModules },
    changes: ['Native vector faction arrows with mutually exclusive hover/keyboard focus animation.',
        'Generated frameless wide backgrounds for selection, loading and results; original subject proportions and one loading world background.',
        'Reference-derived silver loading end caps and ribbed grips, dark socket, cables and segmented luminous fill; fixed Original fallback geometry.',
        'Media-time captions in all three UI languages with native DOM text rendering.',
        'Original campaign accomplishment/failure voices and one completed victory cheer.',
        'Offline campaign trainer sessions and popup layering; real changes mark the mission modified and disable formal checkpoint/completion eligibility.'],
    preservation: { unchangedBundledGameResourceFiles: 14004, campaignManifest: manifest, map, signedCandidatePromotion: stage.promotion,
        uiBudgetBytes: 16777216, metalMasterIncludedInBudget: true, retainedPriorSourceArchive: priorZip,
        priorDesktopArchiveAtFinalAudit: priorDesktop, acceptedGallery,
        olderPackagesProfilesArtEvidenceAndReviewPreserved: true },
    media: await read(base + '/subtitles/provenance.json'), material: await read('scripts/m3-1/loading-housing-r2.json'),
    backgrounds: await read('scripts/m3-1/backdrops-r2a.json'),
    validation: { tests: { pass: 44, fail: 0, assertions: 625 }, typecheck: 'PASS', nativeDirectories: directories,
        victory: { tick: reports['end-victory-release'].result.tick, hash: reports['end-victory-release'].result.hash,
            cheer: reports['end-victory-release'].cheers, speech: reports['end-victory-release'].speech },
        defeat: { tick: reports['end-defeat-release'].result.tick, speech: reports['end-defeat-release'].speech, cheer: reports['end-defeat-release'].cheers },
        actualDesktopTrainer: { before: reports['native-desktop'].trainerBefore, after: reports['native-desktop'].trainerAfter,
            fieldEditing: reports['native-desktop'].trainerParameterEditing, lockedInputFixture: reports['native-desktop'].lockedInputFixture },
        pointerLock: { actualHostAttempt: reports['native-desktop'].pointerRequest, nativeAcquisition: 'UNVERIFIED_REJECTED_DURING_AUTOMATION',
            controlledHandoff: 'PASS_WITH_REAL_MOUSE_EVENTS_NO_WORLD_LEAK', physicalMouseFeel: 'USER_REVIEW_REQUIRED' },
        defaultProfileSave: reports['native-default'].savePreservation, retainedFailedObservers: failed,
        retainedReproductionObserver: 'repro-r1 incorrectly expected group buttons to be disabled. repro-r2 opens the group and verifies the actual disabled action buttons in the unchanged R1 app; both snapshots are retained.',
        retainedEnglishObserverOutlier: 'The first English case passed, but a Chinese-only observer addition changed the live source hash after compilation. Both the executed snapshot and sampled hash are retained. native-en-r2 freezes the observer and passes with matching hashes.',
        scope: 'Bounded native UI and assisted original gameplay checks. The accepted physical-input full-mission baseline is retained; no new physical-input full completion is claimed.' },
    interimR2: { status: 'PRESERVED_NOT_FINAL', directory: '.artifacts/m3-1/feedback-r2',
        reason: 'Native visual inspection found that the scaled game root trapped the trainer below the body-level objective. R2a portals the trainer to the same page context and applies viewport scale once.',
        layerProbe: await pin('.artifacts/m3-1/feedback-r2/native-desktop-layer-probe/report.json') },
    objective: reports['native-desktop'].objective,
    speechHud: reports['native-desktop'].speechHud, loadingArtwork: reports['native-desktop'].loadingArtwork,
    retainedVisualIterations: ['native-wide-r1 retains the SVGRect observer serialization failure.',
        'native-wide-r2 passed the functional observer, but the user rejected its doubled world-map background.',
        'native-foreground fixes the background and title; its larger HUD was superseded by the native-scaled final build.',
        'native-final caught the objective fallback color; native-final-r2 verifies the actual player color for both right-hand lines.'],
    retainedOriginalObserverFailure: 'native-original read a menu debug reference after the product correctly disposed it. native-original-r2 fixes that reference and retains a second observer failure: CSS serialization differs by 0.0005 logical pixels from exact alignment. native-original-final uses a 0.01-pixel tolerance and repeats the actual Desktop check.',
    review, delivery: { ...delivered, actualZip: zip, app: path.basename(extracted.app), signature: 'PASS_DEEP_STRICT_AD_HOC_LOCAL_TEST', entries: extracted.entries },
    boundaries: { acceptedM3Base: 'USER_ACCEPTED_PRESERVED', r2UserAcceptance: 'PENDING', windows: 'NOT_RUN_ON_THIS_MAC',
        mainIntegration: 'NOT_REQUESTED', push: 'NOT_REQUESTED', publication: 'NOT_REQUESTED', cleanup: 'NOT_REQUESTED', nextMission: 'NOT_REQUESTED' }, evidence,
};
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r2a.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r2a.md'), `# M3.1 feedback R2a

The R2a correction addresses the seven reported interface, movie/audio and trainer problems. The Desktop package is \`${delivered.path}\`. Extract it and open **${path.basename(extracted.app)}**, then choose the Soviet emblem on Normal. Runtime: \`${stage.identity.runtimeSourceHead}\`. User visual and physical-input acceptance is pending.

Faction arrows now use clean vector facets and only one faction can animate. Clicking an unavailable faction no longer retains its mouse focus animation after moving away. Campaign, loading and result chrome fill the viewport at 4:3, 16:9, 21:9, portrait and application fullscreen. Emblems and score contents keep their proportions. New background-only images fill the selection and result panels. The loading SVG is split into its existing focus map, transparent emblem and four photo layers, leaving only one full world-map background. Old campaign resource files are unchanged. The generated background files are \`public/res/presentation/campaign-backdrop-topography-r2a.png\` and \`public/res/presentation/campaign-backdrop-world-r2a.png\`; exact built-in imagegen prompts and identities are in [the background provenance](../scripts/m3-1/backdrops-r2a.json).

The complete loading component includes reference-derived silver metal ornaments, ribbed black grips, collars, dark cylindrical socket, red cables and separate yellow/orange/red segments. End caps retain their original size when the HD center extends. The Original fallback keeps its intact 800-pixel housing and aligned fill. The generated master is saved at \`public/res/presentation/campaign-loading-housing-r2.png\`; the exact built-in imagegen prompt and source/master hashes are in [the material provenance](../scripts/m3-1/loading-housing-r2.json). The first harmless image request was falsely rejected; the neutral software-component description succeeded. No CLI fallback was used. All decoded metal pixels are included in the existing 16 MiB UI budget.

The original introduction has 33 source-timed captions, rendered as crisp native text and synchronized to video time through pause, seeking and gaps. Simplified Chinese uses the locally supplied original subtitle track; Traditional uses ICU conversion; English is a translation of the supplied Chinese text, not a verbatim English-audio transcription. The second prepared transmission track has two cues; no new mission binding is invented. All three languages pass native Settings-to-movie checks.

The original victory trigger is reached at tick 20090 by restoring the accepted physical-input checkpoint and replaying its remaining ordinary commands under accelerated simulation. The complete checkpoint world, RNG and mission state match. The final world hash is 3978379262. Sofia's victory speech, EVA Mission Accomplished and one original cheer finish normally before the original medal/typewriter score; ${new Set(reports['end-victory-release'].phases.map(phase => phase.emblemFrame)).size} distinct emblem frames are observed. Ordinary force-attack/move commands produce the original defeat at tick 7703, with EVA Mission Failed ending and no cheer. These are assisted checks, not another physical-input full completion. The final release app repeats both authentic end conditions after the background, native-size HUD, trainer portal and Original fallback refinements; the receipt pins those exact release runs. Earlier successful R2 candidates and their native gallery captures are retained separately.

The trainer now creates a real offline campaign session and portals its fixed popup beside the campaign HUD in document.body. This removes the duplicated root scale and lets its popup render above the objective text. Coordinates and cursor styling follow the actual game-root rectangle. Actual clicks and number-field edits work, 10,000 credits are added only to the local player, and no mouse event or command leaks to the world. Actual use marks the campaign modified, rejects checkpoint capture and prevents formal completion recording. Task progress and mission speech use the native message font at 13 logical pixels, the native player color and UI scale. They align directly against the top and sidebar edges with the same internal padding as the upper-left message list; speech follows on the next line. The master remains OFF by default. Native pointer-lock acquisition is rejected during the automated run; actual DOM clicks pass and the locked-input handoff passes a separately labeled controlled state fixture with real mouse events. The cause of the native acquisition failure is not certified by a physical-input comparison. Native lock acquisition and physical mouse feel remain manual checks.

All 44 focused cases / 625 assertions and entry typecheck pass. All 14,004 bundled game/resource files, the map, scripts, save schema and accepted prior artwork remain byte-identical. The actual Desktop archive passes ${extracted.entries.toLocaleString('en-US')} file/link/mode checks, relocated extraction, strict deep signature verification, HD interaction checks, Original fallback entry/loading/playability, and default-profile save preservation. The default manual slot ${reports['native-default'].savePreservation.exists ? 'exists and remains unchanged; this read-only check does not claim a fresh migration exercise' : 'was empty and stays empty; no existing-default-save migration is claimed'}. Page/resource checks are clear. Retained failed and outlier observers are documented in [the complete receipt](m3-1-feedback-r2a.json).

The self-contained [R2a native review](../.artifacts/m3-1/feedback-r2a/M3.1-Feedback-R2a-Review.html) embeds all screenshots and needs no server or neighboring files. Historical acceptance and its original embedded gallery remain frozen. ZIP SHA-256: \`${delivered.sha256}\`; ${delivered.bytes.toLocaleString('en-US')} bytes. This is an arm64 local ad-hoc signed test package. Windows remains NOT_RUN_ON_THIS_MAC. No main integration, cleanup, remote push, publication or next mission is included. Continue same-outcome manual feedback in this conversation.
`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, zip: delivered.path, sha256: delivered.sha256 }));
