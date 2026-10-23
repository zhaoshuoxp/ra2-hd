// Package the integrated main once, with independent copied world/UI resource roots.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../../desktop/profile.mjs';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
import yuriCoverage from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };

const root = process.cwd(), output = path.resolve('.artifacts/yuri-cameos-main-integration-v1');
const build = path.join(output, 'build'), folder = path.join(output, 'delivery', 'RA2-HD-Main-C-E-Review-R1');
assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = async file => sha(await fs.readFile(file));
const packagingHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const resume = process.argv.includes('--resume');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), '');
assert.equal(process.env.RA2_UI_RESOURCE_ROOT, undefined);
if (!resume) execFileSync(process.execPath, ['scripts/ui/build-review.mjs', build], { stdio: 'inherit' });
const wrapper = `import path from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.resolve(appRoot, '../../../..');
process.env.RA2_UI_RESOURCE_ROOT ??= path.join(folder, 'RA2-HD-Main-E-UI-Resources');
process.env.RA2_DESKTOP_USER_DATA ??= path.join(folder, 'Review-Profile');
await import('./main.mjs');
`;
const metadata = JSON.parse(await fs.readFile(path.join(build, 'package.json'), 'utf8'));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
const sourceHead = resume ? identity.sourceHead : packagingHead;
if (!resume) {
    await fs.writeFile(path.join(build, 'desktop/main-integration-review.mjs'), wrapper);
    Object.assign(metadata, { main: 'desktop/main-integration-review.mjs', reviewMilestone: 'DUAL-EDITION-R5',
        version: '0.2.6', taskReview: 'MAIN-C-E-R1' });
    await fs.writeFile(path.join(build, 'package.json'), JSON.stringify(metadata));
    identity.files.push({ file: 'desktop/main-integration-review.mjs', sha256: sha(Buffer.from(wrapper)) });
    identity.files.find(row => row.file === 'package.json').sha256 = sha(Buffer.from(JSON.stringify(metadata)));
    Object.assign(identity, { sourceHead, artStatus: 'E_ACCEPTED_C_FINAL_VISUAL_PENDING',
        excludedBranches: ['task/d-yuri-units-hd', 'fix/allied-animation-sidebar', 'fix/skirmish-loading-isolated'] });
    await fs.writeFile(path.join(build, 'identity.json'), JSON.stringify(identity, null, 2) + '\n');
}

const app = path.join(folder, 'Red Alert 2 HD Main C E Review R1.app');
if (!resume) {
    await fs.mkdir(path.dirname(folder), { recursive: true }); await fs.mkdir(folder);
    execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
    await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
    const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
    for (const name of ['dist', 'desktop', 'package.json'])
        await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
    for (const [source, name] of [[path.join(root, 'LICENSE'), 'LICENSE'],
        [path.join(root, 'node_modules/electron/LICENSE'), 'ELECTRON-LICENSE']])
        await fs.copyFile(source, path.join(payload, name));
    for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.main.ce.r1',
        CFBundleName: 'RA2 HD Main C E Review R1', CFBundleDisplayName: 'Red Alert 2 HD Main C E Review R1',
        CFBundleExecutable: 'RA2 HD Editions', CFBundleShortVersionString: '0.2.6', CFBundleVersion: '26' }))
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path.join(app, 'Contents/Info.plist')]);
}
for (const row of identity.files)
    assert.equal(await hash(path.join(app, 'Contents/Resources/app', row.file)), row.sha256, row.file);

const source = await fs.realpath(path.join(root, '.local'));
const profile = await validateProfile(source), hd = await registerHdResources(source);
const ui = hd.selections.get('/local-ui/selection.json'); assert.equal(ui.revision, 'yuri-cameos-e-main-v1');
const resources = path.join(folder, 'RA2-HD-Editions-Resources');
const uiRoot = path.join(folder, 'RA2-HD-Main-E-UI-Resources');
const selected = new Set([...profile.routes.values(), ...[...hd.routes].filter(([route]) => !route.startsWith('/local-ui/')).map(([, file]) => file)]
    .map(file => path.relative(source, file)));
