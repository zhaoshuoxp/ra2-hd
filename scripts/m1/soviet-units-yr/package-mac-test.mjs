// Stage a self-contained local test folder without changing retained apps/resources.
import fs from 'node:fs/promises';
import buildingCoverage from '../../../desktop/soviet-building-coverage.json' with { type: 'json' };
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateProfile } from '../../../desktop/profile.mjs';
import { registerHdResources, sovietBatchRevisions, sovietUnitIdentities } from '../../../desktop/hd-profile.mjs';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = process.cwd(), build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const source = path.join(root, '.local'), name = process.argv[4] ?? 'RA2-HD-YR-Soviet-Units-R1-Mac-Test';
assert(/^[A-Za-z0-9.-]+$/.test(name), 'Use a plain package folder name');
await fs.mkdir(out, { recursive: false });
const folder = path.join(out, name); await fs.mkdir(folder);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => digest(await fs.readFile(file));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
assert.equal(JSON.parse(await fs.readFile(path.join(build, 'package.json'), 'utf8')).reviewMilestone, 'M1.7-YR-R1');
for (const entry of identity.files) assert.equal(await sha(path.join(build, entry.file)), entry.sha256);
const app = path.join(folder, 'RA2 HD YR Soviet Units R1.app');
execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
// Electron treats its default executable name as a development runtime.
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.yr.soviet.units.r1', CFBundleName: 'RA2 HD YR Soviet Units R1',
    CFBundleDisplayName: 'RA2 HD YR Soviet Units R1', CFBundleExecutable: 'RA2 HD Editions',
    CFBundleShortVersionString: '0.2.5', CFBundleVersion: '25' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);

async function resourcePlan(directory) {
    const profile = await validateProfile(directory), hd = await registerHdResources(directory);
    assert.equal(profile.selections.get('/local-assets/yr/manifest.json')?.files.length, 7);
    assert.equal(Object.keys(hd.availability).length, 50 + Object.keys(buildingCoverage).length);
    assert(hd.availability.sovietUnits.startsWith('22 of 24'));
    assert(hd.availability.sovietUnits.includes('4 of 4 YR additions'));
    for (const [name, value] of Object.entries(hd.availability)) {
        if (name === 'sovietUnits') continue;
        assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), name);
    }
    const ui = hd.selections.get('/local-ui/selection.json');
    assert.equal(ui?.revision, 'remaining-ui-v4'); assert.equal(ui.assets.length, 430);
    const files = new Set([...profile.routes.values(), ...hd.routes.values()].map(file => path.relative(directory, file)));
    for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json', 'ui-selection.json',
        `ui-packs/${ui.revision}/manifest.json`, 'hd-packs/power-plant-authored/1/family.json',
        'hd-packs/soviet-power-plant-authored/2/family.json', ...Object.entries(sovietBatchRevisions)
            .map(([name, revision]) => `hd-packs/soviet-${name}-authored/${revision}/family.json`)]) files.add(file);
    for (const entry of Object.values(buildingCoverage)) files.add(entry.familyPath);
    for (const entry of Object.values(sovietUnitIdentities)) files.add(entry.familyPath);
    const unitInventory = JSON.parse(await fs.readFile(path.join(root, 'docs/m1-7-accepted-resources.json'), 'utf8'));
    for (const entry of unitInventory.files) {
        assert.equal(await sha(path.join(directory, entry.path)), entry.sha256, entry.path);
        files.add(entry.path);
    }
    return { files: [...files].sort(), availability: hd.availability, uiRevision: ui.revision };
}
const plan = await resourcePlan(source), resources = path.join(folder, 'RA2-HD-Editions-Resources');
await fs.mkdir(resources);
for (const relative of plan.files) {
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const original = path.join(source, relative), destination = path.join(resources, relative);
    assert.equal(await fs.realpath(original), original);
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.copyFile(original, destination);
    assert.equal(await sha(destination), await sha(original));
}
const core = JSON.parse(await fs.readFile(path.join(source, 'ra2-core-manifest.json'), 'utf8'));
await fs.writeFile(path.join(resources, 'ra2-core-manifest.json'), JSON.stringify({ schemaVersion: 1,
    files: core.files.map(row => Object.fromEntries(['virtualName', 'bytes', 'sha256', 'validation'].map(k => [k, row[k]]))) }, null, 2) + '\n');
const support = JSON.parse(await fs.readFile(path.join(source, 'upstream-support/manifest.json'), 'utf8'));
await fs.writeFile(path.join(resources, 'upstream-support/manifest.json'), JSON.stringify(support
    .filter(row => ['general.csf', 'ra2cd.mix'].includes(path.basename(row.original)))
    .map(row => Object.fromEntries(['original', 'commit', 'sha256', 'bytes'].map(k => [k, row[k]]))), null, 2) + '\n');
assert.deepEqual(await resourcePlan(resources), plan);
const reviewDocs = { 'm1-7-yr-soviet-extension.md': 'YR-UNIT-VALIDATION.md',
    'm1-7-yr-coverage.json': 'YR-UNIT-COVERAGE.json', 'm1-7-yr-resources.json': 'YR-UNIT-RESOURCES.json',
    'game-editions-lighting-score.md': 'LIGHTING-SCORE-VALIDATION.md', 'game-editions-combat-r5.md': 'VALIDATION.md',
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
await fs.copyFile(path.resolve('.artifacts/m1-7-yr/YR-Soviet-Units-Full-Review-v1.html'), path.join(folder, 'YR-Soviet-Units-Full-Review.html'));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `RA2 HD YR Soviet Units R1 - macOS Apple Silicon review

Open RA2 HD YR Soviet Units R1.app. Keep RA2-HD-Editions-Resources beside it.
This package uses its own profile and retains both editions and accepted buildings/units.
Choose Yuri's Revenge to review Boris, Siege Chopper, Chrono Commando and Psi Commando.
Boris includes his strike aircraft. Siege Chopper includes flight, rotors, deployment and artillery.
Chrono Commando requires stolen Allied technology; Psi Commando requires stolen Yuri technology.
Open YR-Soviet-Units-Full-Review.html directly for embedded native-size playback and recorded actions.
No local web service or developer checkout is needed. Move the entire folder together.

Complete-family visual/gameplay acceptance remains pending. SQD/SQDG intentionally use Original.
Theater reuse, including snow, requires an exact source match.
See YR-UNIT-VALIDATION.md and YR-UNIT-COVERAGE.json for measured evidence and limitations.
Windows, campaign and natural-match completion are not claimed. This is a local ad-hoc signed app.
Continue feedback and acceptance in the same task.
`);
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
    runtimeSourceHead: identity.head,
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), build,
    uiRevision: plan.uiRevision, uiManifestSha256: await sha(path.join(resources, 'ui-packs/remaining-ui-v4/manifest.json')),
    resourceFiles: plan.files.length, availability: plan.availability, files: entries };
await fs.writeFile(path.join(out, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ folder, app, resources, entries: entries.length, resourceFiles: plan.files.length }));
