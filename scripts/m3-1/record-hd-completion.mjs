import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(path.join(base, file), 'utf8'));
async function sha(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
const stage = await read('delivery-stage/stage.json'), archive = await read('archive.json');
const delivered = await read('desktop-delivery.json'), extracted = await read('extracted.json');
const desktop = await read('native-desktop/report.json'), opening = await read('opening-native-v3/report.json');
const coverage = await Promise.all([2, 4].map(density => read(`coverage-${density}x-v1/report.json`)));
const poses = await read('poses-native-v1/report.json'), review = await read('compact-review/review.json');
const art = await read('selected-art.json'), integration = await read('integration-preparation-r7.json');
assert.equal(desktop.status, 'PASS_PACKAGED_ENTRY_EDITION_RECOVERY_AND_PLAYABLE_MISSION');
assert.equal(desktop.metadata.sourceHead, stage.sourceHead); assert.equal(desktop.cases.length, 9);
assert.equal(desktop.executable, path.join(extracted.app, 'Contents/MacOS', extracted.executable));
assert(opening.status.startsWith('PASS_') && poses.status.startsWith('PASS_'));
assert(coverage.every(row => row.hdClosure.length === 29 && row.status.startsWith('PASS_')));
assert.deepEqual(desktop.errors, []); assert.deepEqual(desktop.failedResources, []);
assert.equal(archive.sha256, delivered.sha256); assert.equal(delivered.sha256, extracted.zipSha256);
assert.equal(await sha(delivered.path), delivered.sha256); assert.equal(archive.entries, 14614);
assert.equal(await sha(review.file), review.sha256); assert.equal(review.images.length, 13);
assert.equal(execFileSync('git', ['diff', '--name-only', stage.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', extracted.app]);
const files = ['source/source.json', 'user-art-disposition-20261024.json', 'selected-art.json', 'reuse-receipt.json',
    'registration-receipt.json', 'static-check.json', 'resource-plan.json', 'native-stage/stage.json',
    'native-stage/resource-inventory.json', 'opening-native-v3/report.json', 'coverage-2x-v1/report.json',
    'coverage-4x-v1/report.json', 'poses-native-v1/report.json', 'compact-review/review.json', 'final-review/review.json',
    'delivery-stage/stage.json', 'delivery-stage/inventory.json', 'archive.json', 'desktop-delivery.json', 'extracted.json',
    'native-desktop/report.json', 'r6-preservation.json', 'integration-preparation-r7.json', 'focused-tests-source.log'];
const evidence = [];
for (const file of files) evidence.push({ file: path.relative(root, path.join(base, file)), sha256: await sha(path.join(base, file)) });
const result = { status: 'PASS_MAC_HD_COVERAGE_ORIGINAL_FLAG_AND_DELIVERED_R7_PENDING_USER_ACCEPTANCE',
    runtimeSourceHead: stage.sourceHead, sourceCheckpoint: 'docs/m3-1-hd-completion-r7-source.json',
    artStandard: { project: 'docs/hd-art-standard.md', workspace: '/Users/Aone/RA2remaster/AGENTS.md',
        crossConversationNote: '/Users/Aone/.codex/memories/extensions/ad_hoc/notes/20261025T062435Z-ra2-persistent-hd-art-finish.md' },
    art: { mode: art.mode, selectedMasters: art.selectedMasters.length, index: path.relative(root, path.join(base, 'selected-art.json')),
        promptSets: art.promptSets, userRetained: ['TUG', 'PDPLANE'], rejectedMaterialsRetained: true },
    coverage: { correctedIdentities: 29, exactAcceptedReuse: 23, newCompleteFamilies: 6,
        inspectedIdentitiesPerDensity: coverage.map(row => row.inspectedIdentities), densities: [2, 4],
        fixedWorldBudgetsMiB: { '2x': 512, '4x': 1280 }, newPngPagesVerified: 34,
        nativeBuildingStatePoses: 8, nativeVxlHeadingPoses: 24, explicitCivilianFixtures: 4,
        fixtureBoundary: poses.scope, nativeOnlyImageSnapshots: true },
    opening: { densities: [1, 2, 4], firstOccupiedObservedAtTicks: opening.cases.map(row => row.firstOccupiedObservedAt),
        occupancyObservationInterval: '(600, 630] simulation ticks; sampled every 30 ticks, not an exact event timestamp',
        matchedTick: 3600, worldHash: opening.cases[0].control.hash, rngAndMissionStateIdentical: true,
        actualOriginalTeam: 'Occupy Memorial / Other3 House / E2', animation: 'CAWA19_AG', loop: [33, 47],
        nativeTriggerStateInjected: false, nativeActorInjected: false, nativeAircraftSpawnConfirmed: true },
    tests: { passed: 84, failed: 0, assertions: 1198, entryTypecheck: 'PASS', nativeDesktopEntryCases: 9,
        nativePageAndResourceErrors: 0, nativeWindows: 'NOT_RUN_ON_THIS_MAC' },
    delivery: { ...delivered, app: path.basename(extracted.app), strictSignature: 'PASS',
        extractedEntries: extracted.entries, selectedResources: stage.verifiedResourceFiles },
    review: { ...review, fullReview: path.relative(root, path.join(base, 'final-review/M3.1-HD-Completion-R7-Review.html')) },
    preservation: await read('r6-preservation.json'),
    integrationPreparation: { receipt: path.relative(root, path.join(base, 'integration-preparation-r7.json')),
        transferFiles: integration.files.length, baselineSelectorMatchesObservedMain: integration.selector.baselineMatches,
        observedMain: integration.canonicalMainObservedHead, canonicalMainWritten: false,
        currentCombinedMainNative: 'NOT_RUN; prior named/skirmish save rehearsal remains separately pinned' },
    retainedEarlierEvidence: [
        'source-preflight-v1.json: initial guessed building remap metadata corrected from actual native art before final authoring.',
        'original-reference-v1: first observer used an unavailable renderer field; corrected original-reference-v2 passes.',
        'authoring-shp and original cruise masters: grainy finish reopened by the user; complete rejected candidates remain unselected.',
        'Superseded clean R2 wood/cruise candidates remain retained; targeted R3 material correction is selected.',
        'focused-tests.log: packaged import-only receipt fixture mismatch; matched imported-source focused suite passes.',
        'opening-native-v1: observer expected source house identifier rather than runtime display name.',
        'opening-native-v2: observer expected obsolete 256 MiB 2X budget; verified unchanged R6 budget is 512 MiB.',
        'opening-native-v3: final Original/2X/4X original scripted opening passes without further product changes.'
    ], evidence, userVisualAndPhysicalAcceptance: 'PENDING', remotePush: false, cleanup: false, nextMission: false };
await fs.writeFile(path.join(root, 'docs/m3-1-hd-completion-r7.json'), JSON.stringify(result, null, 2) + '\n');
await fs.appendFile(path.join(root, 'docs/m3-1-hd-completion-r7.md'), `
## Final native validation and delivery

Runtime \`${stage.sourceHead}\` passes the Original/2X/4X natural scripted opening: the Soviet E2 garrisons the memorial and selects the existing red-flag animation. Occupancy is observed in the sampled interval (600, 630] ticks; this is not a measured exact event timestamp. All three modes have identical world hash \`${opening.cases[0].control.hash}\`, RNG and mission state at tick 3600. No actor, trigger, order, health, ownership or garrison state is injected in this opening check.

Both densities inspect 133 identities and close all 29 audited gaps before extra audit-only prewarming. Native object/batch materials pass. Eight building-state poses and 24 VXL headings pass with an unchanged simulation hash; four future civilian actors use explicitly labeled factory fixtures. Budgets remain the R6 values: 512 MiB at 2X and 1,280 MiB at 4X. Full new PNG hashes, complete source families, native logical geometry and independent densities pass.

The Desktop ZIP is \`${delivered.path}\` (${delivered.bytes} bytes). SHA-256: \`${delivered.sha256}\`. All ${extracted.entries.toLocaleString('en-US')} archive entries, links and modes pass, and the actual Desktop extraction passes strict deep signing plus nine campaign-entry, display, movie/loading, real keyboard-order and return cases. It contains ${stage.verifiedResourceFiles.toLocaleString('en-US')} selected resource files and no user profile. Open **${path.basename(extracted.app)}** after extraction.

The self-contained review is \`${path.relative(root, review.file)}\` with 13 unchanged embedded native PNGs. The larger 34-image review remains under \`.artifacts/m3-1/hd-completion-r7/final-review\`. The native app and all failed/outlier evidence remain retained. The former R6 Desktop path is currently absent; its source ZIP and extracted app remain retained, and the source ZIP still matches SHA-256 \`589afb56842eb0232dbaf855c0166153b08cb1c9dec28ed6536eadccbe3d67ee\`. No cause is inferred and no old Desktop file is recreated.

## Selected artwork and future integration

New art uses the built-in imagegen tool. The exact 15 selected master paths and hashes are indexed in \`.artifacts/m3-1/hd-completion-r7/selected-art.json\`. Prompts and source roles are retained in \`authoring-jobs-v1.json\`, \`vxl-authoring-jobs-v1.json\`, \`clean-authoring-jobs-r2.json\` and \`clean-authoring-jobs-r3.json\` under that directory. The TUG/PDPLANE masters are retained with the user's permission. The selected source/palette-bound resources are under \`.artifacts/m3-1/hd-completion-r7/resources\`.

\`integration-preparation-r7.json\` pins ${integration.files.length.toLocaleString('en-US')} immutable resource files for an additive transfer and records that the observed canonical URBAN selector still matches the expected baseline. Canonical main is not modified. Preserve the prior combined campaign/skirmish save rehearsal and its conflict decisions; it is historical evidence, not a fresh native test of the current main head. Recheck live source ancestry and selectors before the separately authorized main merge. No cleanup, remote push or next mission is performed.

Mac technical/package checks pass. User visual/physical acceptance is pending; native Windows is \`NOT_RUN_ON_THIS_MAC\`. Continue this conversation for feedback on the same M3.1 delivery.
`);
console.log(JSON.stringify({ status: result.status, desktopZip: delivered.path, source: stage.sourceHead, review: review.file }));
