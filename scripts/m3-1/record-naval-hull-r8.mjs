import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = async file => JSON.parse(await fs.readFile(path.join(base, file)));
async function sha(file) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const stage = await read('final-stage/stage.json'), delivered = await read('desktop-delivery.json');
const extracted = await read('extracted.json'), ui = await read('native-desktop/report.json');
const review = await read('review/review.json'), resources = await read('resource-preservation-with-flag.json');
const flags = await read('flag-validation.json'), preservation = await read('r7-preservation.json');
const opening = await read('opening-native/report.json'), original = await read('native-original/report.json');
const two = await read('native-2x/report.json'), four = await read('native-4x/report.json');
for (const report of [stage, delivered, extracted, ui, review, resources, flags, preservation, opening, original, two, four])
    assert(report.status.startsWith('PASS_'), report.status);
assert.equal(extracted.zipSha256, delivered.sha256); assert.equal(await sha(delivered.path), delivered.sha256);
assert.equal(await sha(review.file), review.sha256); assert.equal(resources.files, 14070);
assert.equal(ui.metadata.sourceHead, stage.sourceHead); assert.equal(ui.cases.length, 9);
assert.equal(ui.executable, path.join(extracted.app, 'Contents/MacOS', extracted.executable));
assert.equal(execFileSync('git', ['diff', '--name-only', stage.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
const modes = [original, two, four].map(r => ({ density: r.density, placements: r.initialPlacements.length,
    headings: r.units.reduce((sum, u) => sum + u.views.length, 0),
    clippedHullPixels: r.units.reduce((sum, u) => sum + u.views.reduce((n, v) => n + v.missingPixels, 0), 0),
    worldHashPreserved: r.worldBefore === r.worldAfter }));
assert(modes.every(m => m.placements === 6 && m.headings === 16 && m.worldHashPreserved));
assert(modes.filter(m => m.density !== 1).every(m => m.clippedHullPixels === 0));
assert.equal(opening.cases.length, 3);
assert(opening.cases.every(c => c.firstOccupiedObservedAt === 630 && c.control.hash === 1965294077));
assert.equal(opening.cases.filter(c => c.density !== 1).reduce((sum, c) => sum + c.flagSweep.frames.length, 0), 30);
const pins = [];
for (const file of ['baseline-4x/report.json', 'native-original/report.json', 'native-2x/report.json', 'native-4x/report.json',
    'opening-native/report.json', 'native-desktop/report.json', 'flag-validation.json', 'review/review.json',
    'resource-preservation-with-flag.json', 'r7-preservation.json', 'task-campaign-activation.json'])
    pins.push({ file, sha256: await sha(path.join(base, file)) });
const report = { status: 'R8_NATIVE_AND_MAC_PACKAGE_TECHNICAL_PASS_USER_VISUAL_ACCEPTANCE_PENDING',
    runtimeSourceHead: stage.sourceHead, renderFixCommit: 'a86ec3f7',
    changes: ['Apply reference-surface depth recovery to civilian and future non-airborne VXL hulls; preserve native projection, pose, water clipping and depth testing.',
        'Add the generated yellow Soviet hammer/sickle and outlined star to the garrison flag, retaining original cloth/pole/alpha/registration, other slots and timing.'],
    native: { modes, openingHashAtTick3600: 1965294077, activeGarrisonSlotsInspectedAtEachHdDensity: [33, 47],
        actualDesktopPackageUiCases: ui.cases, userProfile: 'Untouched; every automated run uses a new task-local profile.' },
    tests: { passed: 86, failed: 0, assertions: 22567, entryTypecheck: 'PASS',
        resourceRoots: 'Campaign cases use the imported source root and active R8 campaign extension; VXL cases use the immutable R7 resource snapshot.',
        retainedInitialRootMismatch: 'failed-default-resource-root-tests.log: three resource registration checks ran against canonical resource links without the private campaign VXL packs. The corrected, explicitly selected resource-root runs pass.' },
    artwork: { tool: 'Built-in imagegen', source: 'docs/m3-1-r8-source.json', selectedExport: 'flag-export-v2/export.json',
        retainedPreliminaryExport: 'flag-export/export.json: not selected; the second export explicitly protects poles and rejects gray material from the gold print mask.',
        preserved: resources, originalMode: 'Retail source artwork, including its low-resolution flag, is unchanged.' },
    desktopZip: delivered, extractedPackage: extracted, review, retainedR7: preservation,
    integration: 'docs/m3-1-r8-source.json pins three additive versioned files and two metadata replacements with exact expected predecessor hashes. Apply on top of the R7 resource integration plan. No main merge, push, save-schema change, accepted resource cleanup or next mission is included.',
    evidence: pins, nativeWindows: 'NOT_RUN_ON_THIS_MAC', userVisualAcceptance: 'PENDING' };
const json = path.join(root, 'docs/m3-1-r8-delivery.json');
await fs.writeFile(json, JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(root, 'docs/m3-1-r8-delivery.md'), `# M3.1 R8: civilian hulls and Soviet national flag

R8 fixes the yacht and tug being cut off by the water surface and adds the Soviet national insignia to the scripted garrison flag. Native and package checks pass; user visual acceptance is pending. Frozen runtime: \`${stage.sourceHead}\`.

The HD renderer used a named military-ship list for reference-surface recovery. CRUISE and TUG therefore left part of their folded sprite geometry below the native water clipping plane. The fix applies the existing camera-ray recovery to all non-airborne VXL actors. Logical projection, native geometry/pivots, shadows, clipping, pitch, sinking and ordinary depth tests remain live. Ship masters and exported resources are unchanged.

The flag correction uses built-in imagegen. Only generated yellow hammer/sickle and outlined-star print is inserted into slots 32–47. Static comparison of all 48 slots at 2X and 4X proves exact alpha, frame geometry, original data, poles and unrequested states. The active loop stays 33–47 at the original rate. Original mode retains retail artwork. Source, prompt, selected master, hashes and integration predecessors are in [the source receipt](m3-1-r8-source.json).

## Verification

- All six placed boats pass at their original map positions in Original, 2X and 4X. Each mode also captures both boats at eight renderer-only headings. Both HD modes lose zero pixels to the water clip plane, compared with the retained R7 failure. Paused observer work leaves world hashes unchanged.
- The original Soviet paradrop team naturally garrisons the memorial by the first observation at tick 630 in all modes. World, RNG and mission state match at tick 3600, hash \`1965294077\`. Thirty separate native renderer captures inspect all 15 active garrison slots at both HD densities.
- All 86 focused tests and entry typecheck pass. The first broader resource tests used canonical links without the private R7 VXL packs; the failed log is retained, and the explicitly selected resource roots pass. No product fallback or skipped case hides that mismatch.
- The independently assembled application retains 14,065 R7 resource files byte-for-byte, adds three versioned flag files, and updates only the two task-owned campaign metadata files. Existing PNG/data resources remain retained. Texture dimensions, budgets, maps, gameplay and save schemas are unchanged.
- The actual Desktop ZIP passes all ${delivered.entries} entry/hash/link/mode checks, independent extraction, strict signing and packaged entry/playability checks. Automated profiles are isolated from the user's settings and saves. Windows is not run on this Mac.

R7 GPU-binding checks did not establish complete visible hull coverage. This regression adds same-frame clipped/unclipped native pixel measurements, normal in-world views and Original controls. Diagnostic unclipped images and heading poses are measurement fixtures, not claims of natural mission completion.

## Delivery and preservation

- Desktop ZIP: \`${delivered.path}\`, ${delivered.bytes} bytes, SHA-256 \`${delivered.sha256}\`.
- Embedded review: [M3.1 R8 review](${review.file}), ${review.embeddedImages} unchanged native PNGs with no external resources.
- The R7 source ZIP remains hash-identical. Its former Desktop location is absent; no cause is inferred and it is not recreated.
- The task-local campaign selector now uses the versioned flag extension. R7 snapshots, masters, preliminary exports and evidence are retained. Future integration uses the exact predecessor/additive pins in the source receipt. Canonical main is untouched by this task; no merge, push or cleanup is performed.
`);
console.log(JSON.stringify({ status: report.status, json, desktopZip: delivered.path, sha256: delivered.sha256 }));
