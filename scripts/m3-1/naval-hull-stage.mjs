import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const withFlag = process.argv.includes('--soviet-flag');
const output = path.join(base, withFlag ? 'final-stage' : 'native-stage'), receiptFile = path.join(output, 'stage.json');
const read = async file => JSON.parse(await fs.readFile(file));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
async function sha(file) {
    const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
async function inventory(folder, prefix = '') {
    const rows = [];
    for (const entry of await fs.readdir(path.join(folder, prefix), { withFileTypes: true })) {
        const file = path.posix.join(prefix, entry.name), full = path.join(folder, file), stat = await fs.lstat(full);
        if (entry.isDirectory()) rows.push(...await inventory(folder, file));
        else if (entry.isSymbolicLink()) rows.push({ file, mode: stat.mode & 0o7777, link: await fs.readlink(full) });
        else { assert(entry.isFile()); rows.push({ file, mode: stat.mode & 0o7777, bytes: stat.size, sha256: await sha(full) }); }
    }
    return rows.sort((a, b) => a.file.localeCompare(b.file));
}
if (process.argv.includes('--finalize')) {
    const receipt = await read(receiptFile), folder = receipt.folder;
    assert.equal(execFileSync('git', ['diff', '--name-only', receipt.sourceHead, '--', 'src', 'desktop', 'public'],
        { cwd: root, encoding: 'utf8' }).trim(), '');
    const pins = [];
    await fs.mkdir(path.join(folder, 'Validation'), { recursive: false });
    for (const name of ['baseline-4x', 'native-original', 'native-2x', 'native-4x', ...(withFlag ? ['opening-native'] : [])]) {
        const file = path.join(base, name, 'report.json'), report = await read(file);
        assert(report.status.startsWith('PASS_'), name);
        pins.push({ name, status: report.status, sha256: await sha(file) });
        await fs.copyFile(file, path.join(folder, 'Validation', name + '.json'));
    }
    const review = await read(path.join(base, 'review/review.json'));
    assert.equal(await sha(review.file), review.sha256);
    await fs.copyFile(review.file, path.join(folder, path.basename(review.file)));
    for (const file of [withFlag ? 'focused-tests-with-flag.log' : 'focused-tests.log', 'typecheck.log', withFlag ? 'resource-preservation-with-flag.json' : 'resource-preservation.json',
        ...(withFlag ? ['flag-validation.json'] : [])])
        await fs.copyFile(path.join(base, file), path.join(folder, 'Validation', file));
    if (withFlag) {
        await fs.mkdir(path.join(folder, 'Artwork'));
        for (const file of ['soviet-flag-master-r1.png', 'prompt.txt'])
            await fs.copyFile(path.join(base, 'flag-authoring', file), path.join(folder, 'Artwork', file));
    }
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', receipt.app]);
    const rows = await inventory(folder);
    await save(path.join(folder, 'PACKAGE-MANIFEST.json'), { sourceHead: receipt.sourceHead, files: rows,
        manifestExcludedFromSelfInventory: 'PACKAGE-MANIFEST.json' });
    const manifest = path.join(folder, 'PACKAGE-MANIFEST.json'), stat = await fs.stat(manifest);
    rows.push({ file: 'PACKAGE-MANIFEST.json', mode: stat.mode & 0o7777, bytes: stat.size, sha256: await sha(manifest) });
    rows.sort((a, b) => a.file.localeCompare(b.file)); await save(path.join(output, 'inventory.json'), rows);
    await save(receiptFile, { ...receipt, status: 'PASS_INDEPENDENT_MAC_ASSEMBLY_PENDING_DESKTOP_ZIP_NATIVE_TEST',
        entries: rows.length, inventorySha256: await sha(path.join(output, 'inventory.json')), nativeReports: pins,
        reviewSha256: review.sha256, applicationUnchangedAfterNativeValidation: true });
    console.log(JSON.stringify({ status: 'PASS_R8_FINALIZED_WITH_UNCHANGED_NATIVE_TESTED_APPLICATION', entries: rows.length }));
} else {
    assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(execFileSync('git', ['diff', '--name-only', head, '--', 'src', 'desktop', 'public'],
        { cwd: root, encoding: 'utf8' }).trim(), '');
    const runtime = path.join(base, withFlag ? 'runtime-flag' : 'runtime'), metadata = await read(path.join(runtime, 'package.json'));
    assert.equal(metadata.sourceHead, head);
    const prior = await read(path.join(root, '.artifacts/m3-1/hd-completion-r7/extracted.json'));
    const resourceList = path.join(root, '.artifacts/m3-1/hd-completion-r7/native-stage/resource-inventory.json');
    assert.equal(await sha(resourceList), 'b159c375d306f0340514ebd8134fa6e3585f58726c4ba815a433c4eb16092f25');
    const expected = await read(resourceList), title = 'Red Alert 2 HD M3.1 Campaign R8';
    await fs.mkdir(output, { recursive: false });
    const folder = path.join(output, 'RA2-HD-M3.1-Mac-arm64-20261025-R8'); await fs.mkdir(folder);
    const app = path.join(folder, title + '.app'); run('/bin/cp', ['-cR', prior.app, app]);
    const payload = path.join(app, 'Contents/Resources/app');
    for (const name of ['dist', 'desktop']) {
        await fs.rm(path.join(payload, name), { recursive: true });
        await fs.cp(path.join(runtime, name), path.join(payload, name), { recursive: true });
    }
    await fs.copyFile(path.join(root, 'scripts/m3-1/mac-package-main.mjs'), path.join(payload, 'desktop/mac-package-main.mjs'));
    await save(path.join(payload, 'package.json'), { ...metadata, main: 'desktop/mac-package-main.mjs', productName: title,
        distributionKind: 'M3.1-MAC-ARM64-INDEPENDENT-TEST', distributionRevision: 'NAVAL-HULL-R8', campaignEntry: 'ra2-soviet01' });
    const resources = path.join(app, 'Contents/Resources/GameResources');
    const permitted = new Set();
    if (withFlag) {
        const validation = await read(path.join(base, 'flag-validation.json'));
        assert(validation.status.startsWith('PASS_'));
        for (const name of [...validation.changedFiles, ...validation.addedFiles]) {
            const file = 'campaign/ra2/sov01t/' + name; permitted.add(file);
            await fs.copyFile(path.join(base, 'flag-resources-v2', file), path.join(resources, file));
        }
        assert.equal(permitted.size, 5);
    }
    const actual = await inventory(resources);
    assert.equal(actual.length, withFlag ? 14070 : 14067);
    const sourceResources = path.join(prior.app, 'Contents/Resources/GameResources');
    const lookup = new Map(expected.map(row => [row.file, row]));
    for (const row of actual) {
        const original = lookup.get(row.file);
        if (permitted.has(row.file)) assert.equal(row.sha256, await sha(path.join(base, 'flag-resources-v2', row.file)), row.file);
        else { assert(original, row.file); assert.equal(row.sha256, original.sha256, row.file); assert.equal(row.bytes, original.bytes, row.file); }
        if (original) assert.notEqual((await fs.stat(path.join(resources, row.file))).ino,
            (await fs.stat(path.join(sourceResources, row.file))).ino, row.file);
    }
    await save(path.join(base, withFlag ? 'resource-preservation-with-flag.json' : 'resource-preservation.json'), {
        status: withFlag ? 'PASS_R7_RESOURCES_PRESERVED_WITH_SCOPED_SOVIET_INSIGNIA_EXTENSION' : 'PASS_ALL_R7_SELECTED_RESOURCES_BYTE_IDENTICAL_AND_INDEPENDENT',
        files: actual.length, originalInventorySha256: await sha(resourceList),
        originalDesktopZip: prior.desktopZip, originalDesktopZipSha256: prior.zipSha256,
        permittedChanges: [...permitted], unchangedOriginalResourceFiles: expected.length - (withFlag ? 2 : 0),
        artwork: 'All R7 masters, existing atlases, palettes, ownership masks, source geometry and resource selectors are retained unchanged. The optional flag extension adds two insignia atlases and a versioned member manifest, updating only the task-owned campaign family/index metadata.' });
    const build = await read(path.join(runtime, 'build.json'));
    for (const row of build.web) assert.equal(await sha(path.join(payload, 'dist', row.path)), row.sha256, row.path);
    await save(path.join(app, 'Contents/Resources/M3.1-Package-Info.json'), { sourceHead: head, distributionRevision: 'NAVAL-HULL-R8',
        retainedR7ZipSha256: prior.zipSha256, selectedResourceFiles: actual.length, userVisualAcceptance: 'PENDING',
        change: 'Recover civilian naval hull depth above the water clipping plane while retaining screen registration and native pose.',
        ...(withFlag ? { sovietFlag: 'Generated yellow hammer/sickle and outlined star in slots 32-47; alpha, other states, pole and timing retained.' } : {}),
        nativeWindows: 'NOT_RUN_ON_THIS_MAC' });
    await fs.copyFile(path.join(root, 'docs/hd-art-standard.md'), path.join(folder, 'hd-art-standard.md'));
    await fs.writeFile(path.join(folder, 'START-HERE.txt'), `${title} - Apple Silicon manual test\n\nExtract the ZIP and open ${title}.app. Select Soviet and any difficulty.\nR8 fixes the yacht and tug hulls being clipped by the water surface. Ship artwork is unchanged.\n${withFlag ? 'The scripted Soviet memorial flag includes its yellow hammer/sickle and outlined star in 2X and 4X.\n' : ''}Check the civilian boats beside the wooden piers in Original, 2X and 4X.\nThe application includes all required resources; no user settings or saves are bundled.\nSettings/saves: ~/Library/Application Support/RA2 HD M3.1 Campaign Test 20261023\nThe optional trainer remains available in Settings. Existing save formats are retained.\nSee M3.1-Naval-Hull-R8-Review.html for embedded native before/after screenshots.\nThis local test application is ad-hoc signed. User visual acceptance is pending.\n`);
    const plist = path.join(app, 'Contents/Info.plist');
    for (const [key, value] of Object.entries({ CFBundleIdentifier: 'local.ra2hd.campaign.m31.20261025.r8',
        CFBundleName: title, CFBundleDisplayName: title, CFBundleVersion: '41' }))
        run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
    run('/usr/bin/xattr', ['-cr', app]); run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app]);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    await save(receiptFile, { status: 'PASS_R8_NATIVE_STAGE_PENDING_RENDER_VALIDATION', folder, app,
        executable: prior.executable, sourceHead: head, resources, verifiedResourceFiles: actual.length });
    console.log(JSON.stringify({ status: 'PASS_R8_NATIVE_STAGE_PENDING_RENDER_VALIDATION', app, sourceHead: head }));
}
