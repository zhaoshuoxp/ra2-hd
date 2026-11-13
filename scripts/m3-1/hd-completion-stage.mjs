import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const runtime = path.join(base, 'runtime'), output = path.join(base, 'native-stage');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const run = (file, args) => execFileSync(file, args, { cwd: root, stdio: 'inherit' });
async function sha(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['diff', '--name-only', head, '--', 'src', 'desktop', 'public'],
    { cwd: root, encoding: 'utf8' }).trim(), '');
const metadata = await read(path.join(runtime, 'package.json')); assert.equal(metadata.sourceHead, head);
const prior = await read(path.join(root, '.artifacts/m3-1/feedback-r6/extracted.json'));
const plan = await read(path.join(base, 'resource-plan.json')); assert.deepEqual(plan.metadataOverrides, []);
await fs.mkdir(output, { recursive: false });
const title = 'Red Alert 2 HD M3.1 Campaign R7';
const folder = path.join(output, 'RA2-HD-M3.1-Mac-arm64-20261024-R7'); await fs.mkdir(folder);
const app = path.join(folder, title + '.app'); run('/bin/cp', ['-cR', prior.app, app]);
const payload = path.join(app, 'Contents/Resources/app'), resources = path.join(app, 'Contents/Resources/GameResources');
// These are task-owned derived clones. The R6 application and resource source are never edited.
await fs.rm(resources, { recursive: true }); await fs.mkdir(resources);
await fs.rm(path.join(payload, 'dist'), { recursive: true });
await fs.cp(path.join(runtime, 'dist'), path.join(payload, 'dist'), { recursive: true });
await fs.cp(path.join(runtime, 'desktop'), path.join(payload, 'desktop'), { recursive: true });
await fs.copyFile(path.join(root, 'scripts/m3-1/mac-package-main.mjs'), path.join(payload, 'desktop/mac-package-main.mjs'));
await save(path.join(payload, 'package.json'), { ...metadata, main: 'desktop/mac-package-main.mjs', productName: title,
    distributionKind: 'M3.1-MAC-ARM64-INDEPENDENT-TEST', distributionRevision: 'HD-COMPLETION-R7', campaignEntry: 'ra2-soviet01' });
const files = [...plan.files, ...plan.campaignFiles.map(file => 'campaign/' + file)].sort();
assert.equal(new Set(files).size, files.length);
const rows = []; let cursor = 0;
async function copyWorker() {
    while (cursor < files.length) {
        const relative = files[cursor++];
        assert(!path.isAbsolute(relative) && !relative.split('/').includes('..'));
        const source = path.join(base, 'resources', relative), target = path.join(resources, relative);
        const original = await fs.lstat(source); assert(original.isFile() && !original.isSymbolicLink());
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target, constants.COPYFILE_FICLONE);
        const stat = await fs.stat(target); assert.notEqual(stat.ino, original.ino);
        const [sourceHash, targetHash] = await Promise.all([sha(source), sha(target)]);
        assert.equal(sourceHash, targetHash, relative); assert.equal(stat.size, original.size);
        rows.push({ file: relative, bytes: stat.size, mode: stat.mode & 0o7777, sha256: targetHash });
        if (rows.length % 2000 === 0) console.log(JSON.stringify({ phase: 'INDEPENDENT_SELECTED_RESOURCES_VERIFIED', files: rows.length }));
    }
}
await Promise.all(Array.from({ length: 12 }, copyWorker));
rows.sort((a, b) => a.file.localeCompare(b.file));
await save(path.join(output, 'resource-inventory.json'), rows);
const build = await read(path.join(runtime, 'build.json'));
for (const file of build.web) assert.equal(await sha(path.join(payload, 'dist', file.path)), file.sha256, file.path);
const identity = { sourceHead: head, distributionRevision: 'HD-COMPLETION-R7',
    retainedR6ZipSha256: prior.zipSha256, selectedResourceFiles: rows.length,
    selectedUrbanPack: (await read(path.join(base, 'registration-receipt.json'))).selectedPack,
    standard: 'hd-art-standard.md', nativeValidation: 'PENDING', userVisualAcceptance: 'PENDING', nativeWindows: 'NOT_RUN_ON_THIS_MAC' };
await save(path.join(app, 'Contents/Resources/M3.1-Package-Info.json'), identity);
await fs.copyFile(path.join(root, 'docs/hd-art-standard.md'), path.join(folder, 'hd-art-standard.md'));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `${title} - Apple Silicon manual test

Extract the ZIP and open ${title}.app. Select Soviet and Easy, Normal or Hard.
The app includes its own resources. HD options retain Original, 2X and 4X.
This revision connects 23 accepted reuse identities and six complete new families.
The opening memorial uses its original Soviet flag animation after the original team garrisons it.
The bridge starts broken; an engineer entering the repair hut repairs it.
Named and legacy campaign saves use the existing M3.1 profile and formats.
Settings/saves: ~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023
The ZIP contains no user settings or saves. Enable the optional trainer in Settings.
See M3.1-HD-Completion-R7-Review.html for embedded native screenshots.
This local test application is ad-hoc signed. User visual acceptance is pending.
`);
const plist = path.join(app, 'Contents/Info.plist');
for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.campaign.m31.20261024.r7',
    CFBundleName: title, CFBundleDisplayName: title, CFBundleVersion: '40' })) {
    run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
}
run('/usr/bin/xattr', ['-cr', app]); run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const receipt = { status: 'PASS_INDEPENDENT_SELECTED_RESOURCE_APP_ASSEMBLY_NATIVE_PENDING', folder, app,
    executable: prior.executable, sourceHead: head, resources, resourceFiles: rows.length,
    resourceInventorySha256: await sha(path.join(output, 'resource-inventory.json')), identity };
await save(path.join(output, 'stage.json'), receipt);
console.log(JSON.stringify(receipt));
