// Copy a verified independent app/resource pair; retain every earlier delivery.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateProfile } from '../../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys } from '../../../desktop/hd-profile.mjs';
import catalog from '../../../desktop/yuri-unit-contracts.json' with { type: 'json' };

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = process.cwd(), build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const revision = process.argv[4] ?? 'R1';
assert(/^R[1-9]\d*$/.test(revision), 'Review revision must be R followed by a positive integer');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => digest(await fs.readFile(file));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
assert.equal(JSON.parse(await fs.readFile(path.join(build, 'package.json'), 'utf8')).reviewMilestone, 'YURI-UNITS-D-R1');
for (const entry of identity.files) assert.equal(await sha(path.join(build, entry.file)), entry.sha256);
await fs.mkdir(out, { recursive: false });
const folder = path.join(out, `RA2-HD-Yuri-Units-D-${revision}`); await fs.mkdir(folder);
const app = path.join(folder, `RA2 HD Yuri Units D ${revision}.app`);
execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: `local.ra2hd.yuri.units.d.${revision.toLowerCase()}`,
    CFBundleName: `RA2 HD Yuri Units D ${revision}`, CFBundleDisplayName: `RA2 HD Yuri Units D ${revision}`,
    CFBundleExecutable: 'RA2 HD Editions', CFBundleShortVersionString: '0.3.0', CFBundleVersion: '30' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);

const source = path.join(root, '.local'), resources = path.join(folder, 'RA2-HD-Editions-Resources');
const baseline = JSON.parse(await fs.readFile('.artifacts/yuri-units/baseline-resources.json', 'utf8'));
const installedReceipt = process.argv.find(arg => arg.startsWith('--installed-receipt='))?.split('=')[1]
    ?? '.artifacts/yuri-units/installed-resources-v1.json';
const installed = JSON.parse(await fs.readFile(installedReceipt, 'utf8'));
const planned = new Map(baseline.copied.map(f => [f.relativeDestination.replace(/^\.local\//, ''), f.sha256]));
for (const entry of installed.files) planned.set(entry.path, entry.sha256);
const sourceProfile = await validateProfile(source);
for (const file of sourceProfile.routes.values()) planned.set(path.relative(source, file), await sha(file));
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json'])
    planned.set(name, await sha(path.join(source, name)));
await fs.mkdir(resources);
for (const [relative, expected] of [...planned].sort(([a], [b]) => a.localeCompare(b))) {
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const original = path.join(source, relative), destination = path.join(resources, relative);
    assert.equal(await fs.realpath(original), original);
    assert.equal(await sha(original), expected, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(original, destination, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    assert.equal(await sha(destination), expected, relative);
}
const core = await validateProfile(resources), events = [];
const hd = await registerHdResources(resources, event => events.push(event));
assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
for (const entry of Object.values(catalog.shp)) {
    assert(hd.availability[entry.selection].startsWith('HD available'));
    for (const member of entry.members) assert(hd.routes.has(`/local-hd/${member.manifestHash}/manifest.json`));
}
for (const entry of Object.values(catalog.vxl)) for (const variant of entry.variants)
    assert(hd.routes.has(`/local-vxl/${variant.hash}/manifest.json`));
assert.deepEqual(Object.fromEntries(Object.keys(baseline.availability).map(k => [k, hd.availability[k]])), baseline.availability);
assert([...core.routes.values(), ...hd.routes.values()].every(file => file.startsWith(resources + path.sep)));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `RA2 HD Yuri Units D ${revision} - macOS Apple Silicon review\n\nOpen RA2 HD Yuri Units D ${revision}.app. Keep RA2-HD-Editions-Resources beside it.\nThe app uses its own sibling Yuri-Review-Profile. Select Yuri's Revenge.\nOriginal, 2x and 4x options apply to the next match.\nRead the accompanying runtime report for acceptance and known exceptions.\nMove the entire folder together. No developer checkout or web server is required.\n`);
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
const files = [];
async function inventory(directory, prefix = '') {
    for (const entry of (await fs.readdir(path.join(directory, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = path.posix.join(prefix, entry.name), absolute = path.join(directory, relative);
        if (entry.isDirectory()) await inventory(directory, relative);
        else if (entry.isSymbolicLink()) files.push({ file: relative, link: await fs.readlink(absolute) });
        else files.push({ file: relative, bytes: (await fs.stat(absolute)).size, sha256: await sha(absolute) });
    }
}
await inventory(folder);
const receipt = { status: 'PACKAGED_RUNTIME_PENDING', task: 'D', revision, folder, app, resources, build, target: 'darwin-arm64',
    runtimeSourceHead: identity.head, sourceIdentity: identity, installedReceipt, resourceFiles: planned.size,
    availability: hd.availability, localRoutes: core.routes.size + hd.routes.size, events, files,
    baselinePreserved: true, integration_status: 'NOT_MERGED', signing: 'LOCAL_AD_HOC', windows: 'NOT_RUN' };
await fs.writeFile(path.join(out, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ folder, app, resources, resourceFiles: planned.size, entries: files.length }));
