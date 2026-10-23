// Stage a self-contained local test folder without changing retained apps/resources.
import fs from 'node:fs/promises';
import buildingCoverage from '../../desktop/soviet-building-coverage.json' with { type: 'json' };
import alliedCoverage from '../../desktop/allied-building-coverage.json' with { type: 'json' };
import yuriCoverage from '../../desktop/yuri-building-coverage.json' with { type: 'json' };
import yuriUnits from '../../desktop/yuri-unit-contracts.json' with { type: 'json' };
import preparedContract from '../../desktop/prepared-hd-contract.json' with { type: 'json' };
import environmentContract from '../../desktop/environment-hd-contract.json' with { type: 'json' };
import terrainContract from '../../desktop/terrain-hd-contract.json' with { type: 'json' };
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys, sovietBatchRevisions, unitIdentities, powerPlantFamilyPaths } from '../../desktop/hd-profile.mjs';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = process.cwd(), build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const source = path.join(root, '.local'), name = process.argv[4] ?? 'RA2-HD-Dual-Edition-R5-Mac-Test';
assert(/^[A-Za-z0-9.-]+$/.test(name), 'Use a plain package folder name');
await fs.mkdir(out, { recursive: false });
const folder = path.join(out, name); await fs.mkdir(folder);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => digest(await fs.readFile(file));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
const milestone = JSON.parse(await fs.readFile(path.join(build, 'package.json'), 'utf8')).reviewMilestone;
assert(['DUAL-EDITION-R5', 'OFFLINE-TRAINER-R1', 'M2.1-TEMPERATE', 'M2.2-TEMPERATE', 'M2.3-TEMPERATE', 'M2.4-SKIRMISH'].includes(milestone));
const trainerReview = milestone === 'OFFLINE-TRAINER-R1';
const environmentReview = milestone.startsWith('M2.');
const showcaseReview = milestone === 'M2.2-TEMPERATE';
const coverageReview = milestone === 'M2.3-TEMPERATE';
const unifiedReview = milestone === 'M2.4-SKIRMISH';
const profileDirectory = unifiedReview ? 'M2.4-Review-Profile' : coverageReview ? 'M2.3-Review-Profile'
    : environmentReview ? (showcaseReview ? 'M2.2-Review-Profile' : 'M2.1-Review-Profile')
    : trainerReview ? 'Trainer-Review-Profile' : 'Review-Profile';
assert(!process.argv.includes('--link-resources'), 'Packages require independent resource copies');
const requirePrepared = process.argv.includes('--require-prepared');
const appTitle = process.argv.find(arg => arg.startsWith('--app-title='))?.slice(12)
    ?? (trainerReview ? 'Red Alert 2 HD Offline Trainer R1' : 'Red Alert 2 HD Dual Edition R5');
