// Stage a self-contained local test folder without changing retained apps/resources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, sovietBatchRevisions } from '../../desktop/hd-profile.mjs';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = process.cwd(), build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const source = path.join(root, '.local'), name = process.argv[4] ?? 'RA2-HD-UI-M1.8-Mac-Test';
assert(/^[A-Za-z0-9.-]+$/.test(name), 'Use a plain package folder name');
await fs.mkdir(out, { recursive: false });
const folder = path.join(out, name); await fs.mkdir(folder);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => digest(await fs.readFile(file));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
for (const entry of identity.files) assert.equal(await sha(path.join(build, entry.file)), entry.sha256);
const app = path.join(folder, 'Red Alert 2 HD UI M1.8.app');
execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
// Electron treats its default executable name as a development runtime.
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD UI'));
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.ui.m18', CFBundleName: 'RA2 HD UI M1.8',
    CFBundleDisplayName: 'Red Alert 2 HD UI M1.8', CFBundleExecutable: 'RA2 HD UI',
    CFBundleShortVersionString: '0.1.8', CFBundleVersion: '18' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);

async function resourcePlan(directory) {
    const profile = await validateProfile(directory), hd = await registerHdResources(directory);
    assert.equal(Object.keys(hd.availability).length, 21);
    assert(Object.values(hd.availability).every(value => value.startsWith('HD available')));
    const ui = hd.selections.get('/local-ui/selection.json');
    assert.equal(ui?.revision, 'remaining-ui-v4'); assert.equal(ui.assets.length, 430);
    const files = new Set([...profile.routes.values(), ...hd.routes.values()].map(file => path.relative(directory, file)));
    for (const file of ['ra2-core-manifest.json', 'upstream-support/manifest.json', 'ui-selection.json',
        `ui-packs/${ui.revision}/manifest.json`, 'hd-packs/power-plant-authored/1/family.json',
        'hd-packs/soviet-power-plant-authored/2/family.json', ...Object.entries(sovietBatchRevisions)
            .map(([name, revision]) => `hd-packs/soviet-${name}-authored/${revision}/family.json`)]) files.add(file);
    return { files: [...files].sort(), availability: hd.availability, uiRevision: ui.revision };
}
const plan = await resourcePlan(source), resources = path.join(folder, 'RA2-HD-UI-Resources');
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
await fs.cp(path.join(root, '.artifacts/menu-ui/delivery-v1'), path.join(folder, 'Review'), { recursive: true });
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Red Alert 2 HD UI M1.8 — macOS Apple Silicon test

Open Red Alert 2 HD UI M1.8.app. Keep RA2-HD-UI-Resources beside the app.
First launch discovers that resource folder automatically; if prompted, select it.
The app uses its own RA2 HD UI M1.8 profile. Existing apps and profiles are preserved.
HD is enabled by default. The accepted UI revision is remaining-ui-v4.
Review/review.html contains the complete accepted artwork and validation summary.

Please check native display size, fullscreen/resize, menu focus and cursor behavior,
loading screens, radar transitions, sidebar icons, queues, HD Off/On and return/restart.
The six menu entries retain the existing disabled Campaign, LAN and Movies behavior.
Yuri UI is prepared but Yuri gameplay is not enabled. Windows is not included.
This is a local development test app, ad-hoc signed and not notarized.
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
    sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }), build,
    uiRevision: plan.uiRevision, uiManifestSha256: await sha(path.join(resources, 'ui-packs/remaining-ui-v4/manifest.json')),
    resourceFiles: plan.files.length, availability: plan.availability, files: entries };
await fs.writeFile(path.join(out, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ folder, app, resources, entries: entries.length, resourceFiles: plan.files.length }));
