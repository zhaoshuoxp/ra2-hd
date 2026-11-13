import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r4');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const git = (directory, args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
async function pin(file) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
    return { file, bytes: (await fs.stat(file)).size, sha256: hash.digest('hex') };
}
async function report(name) {
    const file = path.join(base, name, 'report.json'), result = await read(file);
    assert(result.status.startsWith('PASS'), name);
    if (result.harnessSha256) assert.equal((await pin(path.join(base, name, 'harness.mjs'))).sha256, result.harnessSha256);
    let sourceHead = result.sourceHead ?? result.metadata?.sourceHead;
    if (result.app) sourceHead = (await read(path.join(result.app, 'Contents/Resources/app/package.json'))).sourceHead;
    if (name === 'current-main-native-skirmish') {
        const identity = await read(path.join(base, name, 'source-identity.json')); sourceHead = identity.sourceHead;
        assert.equal((await pin(path.join(base, name, 'harness.mjs'))).sha256, identity.tools[0].sha256);
    }
    assert(sourceHead, name);
    return { name, status: result.status, sourceHead,
        cases: result.cases?.length, proof: await pin(file) };
}
const runtime = await read(path.join(base, 'runtime-current/package.json'));
const stage = await read(path.join(base, 'stage/stage.json')), archive = await read(path.join(base, 'archive.json'));
const desktop = await read(path.join(base, 'desktop-delivery.json')), extracted = await read(path.join(base, 'extracted.json'));
const review = await read(path.join(base, 'review.json')), loading = await read(path.join(base, 'native-loading-current/report.json'));
assert.equal(stage.identity.runtimeSourceHead, runtime.sourceHead); assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert(stage.promotion.allAppBytesIdenticalToNativeCandidate && stage.promotion.nativeSignaturePreservedAndVerified);
assert.equal(archive.sha256, desktop.sha256); assert.equal(extracted.zipSha256, desktop.sha256);
assert.equal(extracted.entries, 14547); assert.equal(stage.entries, extracted.entries);
assert.equal((await pin(desktop.path)).sha256, desktop.sha256);
assert.equal(review.sourceHead, runtime.sourceHead); assert.equal((await pin(review.file)).sha256, review.sha256);
assert.equal(review.images.length, 9); assert.equal(loading.pixels.bottomDarkPixels, 0); assert.equal(loading.pixels.prefixMismatches, 0);
const changed = git(root, ['diff', '--name-only', 'fa8494701e08c0b1d4a0af68240f541fb897ff0d', runtime.sourceHead, '--', 'src', 'desktop', 'public']).split('\n').sort();
assert.deepEqual(changed, ['public/res/presentation/campaign-backdrop-soviet-score-original-r4.png',
    'src/gui/campaign/CampaignBackdrop.tsx', 'src/gui/campaign/CampaignChrome.tsx', 'src/gui/campaign/CampaignScorePresentation.ts'].sort());
const native = await Promise.all(['native-loading-current', 'native-victory-current', 'native-defeat-current',
    'native-desktop-original', 'current-main-native-campaign', 'current-main-native-skirmish'].map(report));
const mainBase = '34e6fbe6b5d2808db4034e21d9e2dad36e7a7c3a';
const preview = path.join(base, 'current-main-preview'), combined = git(preview, ['rev-parse', 'HEAD']);
assert.equal(combined, '528e5cfb65d5ebf16171dbd389e3aa7dca884eec');
assert.equal(git('/Users/Aone/RA2remaster/ra2-hd', ['rev-parse', 'HEAD']), mainBase);
assert.equal(git('/Users/Aone/RA2remaster/ra2-hd', ['status', '--porcelain']), '');
for (const [file, passed, assertions] of [['tests-current.log', 51, 811], ['current-main-tests-final.log', 56, 844]]) {
    const text = await fs.readFile(path.join(base, file), 'utf8');
    assert(text.includes(passed + ' pass') && text.includes('0 fail') && text.includes(assertions + ' expect() calls'));
}
for (const file of ['typecheck-current.log', 'current-main-typecheck.log']) {
    assert(!/error TS|Error:/.test(await fs.readFile(path.join(base, file), 'utf8')));
}
const integration = { status: 'PASS_CURRENT_MAIN_ISOLATED_MERGE_AND_FRESH_BOTH_NATIVE_SAVE_FLOWS_MAIN_UNCHANGED',
    mainBase, campaignRuntime: runtime.sourceHead, resolvedHead: combined,
    bundle: await pin(path.join(base, 'M3.1-R4-Current-Main-Integration-Preparation.bundle')),
    requiredBundleBase: mainBase, resolution: await pin(path.join(base, 'current-main-resolution.json')),
    tests: { passed: 56, failed: 0, assertions: 844, files: 15 },
    native: native.filter(row => row.name.startsWith('current-main-')),
    limit: 'Preparation only; canonical main is clean and unchanged. Recheck its live identity before integration. Windows was not run.' };
