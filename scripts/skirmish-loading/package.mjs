import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import { validateProfile } from '../../desktop/profile.mjs';

const build = path.resolve(process.argv[2]), folder = path.resolve(process.argv[3]), source = path.resolve('.local');
await fs.mkdir(folder, { recursive: false });
const app = path.join(folder, 'RA2 HD Loading Optimized.app');
execFileSync('/usr/bin/ditto', ['node_modules/electron/dist/Electron.app', app]);
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
const payload = path.join(app, 'Contents/Resources/app');
await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name),
    { recursive: true, mode: constants.COPYFILE_FICLONE, force: false, errorOnExist: true });
await fs.copyFile('LICENSE', path.join(payload, 'LICENSE'));
await fs.copyFile('node_modules/electron/LICENSE', path.join(payload, 'ELECTRON-LICENSE'));
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.skirmish.loading.r1',
    CFBundleName: 'RA2 HD Loading Optimized', CFBundleDisplayName: 'RA2 HD Loading Optimized',
    CFBundleExecutable: 'RA2 HD Editions', CFBundleShortVersionString: '0.2.5', CFBundleVersion: '25' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path.join(app, 'Contents/Info.plist')]);
const isolation = JSON.parse(await fs.readFile('.artifacts/skirmish-loading/isolation.json'));
const files = new Set(isolation.inventory.map(row => row.file));
async function addPrepared(directory, prefix) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        assert(!entry.isSymbolicLink());
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) await addPrepared(path.join(source, relative), relative);
        else files.add(relative);
    }
}
await addPrepared(path.join(source, 'prepared-hd'), 'prepared-hd');
const resources = path.join(folder, 'RA2-HD-Editions-Resources');
await fs.mkdir(resources);
const inventory = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of [...files].sort()) {
    assert(!file.startsWith('..') && !path.isAbsolute(file));
    const original = path.join(source, file), target = path.join(resources, file);
    assert.equal(await fs.realpath(original), original);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(original, target, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
    const bytes = await fs.readFile(target), sha256 = hash(bytes);
    assert.equal(sha256, hash(await fs.readFile(original)));
    assert.notEqual((await fs.stat(target)).ino, (await fs.stat(original)).ino);
    inventory.push({ file, bytes: bytes.length, sha256 });
}
await validateProfile(resources);
const events = [], hd = await registerHdResources(resources, event => events.push(event));
assert(events.some(event => event.type === 'prepared-hd-registered'));
assert.deepEqual(hd.availability, isolation.availability);
const launcher = path.join(folder, 'Launch Loading Optimized.command');
await fs.writeFile(launcher, `#!/bin/bash
set -euo pipefail
review_folder="$(cd -- "$(dirname -- "$0")" && pwd)"
review_profile="$review_folder/Trainer-Review-Profile"
mkdir -p "$review_profile"
registration_tmp="$(/usr/bin/mktemp "$review_profile/resource-registration.XXXXXX")"
trap '/bin/rm -f "$registration_tmp"' EXIT
/usr/bin/printf '%s\\n' '{"schemaVersion":1}' > "$registration_tmp"
/usr/bin/plutil -insert directory -string "$review_folder/RA2-HD-Editions-Resources" "$registration_tmp"
/usr/bin/plutil -convert json "$registration_tmp"
/bin/mv -f "$registration_tmp" "$review_profile/resource-registration.json"
export RA2_DESKTOP_USER_DATA="$review_profile"
export RA2_DESKTOP_NO_DISCOVERY=1
exec "$review_folder/RA2 HD Loading Optimized.app/Contents/MacOS/RA2 HD Editions" "$@"
`);
await fs.chmod(launcher, 0o755);
execFileSync('/bin/bash', ['-n', launcher]);
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
await fs.writeFile(path.join(folder, 'README.txt'), `RA2 HD skirmish loading optimization - macOS Apple Silicon

Extract the ZIP and keep the whole folder together. Open Launch Loading Optimized.command.
Choose either edition and Original / 2X / 4X. Enter skirmish, return to the lobby,
then start another match in the same application to test repeated loading.
Accepted Allied artwork and committed Yuri building resources are included.
Settings and saves stay in this folder's new Trainer-Review-Profile.
The isolated repair branch is not merged into main. No existing package/profile is replaced.
`);
const receipt = { status: 'ISOLATED_MAC_READY_RUNTIME_VALIDATION_PENDING', app, resources, build, inventory, events,
    runtimeIdentity: JSON.parse(await fs.readFile(path.join(build, 'identity.json'))) };
await fs.writeFile(path.join(folder, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(app);