async function descriptors(prefix = 'hd-packs') {
    for (const entry of await fs.readdir(path.join(source, prefix), { withFileTypes: true })) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) await descriptors(relative);
        else if (entry.isFile() && entry.name.endsWith('.json')) selected.add(relative);
    }
}
await descriptors();
// Immutable hashes may share routes; each selected family still needs its own complete paths.
async function familyFiles(prefix) {
    for (const entry of await fs.readdir(path.join(source, prefix), { withFileTypes: true })) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) await familyFiles(relative);
        else if (entry.isFile()) selected.add(relative);
    }
}
for (const entry of Object.values(yuriCoverage)) {
    await familyFiles(path.dirname(entry.familyPath));
    const family = JSON.parse(await fs.readFile(path.join(source, entry.familyPath), 'utf8'));
    for (const member of family.members) await familyFiles(`hd-packs/${member.packId}/${member.revision}`);
}
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json']) selected.add(name);
if (!resume) await fs.mkdir(resources);
for (const relative of selected) {
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const incoming = path.join(source, relative), destination = path.join(resources, relative);
    assert.equal(await fs.realpath(incoming), incoming);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    if (resume && await fs.stat(destination).catch(() => null)) {
        if (['ra2-core-manifest.json', 'yr-core-manifest.json'].includes(relative)) continue;
    } else await fs.copyFile(incoming, destination, fs.constants.COPYFILE_EXCL);
    assert.equal(await hash(destination), await hash(incoming), relative);
}
// Native input directories are not needed for the copied package.
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json']) {
    const file = path.join(resources, name), data = JSON.parse(await fs.readFile(file, 'utf8'));
    data.files = data.files.map(row => Object.fromEntries(['virtualName', 'bytes', 'sha256', 'validation'].map(k => [k, row[k]])));
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}
if (!resume) {
    await fs.mkdir(uiRoot);
    await fs.cp(path.join(source, 'ui-packs', ui.revision), path.join(uiRoot, 'ui-packs', ui.revision), { recursive: true });
    await fs.copyFile(path.join(source, 'ui-selection.json'), path.join(uiRoot, 'ui-selection.json'));
}
assert.equal(await hash(path.join(source, 'ui-selection.json')), await hash(path.join(uiRoot, 'ui-selection.json')));
process.env.RA2_UI_RESOURCE_ROOT = uiRoot;
const copiedHd = await registerHdResources(resources), copiedProfile = await validateProfile(resources);
assert.deepEqual(copiedHd.availability, hd.availability);
assert.deepEqual([...copiedHd.selections], [...hd.selections]);
assert.deepEqual([...copiedHd.routes.keys()].sort(), [...hd.routes.keys()].sort());
assert.deepEqual(copiedProfile.manifest, profile.manifest);
delete process.env.RA2_UI_RESOURCE_ROOT;
const launch = `#!/bin/bash\nset -euo pipefail\nreview_dir="$(cd "$(dirname "$0")" && pwd)"\nmkdir -p "$review_dir/Review-Profile"\nexec "$review_dir/Red Alert 2 HD Main C E Review R1.app/Contents/MacOS/RA2 HD Editions"\n`;
await fs.writeFile(path.join(folder, 'Launch-Isolated-Review.command'), launch, { mode: 0o755 });
await fs.writeFile(path.join(folder, 'START-HERE.txt'), 'Launch Launch-Isolated-Review.command or the app. Keep both resource folders beside the app. This package has its own Review-Profile. E artwork is accepted; C final visual acceptance is still pending. D, sidebar flashing corrections and loading optimization are excluded. No existing application or profile is replaced.\n');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const receipt = { status: 'PASS_INDEPENDENT_MAIN_C_E_PACKAGE_REGISTRATION', sourceHead, packagingHead, build, folder, app,
    executable: 'RA2 HD Editions', resources, uiRoot, uiRevision: ui.revision,
    uiManifestSha256: await hash(path.join(uiRoot, 'ui-packs', ui.revision, 'manifest.json')),
    nativeWorldResourceFiles: selected.size, routes: hd.routes.size, signature: 'PASS_DEEP_STRICT',
    profile: path.join(folder, 'Review-Profile'), launcher: path.join(folder, 'Launch-Isolated-Review.command'),
    cFinalVisualAcceptance: 'PENDING', eVisualAcceptance: 'USER_ACCEPTED', builds: 1 };
await fs.writeFile(path.join(output, 'package.json'), JSON.stringify(receipt, null, 2) + '\n');
await fs.writeFile(path.join(output, 'package-e-runtime.json'), JSON.stringify({ ...receipt, resources: uiRoot }, null, 2) + '\n');
console.log(JSON.stringify(receipt));
