import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), work = '.artifacts/m3-1/interface-hd';
const nativePath = work + '/native-r4';
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function identify(file) {
    const bytes = await fs.readFile(path.resolve(root, file));
    return { path: file, bytes: bytes.length, sha256: sha(bytes) };
}
const [native, runtime, baseline, accepted, manifest, previous, bundle, exported, images, crops, menuVideo, scoreVideo, typecheck] = await Promise.all([
    read(nativePath + '/report.json'), read('.artifacts/m3-1/review-runtime/package.json'),
    read('.artifacts/m3-1/input-final/report.json'), read('docs/m3-1-feedback-corrections.json'),
    read('.local/campaign/ra2/sov01t/manifest.json'), read(work + '/accepted-247f-manifest.json'),
    read('.local/campaign/ra2/sov01t/interface-hd.json'), read(work + '/export.json'),
    read('.artifacts/m3-1/review-media/interface-images.json'), read(nativePath + '/crops.json'),
    read(nativePath + '/video-verification.json'), read('.artifacts/m3-1/feedback-score-r1/video-verification.json'),
    read(work + '/typecheck-final.json'),
]);
assert.equal(native.status, 'PASS_HD_INTERFACE_AND_ORIGINAL_BRIDGE_INITIALIZATION_REPAIR');
assert.equal(native.runtime.sourceHead, runtime.sourceHead);
assert.equal(native.harnessSha256, (await identify('scripts/m3-1/interface-bridge-native.mjs')).sha256);
assert.equal(execFileSync('git', ['diff', '--name-only', runtime.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '', 'Application source differs from the captured runtime');
assert.equal(typecheck.exitCode, 0); assert.equal(typecheck.sourceHead, runtime.sourceHead);
const focused = await fs.readFile(path.join(root, work, 'tests.log'), 'utf8');
assert(/47 pass\s+0 fail\s+303 expect\(\) calls/.test(focused));
assert.equal(previous.files.length, 22); assert.equal(manifest.files.length, 25);
assert.equal((await identify(work + '/accepted-247f-manifest.json')).sha256, accepted.source.campaignManifest.sha256);
for (const file of previous.files) assert.deepEqual(manifest.files.find(current => current.name === file.name), file);
for (const file of manifest.files) {
    const actual = await identify('.local/campaign/ra2/sov01t/' + file.name);
    assert.equal(actual.bytes, file.bytes); assert.equal(actual.sha256, file.sha256);
}
const additions = manifest.files.filter(file => !previous.files.some(old => old.name === file.name));
assert.deepEqual(additions, exported.files);
const map = manifest.files.find(file => file.name === 'sov01t.map');
assert.equal(map.sha256, '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
assert.equal(bundle.density, 2); assert.equal(bundle.originalPresentationSha256,
    manifest.files.find(file => file.name === 'presentation.json').sha256);
assert.deepEqual(native.hdMenu.size, [1264, 1136]); assert.deepEqual(native.loading.size, [1600, 1040]);
assert.equal(native.originalMenu.density, '1'); assert.equal(native.originalMenu.canvases, 4);
assert.equal(native.originalMenu.ui.reservedBytes, 0); assert.equal(native.loading.controls.length, 3);
assert.equal(native.freshOpening.ui.domImageGpuBytesUpperBound, 0);
assert.notEqual(native.arrowAnimation.first, native.arrowAnimation.second);
assert(new Set(native.menuFrames.map(frame => frame.frame)).size >= 3);
for (const name of ['allied', 'tutorial', 'soviet']) {
    assert.equal(bundle.arrows[name].length, 8); assert.equal(bundle.arrows[name][0].length, 0);
    assert(bundle.arrows[name].slice(1).every(frame => frame.length > 0));
}
assert.equal(bundle.loading.authoredPhotos.length, 4);
for (const photo of bundle.loading.authoredPhotos) {
    assert(photo.master.width >= photo.rect[2] * 2 && photo.master.height >= photo.rect[3] * 2);
}
assert.equal(native.breakTrigger.length, 8);
assert(native.breakTrigger.every(action => action.tick === 0 && action.opcode === 63 && action.key === '0823BDEC'));
assert.equal(native.freshOpening.journalCommands, 0);
assert.deepEqual(native.freshOpening.huts.filter(hut => hut.repairable).map(hut => hut.id).sort(), [1607, 1724]);
assert.equal(native.bridgeCases.length, 2);
for (const item of native.bridgeCases) {
    const before = item.before, after = item.after;
    assert.equal(before.tick, 9440); assert.equal(after.tick, 10548);
    assert.equal(before.hash, baseline.stages.find(stage => stage.name === 'first-base').hash);
    assert.equal(after.hash, baseline.stages.find(stage => stage.name === 'bridge-repaired').hash);
    assert(before.huts.find(hut => hut.id === 1607).repairable);
    assert.deepEqual(before.huts.find(hut => hut.id === 1607).missing, [[88, 84]]);
    assert(!after.huts.find(hut => hut.id === 1607).repairable);
    assert.deepEqual(after.huts.find(hut => hut.id === 1607).missing, []);
    assert(after.huts.find(hut => hut.id === 1724).repairable);
    assert(before.engineer.exists && before.engineer.spawned); assert(!after.engineer.exists);
    assert(before.center.visible && !before.center.bridgeOverlay); assert(after.center.visible && after.center.bridgeOverlay);
    assert(after.repairEvents.some(event => event.type === 14 && event.tick === 10547));
}
for (const metrics of [native.hdMenu.ui, native.loading.ui, native.freshOpening.ui,
    ...native.bridgeCases.flatMap(item => [item.before.ui, item.after.ui])]) {
    assert.equal(metrics.budget, 16 * 1024 * 1024); assert(metrics.reservedBytes <= metrics.budget);
}
assert.deepEqual(native.errors, []); assert.deepEqual(native.consoleErrors, []); assert.deepEqual(native.failedResources, []);
assert(images.images.every(image => image.decodedPixelEquality));
assert.equal(crops.status, 'PASS_NATIVE_PIXEL_IDENTICAL_CROPS'); assert.equal(crops.crops.length, 4);
assert.equal(menuVideo.status, 'PASS_NATIVE_WINDOW_FRAMES_ENCODED_AND_FULLY_DECODED');
assert.equal(scoreVideo.status, 'PASS_NATIVE_WINDOW_FRAMES_ENCODED_AND_FULLY_DECODED');
for (const video of [menuVideo, scoreVideo]) {
    const identity = await identify(video.path); assert.equal(identity.bytes, video.bytes); assert.equal(identity.sha256, video.sha256);
}
const prompts = await read('docs/m3-1-interface-prompts.json');
const finalAcceptance = await read('docs/m3-1-final-acceptance.json').catch(error => {
    if (error.code !== 'ENOENT') throw error;
});
if (finalAcceptance) {
    assert.equal(finalAcceptance.status, 'M3_1_MAC_NORMAL_PROTOTYPE_USER_ACCEPTED');
    assert.equal(finalAcceptance.source.runtimeHead, runtime.sourceHead);
    assert.equal(finalAcceptance.source.campaignManifest.sha256, (await identify('.local/campaign/ra2/sov01t/manifest.json')).sha256);
    assert.equal(prompts.userAcceptance.newInterface, 'ACCEPTED');
}
const masters = [prompts.outputs.selection, prompts.outputs.loadingEmblem, ...prompts.photoOutputs];
for (const [index, expected] of [bundle.selection.master, bundle.loading.emblemMaster,
    ...bundle.loading.authoredPhotos.map(photo => photo.master)].entries()) {
    assert.equal((await identify(masters[index])).sha256, expected.sha256);
}
const receipt = {
    schemaVersion: 1, status: finalAcceptance ? 'M3_1_MAC_NORMAL_PROTOTYPE_USER_ACCEPTED' : 'MAC_NATIVE_PASS_NEW_INTERFACE_VISUAL_REVIEW_PENDING',
    finalAcceptance: finalAcceptance ? await identify('docs/m3-1-final-acceptance.json') : undefined,
    scope: 'Add optional 2X campaign interface artwork and verify original initial bridge destruction and ordinary engineer repair.',
    source: { runtimeHead: runtime.sourceHead, taskBranch: 'task/m3-1-soviet01', map,
        campaignManifest: await identify('.local/campaign/ra2/sov01t/manifest.json'), additions,
        acceptedPreviousManifest: { ...await identify(work + '/accepted-247f-manifest.json'),
            provenance: 'Reconstructed by removing exactly the three optional interface files; byte hash matches the frozen accepted receipt.',
            preservedFiles: 22 },
        sourcePresentation: await identify('.local/campaign/ra2/sov01t/presentation.json'),
        applicationSourceMatchesCapturedRuntime: true },
    priorAcceptance: { reviewCommit: '247f6df7', status: 'USER_ACCEPTED',
        scope: 'Memorial, flag, Urban v5 roads, localized rank and original result presentation',
        evidence: await identify('docs/m3-1-feedback-corrections.json'),
        frozenNativeHead: accepted.source.runtimeHead },
    interface: { revision: bundle.revision, density: 2, selection: bundle.selection,
        loading: bundle.loading, animation: bundle.animation, anchors: bundle.anchors,
        tool: 'Built-in imagegen', prompts: await identify('docs/m3-1-interface-prompts.json'),
        masters: await Promise.all(masters.map(identify)), export: await identify(work + '/export.json'),
        sharedBudget: { bytes: 16777216, selectionReservedBytes: native.hdMenu.ui.reservedBytes,
            loadingReservedBytes: native.loading.ui.reservedBytes, unchanged: true,
            fallback: 'Complete Original source art when disabled, unavailable or over budget; scene-specific surfaces released on exit.' },
        remainingSourceDetail: ['Source-derived geographic contours and annotation detail', 'Original-density result panel and animated badge'],
        boundary: 'Authored HD illustration components retain source anchors. Geographic vectors preserve source detail; no new geographic resolution, original photographic pixels or 4X UI is claimed.' },
    bridge: { sourceChanged: false, runtimeChanged: false, conforms: true,
        trigger: { key: '0823BDEC', event: 13, explosions: 8, opcode: 63, tick: 0, waypoints: [72, 75] },
        freshOpening: native.freshOpening, executedActions: native.breakTrigger,
        repair: { engineer: 1942, hut: 1607, missingTile: [88, 84], repairEventTick: 10547,
            semantics: 'Engineer enters the bridge repair hut and is consumed. The missing original overlay is restored; ownership change is not required.',
            commands: baseline.final.commands.filter(command => command.tick >= 9440 && command.tick <= 10548),
            cases: native.bridgeCases },
        scope: native.scope },
    validation: { native: await identify(nativePath + '/report.json'), nativeHarness: await identify('scripts/m3-1/interface-bridge-native.mjs'),
        focusedTests: { cases: 47, failed: 0, assertions: 303, evidence: await identify(work + '/tests.log') },
        entryTypecheck: await identify(work + '/typecheck-final.json'), typecheckLog: await identify(work + '/typecheck-final.log'),
        build: await identify(work + '/build.log'), imagePackaging: await identify('.artifacts/m3-1/review-media/interface-images.json'),
        crops: await identify(nativePath + '/crops.json'), menuVideo: await identify(nativePath + '/video-verification.json'),
        resultVideo: await identify('.artifacts/m3-1/feedback-score-r1/video-verification.json'),
        fullGameplayBaseline: await identify('docs/m3-1-soviet01-acceptance.json'),
        frozenFullInputHead: 'd1e21e8c888e98191e250939050b9d08330a7f67',
        browserConnection: await identify(work + '/browser-connection.json'),
        browserRender: 'NOT_RUN_NO_CONNECTED_TAB', windows: 'NOT_RUN_ON_THIS_MAC',
        pageErrors: 0, consoleErrors: 0, failedResources: 0 },
    screenshots: images.images, videos: await Promise.all([menuVideo.path, scoreVideo.path].map(identify)),
    retainedAttempts: await Promise.all(['r1', 'r2', 'r3'].map(async (attempt, index) => ({ attempt,
        evidence: await identify(work + '/native-' + attempt + '/report.json'),
        reason: ['Observer queried an engineer before its source reinforcement spawned',
            'Observer attempted Escape while the original opening cinematic still held input',
            'Observer accessed the restored game UI before asynchronous loading completed'][index] }))),
    generationAttempts: exported.generationFailures,
    review: { path: '.artifacts/m3-1/M3.1-Embedded-Review.html', newInterfaceUserAcceptance: finalAcceptance ? 'ACCEPTED' : 'PENDING',
        previousReviewUserAcceptance: 'ACCEPTED', sourceIntegratedIntoMain: false, remotePush: false,
        publication: false, desktopPackagesModified: false },
};
await fs.writeFile(path.join(root, 'docs/m3-1-interface-bridge.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, runtime: runtime.sourceHead,
    bridgeDensities: native.bridgeCases.map(item => item.density), images: receipt.screenshots.length, videos: receipt.videos.length }));
