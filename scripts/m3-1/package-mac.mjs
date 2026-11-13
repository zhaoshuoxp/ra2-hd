import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { macResourcePlan } from './mac-resource-plan.mjs';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = path.resolve(import.meta.dirname, '../..'), output = path.resolve(process.argv[2]);
const runtime = path.join(root, '.artifacts/m3-1/review-runtime');
const canonical = path.resolve(root, '../ra2-hd/.local'), campaign = path.join(root, '.local/campaign');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function sha(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const approved = await read(path.join(root, 'docs/m3-1-final-acceptance.json'));
const metadata = await read(path.join(runtime, 'package.json')), build = await read(path.join(runtime, 'build.json'));
assert.equal(approved.status, 'M3_1_MAC_NORMAL_PROTOTYPE_USER_ACCEPTED');
assert.equal(metadata.sourceHead, approved.source.runtimeHead);
assert.equal(await sha(path.join(root, approved.source.campaignManifest.path)), approved.source.campaignManifest.sha256);
assert.equal(execFileSync('git', ['diff', '--name-only', metadata.sourceHead, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
for (const file of build.web) {
    assert.equal((await fs.stat(path.join(runtime, 'dist', file.path))).size, file.bytes);
    assert.equal(await sha(path.join(runtime, 'dist', file.path)), file.sha256);
}
const desktop = [];
for (const name of await fs.readdir(path.join(runtime, 'desktop'))) {
    if (name === 'app-files.json') continue;
    assert.equal(await sha(path.join(runtime, 'desktop', name)), await sha(path.join(root, 'desktop', name)));
    desktop.push(name);
}
const plan = await read(path.join(root, '.artifacts/m3-1/mac-delivery/resource-plan.json'));
await fs.mkdir(output, { recursive: false });
const folder = path.join(output, 'RA2-HD-M3.1-Mac-arm64-20261023'); await fs.mkdir(folder);
const app = path.join(folder, 'Red Alert 2 HD M3.1 Campaign.app'), executable = 'RA2 HD M3.1';
run('/bin/cp', ['-cR', await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app')), app]);
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS', executable));
const resources = path.join(app, 'Contents/Resources/GameResources'); await fs.mkdir(resources);
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop']) await fs.cp(path.join(runtime, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(runtime, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
await fs.copyFile(path.join(root, 'scripts/m3-1/mac-package-main.mjs'), path.join(payload, 'desktop/mac-package-main.mjs'));
await fs.mkdir(path.join(payload, 'desktop/icons'));
await fs.copyFile(path.join(root, 'desktop/icons/app-icon.png'), path.join(payload, 'desktop/icons/app-icon.png'));
await fs.copyFile(path.join(root, 'desktop/icons/app-icon.icns'), path.join(app, 'Contents/Resources/app-icon.icns'));
const packagingHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await save(path.join(payload, 'package.json'), { ...metadata, main: 'desktop/mac-package-main.mjs',
    distributionKind: 'M3.1-MAC-ARM64-INDEPENDENT-TEST', acceptedRuntimeSourceHead: metadata.sourceHead,
    packagingSourceHead: packagingHead });
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.campaign.m31.20261023',
    CFBundleName: 'Red Alert 2 HD M3.1 Campaign', CFBundleDisplayName: 'Red Alert 2 HD M3.1 Campaign',
    CFBundleExecutable: executable, CFBundleShortVersionString: '0.3.1', CFBundleVersion: '31',
    CFBundleIconFile: 'app-icon.icns' })) run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
run('/usr/bin/clang', ['-O2', '-arch', 'arm64', '-framework', 'ApplicationServices',
    path.join(root, 'desktop/native/restore-cursor.c'), '-o', path.join(payload, 'desktop/restore-cursor')]);
const resourceRows = [];
async function copyFiles(source, destination, files, prefix = '') {
    for (const [index, relative] of files.entries()) {
        assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'));
        const original = path.join(source, relative), target = path.join(destination, relative);
        assert.equal(await fs.realpath(original), original);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(original, target, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
        const digest = await sha(original); assert.equal(await sha(target), digest);
        assert.notEqual((await fs.stat(target)).ino, (await fs.stat(original)).ino);
        resourceRows.push({ file: prefix + relative, bytes: (await fs.stat(target)).size, sha256: digest });
        if ((index + 1) % 1000 === 0) console.log(JSON.stringify({ phase: 'RESOURCE_COPY_VERIFIED', files: index + 1, total: files.length }));
    }
}
await copyFiles(canonical, resources, plan.files);
await copyFiles(campaign, path.join(resources, 'campaign'), plan.campaignFiles, 'campaign/');
async function metadataOnly(relative, value, reason) {
    const row = resourceRows.find(row => row.file === relative), target = path.join(resources, relative);
    assert(row);
    row.sourceIdentity = { bytes: row.bytes, sha256: row.sha256 }; row.metadataChange = reason;
    await save(target, value); row.bytes = (await fs.stat(target)).size; row.sha256 = await sha(target);
}
for (const override of plan.metadataOverrides) await metadataOnly(override.file, override.value, override.reason);
for (const name of ['ra2-core-manifest.json', 'yr-core-manifest.json']) {
    const original = await read(path.join(resources, name));
    await metadataOnly(name, { schemaVersion: 1, ...(original.edition ? { edition: original.edition } : {}),
        files: original.files.map(file => Object.fromEntries(['virtualName', 'bytes', 'sha256', 'validation'].map(key => [key, file[key]]))) },
    'Portable import metadata; all archive names, hashes, sizes and validation retained');
}
const support = await read(path.join(resources, 'upstream-support/manifest.json'));
await metadataOnly('upstream-support/manifest.json', support.filter(row => ['general.csf', 'ra2cd.mix'].includes(path.basename(row.original)))
    .map(row => Object.fromEntries(['original', 'commit', 'sha256', 'bytes'].map(key => [key, row[key]]))), 'Portable allowlisted support metadata');
const copiedPlan = await macResourcePlan(resources, path.join(resources, 'campaign'));
for (const key of ['files', 'campaignFiles', 'availability', 'routeCount', 'selectionCount', 'uiRevision', 'prepared', 'urbanRevision', 'layers', 'campaignExtension']) {
    assert.deepEqual(copiedPlan[key], plan[key], `Independent package registration differs: ${key}`);
}
assert.equal(copiedPlan.metadataOverrides.length, 0);
await save(path.join(output, 'resource-inventory.json'), resourceRows);
await save(path.join(output, 'packaged-registration.json'), copiedPlan);
const identity = { schemaVersion: 1, target: 'darwin-arm64', runtimeSourceHead: metadata.sourceHead, packagingSourceHead: packagingHead,
    campaignManifestSha256: approved.source.campaignManifest.sha256, worldUiResources: plan.files.length,
    campaignFiles: plan.campaignFiles.length, urbanRoadRevision: plan.urbanRevision,
    userData: '~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023',
    resources: 'Contents/Resources/GameResources', sourceStatus: 'USER_ACCEPTED_RUNTIME_REUSED_WITH_PACKAGING_BOOTSTRAP',
    signing: 'AD_HOC_LOCAL_TEST_NOT_NOTARIZED' };
await save(path.join(app, 'Contents/Resources/M3.1-Package-Info.json'), identity);
await fs.copyFile(path.join(root, '.artifacts/m3-1/M3.1-Embedded-Review.html'), path.join(folder, 'M3.1-Review.html'));
await fs.copyFile(path.join(root, 'docs/m3-1-final-acceptance.json'), path.join(folder, 'M3.1-Acceptance.json'));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Red Alert 2 HD M3.1 - Mac Apple Silicon manual test

Extract the ZIP, then open Red Alert 2 HD M3.1 Campaign.app.
The app includes its game resources and works independently of the development checkout.
Choose Red Alert 2, Campaign, Soviet, Normal. The original introduction can be skipped.
HD is enabled by default; Original, 2X and 4X remain available in Graphics options.

Check faction selection/hover, mission loading, the opening memorial/flag and roads.
The bridge starts broken. Send an engineer into its bridge repair hut to restore it.
Escape opens Save, Load, Restart and Abort. Save after mission speech has finished.
Load pauses the restored mission for inspection. The prototype has one manual slot.
Destroy all four original Pentagon sections to complete the mission and see the badge/text result animation.
Only Soviet 01 Normal is enabled for this campaign prototype; completion does not open mission two.

Settings and saves use a separate profile:
~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023
No existing profile or save is included in this ZIP.
M3.1-Review.html opens offline and contains the accepted screenshots and recordings.
This private local test app is ad-hoc signed, not notarized.
`);
run('/usr/bin/xattr', ['-cr', app]);
run('/usr/bin/codesign', ['--force', '--sign', '-', path.join(payload, 'desktop/restore-cursor')]);
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
for (const file of build.web) assert.equal(await sha(path.join(payload, 'dist', file.path)), file.sha256);
for (const name of desktop) assert.equal(await sha(path.join(payload, 'desktop', name)), await sha(path.join(runtime, 'desktop', name)));
const inventory = [];
async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name), relative = path.relative(folder, file);
        if (entry.isDirectory()) await collect(file);
        else if (entry.isSymbolicLink()) {
            assert((await fs.realpath(file)).startsWith(app + path.sep));
            inventory.push({ file: relative, link: await fs.readlink(file), mode: (await fs.lstat(file)).mode & 0o7777 });
        } else {
            assert(entry.isFile());
            const stat = await fs.stat(file); inventory.push({ file: relative, bytes: stat.size, sha256: await sha(file), mode: stat.mode & 0o7777 });
        }
    }
}
await collect(folder); inventory.sort((a, b) => a.file.localeCompare(b.file));
await save(path.join(folder, 'PACKAGE-MANIFEST.json'), { ...identity, files: inventory,
    manifestExcludedFromSelfInventory: 'PACKAGE-MANIFEST.json' });
const manifest = path.join(folder, 'PACKAGE-MANIFEST.json');
inventory.push({ file: 'PACKAGE-MANIFEST.json', bytes: (await fs.stat(manifest)).size, sha256: await sha(manifest), mode: (await fs.stat(manifest)).mode & 0o7777 });
await save(path.join(output, 'inventory.json'), inventory);
const receipt = { status: 'PASS_INDEPENDENT_MAC_ASSEMBLY_PENDING_DESKTOP_ZIP_NATIVE_TEST', folder, app, resources, executable,
    identity, entries: inventory.length, logicalBytes: inventory.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
    frozenWebFilesUnchanged: build.web.length, frozenDesktopFilesUnchanged: desktop.length,
    resourceInventorySha256: await sha(path.join(output, 'resource-inventory.json')),
    packageInventorySha256: await sha(path.join(output, 'inventory.json')), copiedRegistrationLayers: copiedPlan.layers.length,
    packagingTools: await Promise.all(['package-mac.mjs', 'mac-resource-plan.mjs', 'mac-package-main.mjs'].map(async name => ({ path: 'scripts/m3-1/' + name, sha256: await sha(path.join(root, 'scripts/m3-1', name)) }))) };
await save(path.join(output, 'stage.json'), receipt);
console.log(JSON.stringify({ status: receipt.status, folder, entries: receipt.entries, logicalBytes: receipt.logicalBytes }));
