// Stage a relocatable R3 app, both native editions and the registered HD resources.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../../desktop/profile.mjs';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

const root = process.cwd(), nativeRoot = await fs.realpath(process.argv[2]);
const output = path.resolve(process.argv[3]);
const delivery = JSON.parse(await fs.readFile('.artifacts/yuri-cameos/loading-followup-v1/delivery-receipt.json', 'utf8'));
const name = 'RA2-HD-Yuri-Cameos-E-R3-Complete-macOS-arm64';
const folder = path.join(output, name), resources = path.join(folder, 'RA2-HD-UI-Resources');
const uiRoot = path.join(folder, 'RA2-HD-Yuri-Cameos-Resources');
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
await fs.mkdir(output, { recursive: false }); await fs.mkdir(folder);
process.env.RA2_UI_RESOURCE_ROOT = delivery.resources; process.env.RA2_UI_REVIEW = '1';
const profile = await validateProfile(nativeRoot), originalHd = await registerHdResources(nativeRoot);
assert.equal(profile.selections.get('/local-assets/yr/manifest.json').files.length, 7);
assert.equal(originalHd.selections.get('/local-ui/selection.json').assets.length, 474);
const selectedFiles = new Set([...profile.routes.values(), ...originalHd.routes.values()]
    .filter(file => file.startsWith(nativeRoot + path.sep)).map(file => path.relative(nativeRoot, file)));
// Family and atlas descriptors are consumed at registration and are not all served as routes.
async function descriptors(directory, prefix = 'hd-packs') {
    for (const entry of await fs.readdir(path.join(directory, prefix), { withFileTypes: true })) {
        const file = path.join(prefix, entry.name);
        if (entry.isDirectory()) await descriptors(directory, file);
        else if (entry.isFile() && entry.name.endsWith('.json')) selectedFiles.add(file);
    }
}
await descriptors(nativeRoot);
for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json']) selectedFiles.add(file);
await fs.mkdir(resources);
for (const relative of [...selectedFiles].sort()) {
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    const source = path.join(nativeRoot, relative), target = path.join(resources, relative);
    assert.equal(await fs.realpath(source), source);
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(source, target);
    assert.equal(await hash(target), await hash(source), relative);
}
// Remove importer source paths; retain every validated content identity.
for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json']) {
    const manifest = JSON.parse(await fs.readFile(path.join(resources, file), 'utf8'));
    manifest.files = manifest.files.map(row => Object.fromEntries(['virtualName', 'bytes', 'sha256', 'validation'].map(k => [k, row[k]])));
    await fs.writeFile(path.join(resources, file), JSON.stringify(manifest, null, 2) + '\n');
}
const supportFile = path.join(resources, 'upstream-support/manifest.json');
const support = JSON.parse(await fs.readFile(supportFile, 'utf8'));
await fs.writeFile(supportFile, JSON.stringify(support.filter(row => ['general.csf', 'ra2cd.mix'].includes(path.basename(row.original)))
    .map(row => Object.fromEntries(['original', 'commit', 'sha256', 'bytes'].map(k => [k, row[k]]))), null, 2) + '\n');
await fs.cp(delivery.resources, uiRoot, { recursive: true });
const app = path.join(folder, path.basename(delivery.app)); execFileSync('/usr/bin/ditto', [delivery.app, app]);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
process.env.RA2_UI_RESOURCE_ROOT = uiRoot;
const packagedProfile = await validateProfile(resources), packagedHd = await registerHdResources(resources);
assert.deepEqual(packagedProfile.manifest, profile.manifest);
assert.deepEqual(packagedHd.availability, originalHd.availability);
assert.deepEqual([...packagedHd.selections], [...originalHd.selections]);
assert.deepEqual([...packagedHd.routes.keys()].sort(), [...originalHd.routes.keys()].sort());
const review = path.join(folder, 'Review'); await fs.mkdir(review);
for (const name of ['Yuri-Cameos-Complete-Review.html', 'PACK-DELTA.json']) await fs.copyFile(path.join(delivery.folder, name), path.join(review, name));
for (const name of ['yuri-cameos-final-handoff.md', 'yuri-cameos-final-acceptance.json', 'yuri-ui-loading-followup.md', 'yuri-ui-loading-followup.json'])
    await fs.copyFile(path.join(root, 'docs', name), path.join(review, name));
for (const name of ['batch-acceptance-v2.json']) await fs.copyFile(path.join(root, '.artifacts/yuri-cameos', name), path.join(review, name));
for (const name of ['native-source.json', 'prompt.txt', 'export-receipt.json', 'validation-receipt.json', 'loading-comparison.png'])
    await fs.copyFile(path.join(root, '.artifacts/yuri-cameos/loading-followup-v1', name), path.join(review, name));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Red Alert 2 HD — Yuri Cameos E R3 complete local package — macOS Apple Silicon

Open ${path.basename(app)}. Keep both resource folders beside the app.
Both RA2 and Yuri's Revenge native runtime data and all HD resources registered by this R3 app are included.
First launch discovers RA2-HD-UI-Resources automatically; no project checkout or external resource selection is needed.
RA2-HD-Yuri-Cameos-Resources supplies the 474-entry UI pack, accepted cameos and new Yuri loading background.
Move the whole extracted folder together. A new isolated profile is created on first launch; none is shipped.
Review/Yuri-Cameos-Complete-Review.html is self-contained. All 31 cameos and 12 aliases are accepted.
The additional Yuri loading artwork awaits visual confirmation. This package retains the reviewed R3 code;
it does not merge concurrent worktree changes or claim Windows/combined-main validation.
The application is locally ad-hoc signed, not notarized. Nothing was pushed or published.
`);
const inventory = [];
async function collect(prefix = '') {
    for (const entry of (await fs.readdir(path.join(folder, prefix), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.posix.join(prefix, entry.name), absolute = path.join(folder, file), stat = await fs.lstat(absolute);
        if (entry.isDirectory()) await collect(file);
        else if (entry.isSymbolicLink()) {
            const link = await fs.readlink(absolute);
            assert(!path.isAbsolute(link) && (await fs.realpath(absolute)).startsWith(folder + path.sep), file);
            inventory.push({ file, link, mode: stat.mode & 0o777 });
        } else inventory.push({ file, bytes: stat.size, mode: stat.mode & 0o777, sha256: await hash(absolute) });
    }
}
await collect();
assert(!inventory.some(row => /(^|\/)(UserData|Yuri-Cameos-Review-Profile|resource-registration\.json|Cookies|Cache|\.DS_Store)(\/|$)/.test(row.file)));
await fs.writeFile(path.join(folder, 'PACKAGE-INVENTORY.json'), JSON.stringify({ schemaVersion: 1, files: inventory }, null, 2) + '\n');
const receipt = { schemaVersion: 1, taskId: 'E', status: 'STAGED_COMPLETE_REGISTRATION_PARITY_PASS',
    folder, app, executable: delivery.executable, resources, uiRoot, uiRevision: delivery.uiRevision,
    uiManifestSha256: delivery.uiManifestSha256, nativeInputRoot: nativeRoot, nativeArchivesCopied: true,
    sourceHead: delivery.sourceHead, reportHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    fileCount: inventory.length, nativeWorldResourceFiles: selectedFiles.size, availability: packagedHd.availability,
    routeCount: packagedHd.routes.size, target: 'darwin-arm64', profileShipped: false, integration_status: 'NOT_MERGED' };
await fs.writeFile(path.join(output, 'package-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ folder, fileCount: inventory.length, nativeWorldResourceFiles: selectedFiles.size, routeCount: packagedHd.routes.size }));
