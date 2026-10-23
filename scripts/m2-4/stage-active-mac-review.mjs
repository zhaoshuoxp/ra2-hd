// One internal Mac validation host; reuse task resources without per-batch game copies.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources } from '../../desktop/hd-profile.mjs';

const [buildArg, hostArg, receiptArg] = process.argv.slice(2);
assert(buildArg && hostArg && receiptArg && process.platform === 'darwin' && process.arch === 'arm64');
const build = path.resolve(buildArg), host = path.resolve(hostArg), receipt = path.resolve(receiptArg);
const resources = path.resolve('.local');
assert(host === path.resolve('.artifacts/m2-4/active-mac-validation-host-v1'));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const entry of identity.files)
    assert.equal(sha(await fs.readFile(path.join(build, entry.file))), entry.sha256);
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Freeze clean source first');
const profile = await validateProfile(resources);
assert.equal(profile.manifest.files.length, 3);
assert.equal(profile.selections.get('/local-assets/yr/manifest.json')?.files.length, 7);
const events = [];
const registered = await registerHdResources(resources, event => events.push(event));
const preparedRegistration = events.find(event => event.type === 'prepared-hd-registered');
const preparedPin = JSON.parse(await fs.readFile(path.join(build, 'desktop/prepared-hd-contract.json')));
const preparedBytes = await fs.readFile(path.join(resources, preparedPin.indexPath));
assert.equal(sha(preparedBytes), preparedPin.sha256);
const preparedIndex = JSON.parse(preparedBytes), expectedPages = new Set();
let expectedMembers = 0;
for (const selection of registered.selections.values())
    for (const member of selection.members ?? (selection.sha256 && selection.files ? [selection] : [])) {
        const densities = preparedIndex.members[member.sha256];
        if (!densities) continue;
        expectedMembers++;
        for (const [density, pages] of Object.entries(densities))
            for (const id of Object.keys(pages)) expectedPages.add(`${member.sha256}/${density}/${id}`);
    }
assert(expectedMembers > 0 && expectedPages.size > 0);
assert.equal(preparedRegistration?.index, preparedPin.sha256);
assert.equal(preparedRegistration?.members, expectedMembers);
assert.equal(preparedRegistration?.pages, expectedPages.size);
await fs.mkdir(host, { recursive: true });
const app = path.join(host, 'Red Alert 2 HD M2.4 Validation Host.app');
try { await fs.access(app); }
catch {
    execFileSync('/usr/bin/ditto', [path.resolve('node_modules/electron/dist/Electron.app'), app]);
    await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS/RA2 HD Editions'));
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIdentifier local.ra2hd.skirmish.m2-4.validation', path.join(app, 'Contents/Info.plist')]);
    execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleExecutable RA2 HD Editions', path.join(app, 'Contents/Info.plist')]);
}
const payload = path.join(app, 'Contents/Resources/app');
// This exact mutable host is task-owned; historical apps, builds and source receipts are preserved.
await fs.rm(payload, { recursive: true, force: true });
await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json'])
    await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
const privateProfile = path.join(host, 'Review-Profile');
await fs.writeFile(path.join(payload, 'desktop/active-review-main.mjs'),
    `import fs from 'node:fs/promises';\nprocess.env.RA2_DESKTOP_USER_DATA ??= ${JSON.stringify(privateProfile)};\n`
    + `process.env.RA2_DESKTOP_NO_DISCOVERY ??= '1';\nprocess.env.RA2_UI_RESOURCE_ROOT ??= ${JSON.stringify(resources)};\n`
    + `await fs.mkdir(process.env.RA2_DESKTOP_USER_DATA, { recursive: true });\n`
    + `await fs.writeFile(process.env.RA2_DESKTOP_USER_DATA + '/resource-registration.json', JSON.stringify({ schemaVersion: 1, directory: ${JSON.stringify(resources)} }));\n`
    + `await import('./main.mjs');\n`);
const metadata = JSON.parse(await fs.readFile(path.join(payload, 'package.json')));
metadata.main = 'desktop/active-review-main.mjs';
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify(metadata) + '\n');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const report = { status: 'STAGED_INTERNAL_MAC_VALIDATION_HOST', app, resources, build,
    runtimeSourceHead: identity.head, target: 'darwin-arm64', profile: privateProfile,
    resourceStorage: 'Existing isolated task resources; no per-batch game or resource copy',
    preparedRegistration,
    policy: 'Internal reusable packaged Mac host, not an independent delivery. Each native case pins source, selectors and metadata. Subsequent batch delivery is embedded HTML; final milestone packaging remains separate.' };
await fs.writeFile(receipt, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ app, receipt, runtimeSourceHead: identity.head, resourceStorage: report.resourceStorage }));
