import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = '.artifacts/m3-1/campaign-entry-r1';
const read = async file => JSON.parse(await fs.readFile(path.resolve(root, file), 'utf8'));
async function pin(file) {
    const absolute = path.resolve(root, file), digest = createHash('sha256');
    for await (const bytes of createReadStream(absolute)) digest.update(bytes);
    return { path: file, bytes: (await fs.stat(absolute)).size, sha256: digest.digest('hex') };
}
const accepted = await read('docs/m3-1-final-acceptance.json');
const prior = await read('.artifacts/m3-1/mac-delivery/stage/stage.json');
const repro = await read('.artifacts/m3-1/campaign-entry-repro-r1/report.json');
const stage = await read(base + '/stage/stage.json'), delivered = await read(base + '/desktop-delivery.json');
const extracted = await read(base + '/extracted.json');
const staged = await read(base + '/native-stage-r3/report.json');
const native = await read(base + '/native-desktop-r1/report.json');
const defaults = await read(base + '/native-default-r1/report.json');
assert.equal(repro.status, 'PASS_REPRODUCED_YR_DEAD_END_AND_RA2_PLAYABLE_ENTRY');
assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert.equal(delivered.status, 'PASS_DESKTOP_COPY_HASH_MATCH');
assert.equal(extracted.status, 'PASS_ACTUAL_DESKTOP_ZIP_EXTRACTED_ALL_BYTES_LINKS_MODES_AND_SIGNATURE');
assert.equal(staged.status, 'PASS_PACKAGED_ENTRY_EDITION_RECOVERY_AND_PLAYABLE_MISSION');
assert.equal(native.status, staged.status); assert.equal(native.cases.length, 9);
assert.equal(defaults.status, 'PASS_DEFAULT_PROFILE_DIRECT_ENTRY_AND_SAVE_PRESERVATION');
assert(defaults.savePreservation.unchanged);
assert.equal(native.metadata.sourceHead, stage.identity.runtimeSourceHead);
assert.equal(native.executable, path.join(extracted.app, 'Contents/MacOS', extracted.executable));
assert.equal(execFileSync('git', ['diff', '--name-only', stage.identity.runtimeSourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
assert.equal(execFileSync('git', ['diff', '--name-only', accepted.source.runtimeHead, '--', 'src/game', 'src/data',
    'src/gui/campaign/CampaignSaveStore.ts'], { cwd: root, encoding: 'utf8' }).trim(), '');
for (const report of [staged, native, defaults]) {
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.failedResources, []);
    assert.equal(report.harnessSha256, (await pin('scripts/m3-1/campaign-entry-native.mjs')).sha256);
}
const resources = path.join(extracted.app, 'Contents/Resources/GameResources');
const campaignManifest = await pin(path.join(resources, 'campaign/ra2/sov01t/manifest.json'));
assert.equal(campaignManifest.sha256, accepted.source.campaignManifest.sha256);
const map = await pin(path.join(resources, 'campaign/ra2/sov01t/sov01t.map'));
assert.equal(map.sha256, '7f4492961d30b5799367aa840ba007932057b19a22a77f95475a18ca1407b99f');
const actualZip = await pin(delivered.path);
assert.equal(actualZip.sha256, delivered.sha256); assert.equal(actualZip.sha256, extracted.zipSha256);
const preservedZip = await pin('.artifacts/m3-1/mac-delivery/RA2-HD-M3.1-Mac-arm64-20261023.zip');
assert.equal(preservedZip.sha256, '5ff0cd146eecef508fb0688af21c3dcdaab84cc616eb24fdddab8f1b3bcb9993');
const evidence = [];
for (const file of ['stage/stage.json', 'stage/inventory.json', 'archive.json', 'desktop-delivery.json', 'extracted.json',
    'native-stage-r1/report.json', 'native-stage-r1/harness.mjs', 'native-stage-r2/report.json', 'native-stage-r2/harness.mjs',
    'native-stage-r3/report.json', 'native-desktop-r1/report.json', 'native-default-r1/report.json']) evidence.push(await pin(base + '/' + file));
for (const directory of ['native-stage-r3', 'native-desktop-r1', 'native-default-r1']) {
    for (const file of (await read(base + '/' + directory + '/report.json')).screenshots) evidence.push(await pin(base + '/' + directory + '/' + file));
}
for (const directory of ['native-stage-r1', 'native-stage-r2']) {
    const failed = await read(base + '/' + directory + '/report.json'); assert.equal(failed.status, 'FAIL');
    assert.equal(failed.harnessSha256, (await pin(base + '/' + directory + '/harness.mjs')).sha256);
}
await fs.copyFile('/Users/Aone/.codex/attachments/6a9a01bf-7d6b-4e5e-91a5-413a4cddbaa7/Screenshot 2026-10-23 at 8.37.52 PM.png',
    path.join(root, base, 'user-report.png'), fs.constants.COPYFILE_EXCL);
const receipt = {
    status: 'M3_1_CAMPAIGN_ENTRY_R1_MAC_TECHNICAL_AND_DESKTOP_DELIVERY_PASS_USER_TEST_PENDING', recordedAt: new Date().toISOString(),
    source: { runtimeHead: stage.identity.runtimeSourceHead, acceptedBaseHead: accepted.source.runtimeHead,
        changedRuntimePaths: stage.identity.changedRuntimePaths, unchangedGameDataAndSaveSchema: true,
        harness: await pin('scripts/m3-1/campaign-entry-native.mjs'), recorder: await pin('scripts/m3-1/record-entry-repair.mjs') },
    report: { userScreenshot: await pin(base + '/user-report.png'), reproduction: await pin('.artifacts/m3-1/campaign-entry-repro-r1/report.json'),
        finding: 'The retained delivered app reproduces the blank unavailable campaign page under Yuri\'s Revenge. The same app enters Soviet 01 under RA2. The user screenshot alone does not establish the selected edition or executable.',
        resolution: 'The R1 campaign app opens RA2 faction selection directly. The unsupported edition offers central and sidebar buttons which reload RA2 and open its faction selection. The entry route is consumed so normal Back behavior is preserved.' },
    preservation: { verifiedUnchangedBundledResourceFiles: 14004, campaignManifest, map, priorArchive: preservedZip,
        acceptedBaseReview: await pin('.artifacts/m3-1/M3.1-Embedded-Review.html'), priorPackageInventorySha256: prior.packageInventorySha256,
        defaultProfile: defaults.bootstrap.userData, savePreservation: defaults.savePreservation,
        note: 'No profile or save is shipped. The existing M3.1 profile is retained; registration binds to the app\'s own relocated resources. Its manual slot was empty and stayed empty; this default-profile check does not exercise migration of an existing save. Other apps and profiles are untouched.' },
    validation: { focusedTests: { cases: 5, assertions: 47, failures: 0, log: await pin('.artifacts/m3-1/campaign-entry-tests-r1.log') },
        entryTypecheck: { status: 'PASS', log: await pin('.artifacts/m3-1/campaign-entry-typecheck-r1.log') },
        stagedNative: staged.status, actualDesktopExtractedNative: native.status, defaultProfile: defaults.status,
        cases: native.cases.map(({ name, size, dpr, density }) => ({ name, size, dpr, density })), fullscreen: native.fullscreen,
        intro: native.intro, loading: native.loading, opening: native.opening,
        realInput: { tick: native.input.tick, commands: native.input.commands, glError: native.input.glError },
        pageErrors: 0, consoleErrors: 0, failedResources: 0,
        retainedObserverFailures: [
            { path: base + '/native-stage-r1', reason: 'Observer requested macOS Spaces fullscreen instead of the application\'s borderless fullscreen control.' },
            { path: base + '/native-stage-r2', reason: 'Observer inspected tick zero before executing the opening trigger. The final observer advances the first original turn before checking initialization.' },
        ], applicationChangedBetweenNativeAttempts: false,
        scope: 'Fresh UI launch and real keyboard orders after accelerated opening simulation. Full-mission completion and engineer repair reuse their matched accepted baseline evidence; no new full physical-input run is claimed.' },
    delivery: { ...delivered, archive: actualZip, app: path.basename(extracted.app), signature: 'PASS_DEEP_STRICT_AD_HOC_LOCAL_TEST', entries: extracted.entries },
    statusBoundaries: { acceptedM3Base: 'USER_ACCEPTED_UNCHANGED', entryCorrectionUserAcceptance: 'PENDING',
        windows: 'NOT_RUN_ON_THIS_MAC', mainIntegration: 'NOT_REQUESTED', remotePush: 'NOT_REQUESTED', cleanup: 'NOT_REQUESTED' },
    evidence,
};
await fs.writeFile(path.join(root, 'docs/m3-1-campaign-entry-r1.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
await fs.writeFile(path.join(root, 'docs/m3-1-campaign-entry-r1.md'), `# M3.1 campaign entry repair R1

The retained delivered app reproduces the reported blank unavailable campaign page when Campaign is opened in Yuri's Revenge. Switching the same app to RA2 permits Soviet 01. The screenshot alone does not prove which edition or executable the user opened.

Runtime \`${receipt.source.runtimeHead}\` fixes entry and recovery only. The dedicated R1 Mac app opens RA2 faction selection directly. Clicking the Soviet emblem on Normal plays the original introduction and enters Red Dawn. The Load button restores a manual save. Campaign under Yuri's Revenge now explains the edition difference and provides two working RA2 entry buttons. A consumed startup route preserves Back and abort behavior.

All 14,004 bundled resource files match the preceding delivery. The accepted interface, statue/flag, roads, original map, gameplay, bridge scripts and save format are unchanged. The accepted base remains \`${receipt.source.acceptedBaseHead}\`. The original source ZIP and accepted offline review retain their hashes. Other apps and profiles are untouched.

Five focused cases / 47 assertions and entry typecheck pass. Both the staged app and the app extracted from the actual Desktop ZIP pass nine entry cases, including window sizes, 3840 x 2160 application fullscreen, both edition recovery buttons, Original/HD reentry, original video/audio, HD loading, and a fresh Normal mission which accepts real keyboard commands. The original opening creates both broken bridges; the assisted opening reaches input unlock at tick 1395. Page, console, resource and GL checks are clear. Default-profile direct startup passes; its manual slot was empty and stayed empty, so this check does not claim migration of an existing save. This is bounded entry verification; prior matched full-mission, save/reload and engineer-repair evidence remains the gameplay baseline.

Two observer failures remain under \`${base}/native-stage-r1\` and \`native-stage-r2\`, each with its exact harness. They concern the fullscreen API and inspecting tick zero before the first turn. The packaged application is unchanged across those attempts and the passing final runs.

Desktop delivery: \`${delivered.path}\` (${delivered.bytes.toLocaleString('en-US')} bytes; ${extracted.entries.toLocaleString('en-US')} entries). SHA-256: \`${delivered.sha256}\`. The actual Desktop archive passes all file hashes, links, modes, relocated extraction and strict deep signing checks. Open **${path.basename(extracted.app)}**, then choose the Soviet emblem with Normal difficulty.

Technical Mac/package validation is complete. User manual testing of R1 is pending. Native Windows is NOT_RUN_ON_THIS_MAC. No main integration, cleanup, remote push or publication occurred. Continue same-outcome manual feedback in the existing execution conversation. Full pins and raw evidence are in [the receipt](m3-1-campaign-entry-r1.json).
`, { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, delivery: delivered.path, sha256: delivered.sha256 }));
