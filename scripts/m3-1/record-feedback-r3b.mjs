import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r3b');
const read = async file => JSON.parse(await fs.readFile(path.join(base, file)));
async function sha(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
const runtime = 'fa8494701e08c0b1d4a0af68240f541fb897ff0d';
const stage = await read('stage/stage.json'), archive = await read('archive.json'), delivered = await read('desktop-delivery.json');
const extracted = await read('extracted.json'), review = await read('review.json'), prep = await read('integration-preparation.json');
assert.equal(stage.identity.runtimeSourceHead, runtime); assert.equal(stage.verifiedUnchangedResourceFiles, 14004);
assert(stage.promotion.allAppBytesIdenticalToNativeCandidate && stage.promotion.nativeSignaturePreservedAndVerified);
assert.equal(execFileSync('git', ['diff', '--name-only', runtime, '--', 'src', 'desktop', 'public'], { cwd: root, encoding: 'utf8' }).trim(), '');
assert.equal(archive.sha256, delivered.sha256); assert.equal(extracted.zipSha256, delivered.sha256);
assert.equal(extracted.entries, archive.entries); assert.equal(await sha(delivered.path), delivered.sha256);
assert.equal(await sha(review.file), review.sha256); assert.equal(review.images.length, 16);
const native = [];
for (const directory of ['native-original-final', 'native-release-cn', 'native-save-final', 'native-victory-final',
    'native-desktop-save', 'native-desktop-original', 'native-desktop-default']) {
    const report = await read(directory + '/report.json'); assert(report.status.startsWith('PASS'), directory);
    assert.equal(await sha(path.join(base, directory, 'harness.mjs')), report.harnessSha256, directory);
    const app = report.app ?? path.dirname(path.dirname(path.dirname(report.executable)));
    const metadata = JSON.parse(await fs.readFile(path.join(app, 'Contents/Resources/app/package.json')));
    assert.equal(metadata.sourceHead, runtime, directory);
    if (directory.includes('original')) { assert.equal(report.arrowFrames.length, 12); assert.deepEqual(report.errors, []); }
    native.push({ directory, status: report.status, sourceHead: metadata.sourceHead, cases: report.cases?.length,
        screenshots: report.screenshots, arrowFrames: report.arrowFrames, savePreservation: report.savePreservation });
}
const tests = await fs.readFile(path.join(base, 'tests-final.log'), 'utf8'); assert(/51 pass\s+0 fail\s+811 expect/.test(tests));
assert(!/error TS|exited with code/.test(await fs.readFile(path.join(base, 'typecheck-final.log'), 'utf8')));
const mergedTests = await fs.readFile(path.join(base, 'merge-tests-final.log'), 'utf8'); assert(/56 pass\s+0 fail\s+844 expect/.test(mergedTests));
assert.equal(await sha(prep.bundle.file), prep.bundle.sha256);
const cn = await read('native-release-cn/report.json'), win = await read('native-victory-final/report.json');
assert(cn.factionSounds.length === 3 && cn.factionSounds.every(sound => sound.handle));
assert.equal(cn.fillMaterial.fillSource, cn.fillMaterial.housingSource); assert.equal(win.result.tick, 20090);
assert.equal(win.scoreArtwork.subjectScale, .78); assert.equal(win.cheers[0].completion, 'ended');
const previous = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/feedback-r3/native-desktop-original/report.json')));
assert.equal(previous.status, 'FAIL'); assert(previous.errors.some(error => error.includes('putImageData')));
const before = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/campaign-entry-r1/stage/inventory.json')));
const campaignPins = [];
for (const name of ['manifest.json', 'sov01t.map', 'presentation.json', 'interface-hd.json', 'score-presentation.json']) {
    const pin = before.find(row => row.file.endsWith('/GameResources/campaign/ra2/sov01t/' + name)); assert(pin, name);
    assert.equal(await sha(path.join(root, '.local/campaign/ra2/sov01t', name)), pin.sha256, name);
    campaignPins.push({ name, sha256: pin.sha256, bytes: pin.bytes });
}
const mainHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(root, '../ra2-hd'), encoding: 'utf8' }).trim();
const result = { status: 'PASS_M3_1_FEEDBACK_R3B_MAC_DELIVERY_PENDING_USER_REVIEW_MAIN_INTEGRATION_PREPARED', runtimeSourceHead: runtime,
    changes: [
        'Original AlliedCampaignSelect, BootCampSelect and SovietCampaignSelect playback on hover/focus.',
        'Loading world-map registration uses the original centered mission plane and a stable Atlantic-US locator.',
        'Score apparatus and live text share a 0.78 scale; per-frame matting removes the opaque baked plate.',
        'Named campaign saving/loading reuses the frozen bugfix UI, confirmations and HD artwork. The journal-v3 checkpoint remains unchanged inside a separate checksum envelope/database; the old manual slot is a read-only list row until the user explicitly overwrites or deletes it.',
        'Lit and unlit progress use the same glossy cylinder texture, seams and highlights; amber lighting is bounded to the cylinder. Existing silver ornaments and exposed cable remain.',
        'A shared frame selector clamps callbacks before effect startup and holds the last opening frame, fixing the Original-mode renderer exception found in the intermediate R3.'
    ],
    verification: { focused: { pass: 51, fail: 0, assertions: 811, files: 13 }, typecheck: 'PASS', native,
        originalMode: 'Two fresh-candidate passes and the actual Desktop extraction pass repeated faction hovering, nine entry/recovery/playability/return cases and real keyboard orders without page errors.',
        save: 'Native exact-world/RNG/campaign restore after a complete app restart, legacy fixture compatibility, overwrite/delete/cancel, corrupted checksum rejection and formal modified-save rejection pass.',
        victory: { tick: win.result.tick, hash: win.result.hash, sourceVoice: 'ended', cheer: 'ended', scale: .78,
            observedDistinctEmblemFrames: new Set(win.phases.map(p => p.emblemFrame).filter(f => f !== undefined && Number(f) >= 0)).size },
        unchangedReuse: { english: '../feedback-r3/native-release-en/report.json', traditionalChinese: '../feedback-r3/native-release-tw/report.json',
            defeat: '../feedback-r3/native-defeat-final/report.json', scope: 'No subtitle-track, locale, defeat behavior or defeat visual-layout changes. Source heads are labeled in the embedded review.' },
        ui: { budgetBytes: 16777216, compositedPixelCap: 1700000, unchanged: true },
        pointerLock: { acquisition: 'REJECTED_BY_AUTOMATION_HOST', realDomClicks: 'PASS', controlledLockedHandoff: 'PASS', physicalFeel: 'PENDING_USER_REVIEW' } },
    resources: { unchangedBundledFiles: 14004, campaignPins, rulesScriptsObjectivesUnchanged: true },
    delivery: { archive, delivered, extracted, strictSignature: 'PASS', appBytesIdenticalToNativeCandidate: true, review },
    integrationPreparation: prep, canonicalMain: { observedHead: mainHead, modifiedByThisTask: false, integrated: false },
    retainedIntermediate: { directory: '../feedback-r3', desktopZip: '/Users/Aone/Desktop/RA2-HD-M3.1-Mac-arm64-20261024-R3.zip',
        status: 'SUPERSEDED_INTERMEDIATE_ORIGINAL_MODE_FAILURE', cause: await read('animation-clock-regression.json'),
        failedReport: '../feedback-r3/native-desktop-original/report.json', note: 'The R3 intermediate and all failed/early source, package and observer evidence remain retained. Only R3b is the final delivery.' },
    browserReview: { status: 'STATIC_EMBEDDING_AND_PNG_DECODING_PASS', images: review.images.length,
        inAppPreview: 'Not retried after the prior file:// URL-policy rejection; the browser allows HTTP/HTTPS only. No workaround was attempted. The self-contained HTML is included for manual opening.' },
    acceptance: { base: 'Previously accepted; preserved', currentVisualAndPhysical: 'PENDING_USER_REVIEW', windows: 'NOT_RUN_ON_THIS_MAC' },
    operations: { mainMerge: false, cleanup: false, remotePush: false, publication: false, nextMission: false } };
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r3b.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
const md = `# M3.1 feedback R3b\n\nRuntime \`${runtime}\` implements the five requested corrections and the Original-mode clock regression found during final testing. R3b supersedes the retained R3 intermediate. The accepted base, original rules/scripts/objectives and all 14,004 bundled game/resource files remain unchanged. Current visual and physical-input acceptance is pending; native Windows is NOT_RUN_ON_THIS_MAC.\n\n` +
result.changes.map(change => '- ' + change).join('\n') +
`\n\n## Verification and delivery\n\n51 focused cases / 811 assertions and entry typecheck pass. The final candidate and actual Desktop extraction pass Original-mode repeated hovering, nine entry/edition-recovery/playability/return cases, named-save restart/restore/overwrite/delete/cancel, corrupted-save rejection and default-profile legacy-slot preservation. Compatibility uses an authentic accepted checkpoint fixture in independent profiles; an empty default manual slot is not a claim of migrating existing user data. The final native victory reaches tick 20090 with the original medal/typewriter animation and completed voice/cheer. Unchanged English, Traditional Chinese and defeat evidence is labeled separately in the review. Native DOM clicks pass; OS pointer-lock acquisition is rejected by the automation host, with a separately labeled controlled locked-input handoff.\n\n- Desktop ZIP: \`${delivered.path}\`\n- SHA-256: \`${delivered.sha256}\` (${delivered.bytes} bytes; ${archive.entries} verified archive entries).\n- App: \`Red Alert 2 HD M3.1 Campaign R3b.app\`.\n- Offline review: \`${review.file}\` (${review.images.length} byte-identical embedded PNGs; no server or adjacent assets).\n\nThe in-app browser rejected file:// navigation under its URL policy. No workaround was attempted; static image decoding/hash checks pass and the HTML is included for manual opening.\n\n## Main integration preparation\n\nThe isolated frozen-source rehearsal passes typecheck, 56 focused cases / 844 assertions and the retained native campaign/skirmish save flows. No save-backend, GameScreen or simulation changes follow those native combined-source checks; later changes only affect campaign UI animation and loading material. Both save formats remain independent and use one shared browser in the rehearsal. Campaign route 22, skirmish-load route 23 and campaign-save route 24 are distinct; each game owns a copied route map.\n\nRead \`.artifacts/m3-1/feedback-r3b/integration-preparation.json\`. Resolved head \`${prep.resolvedHead}\` and the hash-verified final Git bundle preserve the shared-source resolutions and frozen bugfix snapshot. Canonical main is unchanged by this task. Recheck both live source identities before the later main merge. No cleanup, push, publication or next mission is performed.\n\nPreserve the R3 intermediate's Original-mode failure and all prior archives, profiles, masters and acceptance evidence. Continue the current execution conversation for manual feedback on this same M3.1 outcome.\n`;
await fs.writeFile(path.join(root, 'docs/m3-1-feedback-r3b.md'), md, { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, runtime, desktopZip: delivered.path, review: review.file }));