const source = await read(path.join(root, 'scripts/m3-1/score-background-r4.json'));
assert.equal(source.generation.status, 'REJECTED_BY_IMAGE_GENERATION_SAFETY_SYSTEM');
const result = { status: 'PASS_MAC_LOADING_REPAIR_AND_ORIGINAL_BACKGROUND_RESTORE_GENERATED_HD_BACKGROUND_BLOCKED',
    runtimeSourceHead: runtime.sourceHead, previousRuntimeSourceHead: 'fa8494701e08c0b1d4a0af68240f541fb897ff0d', changedRuntimePaths: changed,
    fixes: ['Brighter retail yellow-orange loading palette on the existing shared metal cylinder.',
        'Continuous red floor removes irregular black pinholes; original green/blue relief remains.',
        'Unsaturated fixed highlights retain the unlit cylinder gradient and do not move with progress.',
        'Restore sscrbkmd.shp Soviet insignia/starburst instead of the faction-selection topographic backdrop.',
        'Remove the native border/shadow, retain one proportional insignia and extend only outer background rays.'],
    sourceVerification: source.source, background: { asset: await pin(path.join(root, source.asset)), density: 'ORIGINAL',
        generationStatus: source.generation.status, generationRequestId: source.generation.requestId,
        promptAndFailureRecord: await pin(path.join(root, 'scripts/m3-1/score-background-r4.json')),
        outstanding: 'The newly generated HD full-screen background was rejected by the built-in tool. No generated output or alternate generation was produced.' },
    loadingPixels: loading.pixels, loadingColor: await read(path.join(base, 'loading-color-final.json')),
    tests: { passed: 51, failed: 0, assertions: 811, files: 13 }, entryTypecheck: 'PASS', native,
    delivery: { ...desktop, extractedStatus: extracted.status, entries: extracted.entries, signature: 'PASS_DEEP_STRICT',
        resourceFilesUnchanged: 14004, profile: '~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023',
        userDataInArchive: false, signedAppIdenticalToNativeCandidate: true },
    review: { ...await pin(review.file), images: review.images.length, embedding: review.status,
        browserPreview: review.browserPreview }, integration,
    unchanged: ['Original mission map, rules, scripts, objectives and source media.', 'Safe Original sprite clock, loading-world registration and foreground layers.',
        'Both save schemas, modified-save gate, trainer scope and in-game native information styling.', '16 MiB UI reservation and 1.7 million composited-pixel cap.'],
    retained: ['Accepted base and all earlier delivery archives/profiles where present.', 'R4 early candidate with the reported dark pinholes and pre-final highlight curve.',
        'Earlier frozen-donor merge preparations and all raw native evidence.', 'Initial current-main fixture failures and their explicit layout correction.'],
    acceptance: { technicalMac: 'PASS', visualAndPhysicalInput: 'PENDING_USER_REVIEW', generatedHdScoreBackground: 'BLOCKED_BY_IMAGE_TOOL',
        nativeWindows: 'NOT_RUN_ON_THIS_MAC', mainIntegration: 'PREPARED_NOT_MERGED', remotePush: 'NOT_REQUESTED' } };
await fs.writeFile(path.join(base, 'integration-preparation.json'), JSON.stringify(integration, null, 2) + '\n', { flag: 'wx' });
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r4.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, sourceHead: runtime.sourceHead, desktop: desktop.path,
    sha256: desktop.sha256, nativeCases: native.length, generatedHdBackground: 'BLOCKED', combinedHead: combined }));