assert(/^[A-Za-z0-9 .-]+$/.test(appTitle));
for (const entry of identity.files) assert.equal(await sha(path.join(build, entry.file)), entry.sha256);
const app = path.join(folder, appTitle + '.app');
execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
// Electron treats its default executable name as a development runtime.
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
// Both direct app launch and the launcher resolve only this copied delivery.
const wrapper = `import path from 'node:path';
import { fileURLToPath } from 'node:url';
${coverageReview || unifiedReview ? "import fs from 'node:fs/promises';" : ''}
const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
process.env.RA2_UI_RESOURCE_ROOT ??= path.join(folder, 'RA2-HD-UI-Resources');
${coverageReview || unifiedReview ? "const suppliedProfile = process.env.RA2_DESKTOP_USER_DATA;" : ''}
process.env.RA2_DESKTOP_USER_DATA ??= path.join(folder, '${profileDirectory}');
${coverageReview || unifiedReview ? `process.env.RA2_DESKTOP_NO_DISCOVERY ??= '1';
if (!suppliedProfile) {
    const profile = process.env.RA2_DESKTOP_USER_DATA;
    await fs.mkdir(profile, { recursive: true });
    const file = path.join(profile, 'resource-registration.json');
    await fs.writeFile(file + '.tmp', JSON.stringify({ schemaVersion: 1,
        directory: path.join(folder, 'RA2-HD-Editions-Resources') }) + '\\n');
    await fs.rename(file + '.tmp', file);
}` : ''}
await import('./main.mjs');
`;
await fs.writeFile(path.join(payload, 'desktop/packaged-review-main.mjs'), wrapper);
const metadata = JSON.parse(await fs.readFile(path.join(payload, 'package.json')));
metadata.main = 'desktop/packaged-review-main.mjs';
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify(metadata) + '\n');
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({
    CFBundleIdentifier: unifiedReview ? 'local.ra2hd.skirmish.m2-4' : coverageReview ? 'local.ra2hd.environment.m2-3'
        : environmentReview ? (showcaseReview ? 'local.ra2hd.environment.m2-2' : 'local.ra2hd.environment.m2-1')
        : trainerReview ? 'local.ra2hd.trainer.r1' : 'local.ra2hd.editions.r5',
    CFBundleName: environmentReview ? appTitle : trainerReview ? 'RA2 HD Offline Trainer R1' : 'RA2 HD Dual Edition R5',
    CFBundleDisplayName: appTitle, CFBundleExecutable: 'RA2 HD Editions',
    CFBundleShortVersionString: unifiedReview ? '0.2' : '0.2.4',
    CFBundleVersion: '24' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);

async function resourcePlan(directory, uiDirectory = directory) {
    const previousUiRoot = process.env.RA2_UI_RESOURCE_ROOT;
    process.env.RA2_UI_RESOURCE_ROOT = uiDirectory;
    let hd;
    const events = [];
    try { hd = await registerHdResources(directory, event => events.push(event)); }
    finally {
        if (previousUiRoot === undefined) delete process.env.RA2_UI_RESOURCE_ROOT;
        else process.env.RA2_UI_RESOURCE_ROOT = previousUiRoot;
    }
    const profile = await validateProfile(directory);
    assert.equal(profile.selections.get('/local-assets/yr/manifest.json')?.files.length, 7);
    assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
    assert(hd.availability.sovietUnits.startsWith('22 of 24'));
    assert(hd.availability.sovietUnits.includes('5 of 5 YR additions'));
    for (const [name, value] of Object.entries(hd.availability)) {
        if (name === 'sovietUnits') continue;
        assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), name);
    }
    const ui = hd.selections.get('/local-ui/selection.json');
    assert(ui?.revision && !ui.reviewOnly && ui.assets.length <= 512);
    const files = new Set([...profile.routes.values(), ...[...hd.routes]
        .filter(([route]) => !route.startsWith('/local-ui/')).map(([, file]) => file)]
        .map(file => path.relative(directory, file)));
    const uiFiles = new Set([...hd.routes].filter(([route]) => route.startsWith('/local-ui/'))
        .map(([, file]) => path.relative(uiDirectory, file)));
    const terrain = hd.selections.get('/local-terrain/selection.json');
    if (terrain) {
        files.add('terrain-selection.json');
        files.add(`terrain-packs/${terrain.revision}/manifest.json`);
    }
    const environment = hd.selections.get('/local-environment/selection.json');
    if (environment) {
        const pointer = JSON.parse(await fs.readFile(path.join(directory, 'environment-selection.json'), 'utf8'));
        files.add('environment-selection.json');
        files.add(`environment-packs/${pointer.revision}/manifest.json`);
    }
    for (const [route, selected] of hd.selections) {
        const match = /^\/local-(terrain|environment)\/(snow|urban|newurban|desert)\/selection\.json$/.exec(route);
        if (!match) continue;
        const [, kind, theater] = match;
        const pointerFile = `${kind}-${theater}-selection.json`;
        const pointer = JSON.parse(await fs.readFile(path.join(directory, pointerFile), 'utf8'));
        assert.equal(pointer.revision, selected.revision);
        files.add(pointerFile);
        files.add(`${kind}-packs/${pointer.revision}/manifest.json`);
    }
    if (coverageReview) {
        assert.equal(terrain?.revision, terrainContract.revision, 'The copied coverage pack must retain selected terrain');
        assert(terrain.groups.length > 8 && terrain.groups.length <= 64, 'Bounded reusable terrain groups');
        assert.equal(environment?.revision, environmentContract.selectedPack.revision);
        assert.deepEqual(Object.keys(environment.families).sort(), Object.keys(environmentContract.families).sort(),
            'The final copied coverage app requires every declared complete environment family');
    }
    if (showcaseReview) {
        assert.equal(terrain?.groups.length, 8, 'The copied showcase must retain all selected terrain groups');
        assert.equal(Object.keys(environment?.families ?? {}).length, 98,
            'The copied showcase must retain its complete environment catalog');
    }
    uiFiles.add('ui-selection.json'); uiFiles.add(`ui-packs/${ui.revision}/manifest.json`);
    const prepared = events.find(event => event.type === 'prepared-hd-registered');
    if (requirePrepared) assert(prepared, 'The selected prepared layer must be complete in this package');
    if (prepared) {
        files.add(preparedContract.indexPath ?? 'prepared-hd/index.json');
        files.add(`prepared-hd/proofs/${preparedContract.sha256}.json`);
    }
    for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json',
        ...Object.values(powerPlantFamilyPaths), ...Object.entries(sovietBatchRevisions)
            .map(([name, revision]) => `hd-packs/soviet-${name}-authored/${revision}/family.json`)]) files.add(file);
    for (const entry of [...Object.values(buildingCoverage), ...Object.values(alliedCoverage), ...Object.values(yuriCoverage)]) {
        files.add(entry.familyPath);
        // URI hashes may share turret pixels across theater selections. Keep
        // every family-relative dependency in an independently copied package.
        const family = JSON.parse(await fs.readFile(path.join(directory, entry.familyPath), 'utf8'));
        for (const binding of Object.values(family.turrets ?? {})) {
            files.add(binding.path + 'manifest.json');
            const manifest = JSON.parse(await fs.readFile(path.join(directory, binding.path, 'manifest.json'), 'utf8'));
            for (const frame of manifest.headings) for (const role of ['base', 'mask']) files.add(binding.path + frame[role]);
        }
    }
    for (const entry of [...Object.values(unitIdentities), ...Object.values(yuriUnits.shp)]) files.add(entry.familyPath);
    // Current registration validates and includes the selected unit revisions.
    // Historical acceptance inventories can reference superseded owner exports.
    return { files: [...files].sort(), uiFiles: [...uiFiles].sort(), availability: hd.availability,
        uiRevision: ui.revision, uiAssets: ui.assets.length, prepared: prepared ?? null };
}
const plan = await resourcePlan(source), resources = path.join(folder, 'RA2-HD-Editions-Resources');
await fs.mkdir(resources);
const uiRoot = path.join(folder, 'RA2-HD-UI-Resources');
await fs.mkdir(uiRoot);
for (const [sourceRoot, destinationRoot, files] of [[source, resources, plan.files], [source, uiRoot, plan.uiFiles]])
for (const relative of files) {
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const original = path.join(sourceRoot, relative), destination = path.join(destinationRoot, relative);
    assert.equal(await fs.realpath(original), original);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(original, destination, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
    assert.equal(await sha(destination), await sha(original));
    assert.notEqual((await fs.stat(destination)).ino, (await fs.stat(original)).ino);
}
const core = JSON.parse(await fs.readFile(path.join(source, 'ra2-core-manifest.json'), 'utf8'));
await fs.writeFile(path.join(resources, 'ra2-core-manifest.json'), JSON.stringify({ schemaVersion: 1,
    files: core.files.map(row => Object.fromEntries(['virtualName', 'bytes', 'sha256', 'validation'].map(k => [k, row[k]]))) }, null, 2) + '\n');
const support = JSON.parse(await fs.readFile(path.join(source, 'upstream-support/manifest.json'), 'utf8'));
await fs.writeFile(path.join(resources, 'upstream-support/manifest.json'), JSON.stringify(support
    .filter(row => ['general.csf', 'ra2cd.mix'].includes(path.basename(row.original)))
    .map(row => Object.fromEntries(['original', 'commit', 'sha256', 'bytes'].map(k => [k, row[k]]))), null, 2) + '\n');
assert.deepEqual(await resourcePlan(resources, uiRoot), plan);
const reviewDocs = { 'game-editions-lighting-score.md': 'VALIDATION.md',
    'm1-7-yr-final-acceptance.json': 'YR-UNIT-ACCEPTANCE.json',
    'm1-7-yr-coverage.json': 'YR-UNIT-COVERAGE.json',
    'm1-7-yr-resources.json': 'YR-UNIT-RESOURCES.json',
    'game-editions-snow-unit-hd.md': 'SNOW-UNIT-VALIDATION.md',
    'game-editions-combat-r5.md': 'R5-COMBAT-VALIDATION.md',
    'game-editions-loading-r4.md': 'R4-VALIDATION.md',
    'game-editions-feedback-r3.md': 'R3-VALIDATION.md',
    'game-editions-fidelity.md': 'FIDELITY.md', 'game-editions-runtime.md': 'R1-VALIDATION.md',
    'm1-6c-final-handoff.md': 'BUILDING-HD-ACCEPTED.md',
    'm1-6c-final-acceptance.json': 'BUILDING-ACCEPTANCE.json',
    'm1-6c-added-resources.json': 'BUILDING-RESOURCES.json',
    'm1-6c-coverage-matrix.csv': 'BUILDING-COVERAGE.csv' };
for (const [sourceName, targetName] of Object.entries(reviewDocs)) {
    let contents = await fs.readFile(path.join(root, 'docs', sourceName), 'utf8');
    for (const [oldName, newName] of Object.entries(reviewDocs)) contents = contents.replaceAll(oldName, newName);
    await fs.writeFile(path.join(folder, targetName), contents);
}
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Red Alert 2 HD — RA2 / Yuri's Revenge — macOS Apple Silicon review

Open Red Alert 2 HD Dual Edition R5.app. Keep RA2-HD-Editions-Resources beside it.
Choose either cover on startup. Use Switch Game from the main menu to return.
This app has an independent RA2 HD Dual Edition R5 profile. Existing profiles are preserved.
HD is enabled by default and the accepted artwork is retained.

Both editions support skirmish. Campaign, LAN and Movies remain unavailable.
The AI uses this engine's strategy planner with edition-specific units and rules;
it is not a replay of the original aimd.ini team scripts.
See VALIDATION.md for exact tested cases and remaining fidelity/acceptance limits.
Please check ore-area lamp lighting (including Bering Strait) and the score duration after quitting from the pause menu.
The accepted snow-unit correction and building/Gatling combat fixes are retained.
Loading backgrounds retain the R4 correction.
Also test Soviet YR skirmishes beyond the previous failure point, including
veteran units and area guard, and the integrated M1.7 unit artwork in both editions.
SQD and YURIPR keep their accepted Original exceptions. Known differences are in FIDELITY.md.
BUILDING-HD-ACCEPTED.md records accepted Soviet coverage: 18 buildings per edition, 20 total.
Industrial Plant, Battle Bunker and all 162 edition/theater cells are covered in HD.
Lunar uses controlled native loader/GPU validation, not an ordinary lunar skirmish.

Local development review app; ad-hoc signed, not notarized. Windows is not included.
`);
if (trainerReview) await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Open Red Alert 2 HD Offline Trainer R1.app. Keep RA2-HD-Editions-Resources beside it.
The isolated profile is Trainer-Review-Profile in this folder.
Options > Offline trainer enables the toolbar. The default is OFF separately in each edition.
Only offline skirmish is supported. Trainer-modified games do not save replays.
See the offline trainer review report for tested scope and manual checks.
`);
if (!trainerReview) await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Open Launch-Isolated-Review.command or ${appTitle}.app.
Keep RA2-HD-Editions-Resources and RA2-HD-UI-Resources beside the app.
The app discovers its copied resources and creates a private ${profileDirectory}.
Accepted Allied/E artwork and current C selections are preserved.
C, D, shared cameo and Lunar Infantry artwork are user accepted in their source deliveries.
Combined delivery checks and acceptance are recorded separately in the integration report.
Original / 2X / 4X and intentional Original exceptions remain available.
UI selection: ${plan.uiRevision}; entries: ${plan.uiAssets}.
Prepared world layer: ${plan.prepared ? preparedContract.sha256 : 'unavailable; validated PNG fallback'}.
This is a local ad-hoc signed macOS arm64 review, not a notarized release.
Windows and exhaustive campaign/display/input behavior are unverified.
`);
if (showcaseReview) await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Open ${appTitle}.app or Launch-Isolated-Review.command.
Keep RA2-HD-Editions-Resources and RA2-HD-UI-Resources beside the app.
The private ${profileDirectory} preserves every existing game profile.
Choose Yuri's Revenge and XMP03T4.map; the RA2 counterpart is MP03T4.map.
Original, 2X and 4X use the unchanged native camera, map and rules.
The combined offline review and acceptance receipt describe the selected technical checks.
Whole-map user visual acceptance and local main promotion remain pending.
Windows performance and physical input are deferred.
`);
const launcher = path.join(folder, 'Launch-Isolated-Review.command');
await fs.writeFile(launcher, `#!/bin/bash
set -euo pipefail
review_folder="$(cd -- "$(dirname -- "$0")" && pwd)"
exec "$review_folder/${appTitle}.app/Contents/MacOS/RA2 HD Editions" "$@"
`, { mode: 0o755 });
execFileSync('/bin/bash', ['-n', launcher]);
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
// Inventory below also binds the ad-hoc signed bundle and every copied resource.
const entries = [];
async function collect(directory, prefix = '') {
    for (const entry of (await fs.readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
        const file = path.posix.join(prefix, entry.name), absolute = path.join(directory, file);
        if (entry.isDirectory()) await collect(directory, file);
        else if (entry.isSymbolicLink()) entries.push({ file, link: await fs.readlink(absolute) });
        else entries.push({ file, bytes: (await fs.stat(absolute)).size, sha256: await sha(absolute) });
    }
}
await collect(folder);
const receipt = { status: 'PACKAGED_RUNTIME_PENDING', folder, app, resources, target: 'darwin-arm64',
    uiRoot, executable: 'RA2 HD Editions', launcher, profile: path.join(folder, profileDirectory),
    resourceStorage: 'independent copies', preparedContract, preparedRegistration: plan.prepared,
    runtimeSourceHead: identity.head,
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), build,
    uiRevision: plan.uiRevision, uiEntries: plan.uiAssets,
    uiManifestSha256: await sha(path.join(uiRoot, `ui-packs/${plan.uiRevision}/manifest.json`)),
    resourceFiles: plan.files.length, uiResourceFiles: plan.uiFiles.length, availability: plan.availability, files: entries };
await fs.writeFile(path.join(out, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ folder, app, resources, entries: entries.length, resourceFiles: plan.files.length }));
