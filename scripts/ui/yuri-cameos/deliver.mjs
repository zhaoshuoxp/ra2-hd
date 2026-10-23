// Build once, then package the task-owned UI resources without copying native archives.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { registerUiResources } from '../../../desktop/ui-profile.mjs';

const root = process.cwd(), build = path.resolve(process.argv[2]), folder = path.resolve(process.argv[3]);
const production = path.resolve(process.argv[4] ?? '.artifacts/yuri-cameos/production-v4');
const releaseTag = process.argv[5] ?? 'R1';
assert(/^R[1-9][0-9]*$/.test(releaseTag));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = JSON.parse(await fs.readFile(path.join(production, 'export-receipt.json'), 'utf8'));
assert.equal(process.arch, 'arm64'); assert.equal(process.platform, 'darwin');
execFileSync(process.execPath, ['scripts/ui/build-review.mjs', build], { stdio: 'inherit' });
const wrapper = `import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.resolve(appRoot, '../../../..');
process.env.RA2_UI_RESOURCE_ROOT ??= path.join(folder, 'RA2-HD-Yuri-Cameos-Resources');
process.env.RA2_DESKTOP_USER_DATA ??= path.join(folder, 'Yuri-Cameos-Review-Profile');
process.env.RA2_UI_REVIEW = '1';
await import('./main.mjs');
app.setName('RA2 HD Yuri Cameos E ${releaseTag}');
for (const window of BrowserWindow.getAllWindows()) window.setTitle('Red Alert 2 HD — Yuri Cameos E ${releaseTag}');
`;
await fs.writeFile(path.join(build, 'desktop/task-e-main.mjs'), wrapper);
const metadata = JSON.parse(await fs.readFile(path.join(build, 'package.json'), 'utf8'));
Object.assign(metadata, { main: 'desktop/task-e-main.mjs', version: '0.2.5', taskId: 'E',
    taskReview: `YURI-CAMEOS-E-${releaseTag}`, reviewMilestone: 'M1.8-UI' });
await fs.writeFile(path.join(build, 'package.json'), JSON.stringify(metadata));
const identity = JSON.parse(await fs.readFile(path.join(build, 'identity.json'), 'utf8'));
identity.files.push({ file: 'desktop/task-e-main.mjs', sha256: sha(Buffer.from(wrapper)) });
identity.files.find(item => item.file === 'package.json').sha256 = sha(Buffer.from(JSON.stringify(metadata)));
Object.assign(identity, { artStatus: 'NATIVE_GUIDED_BATCH_VISUAL_REVIEW_PENDING', taskId: 'E',
    nativeArchivesCopied: false, uiRevision: receipt.selection.revision, uiManifestSha256: receipt.manifestSha256 });
await fs.writeFile(path.join(build, 'identity.json'), JSON.stringify(identity, null, 2) + '\n');

await fs.mkdir(folder, { recursive: false });
const app = path.join(folder, `Red Alert 2 HD Yuri Cameos E ${releaseTag}.app`);
execFileSync('/usr/bin/ditto', [path.join(root, 'node_modules/electron/dist/Electron.app'), app]);
const executable = 'RA2 HD Yuri Cameos';
await fs.rename(path.join(app, 'Contents/MacOS/Electron'), path.join(app, 'Contents/MacOS', executable));
const payload = path.join(app, 'Contents/Resources/app'); await fs.mkdir(payload);
for (const name of ['dist', 'desktop', 'package.json']) await fs.cp(path.join(build, name), path.join(payload, name), { recursive: true });
await fs.copyFile(path.join(root, 'LICENSE'), path.join(payload, 'LICENSE'));
await fs.copyFile(path.join(root, 'node_modules/electron/LICENSE'), path.join(payload, 'ELECTRON-LICENSE'));
for (const [key, value] of Object.entries({ CFBundleIdentifier: `local.ra2hd.yuri.cameos.e.${releaseTag.toLowerCase()}`,
    CFBundleName: `RA2 HD Yuri Cameos E ${releaseTag}`, CFBundleDisplayName: `Red Alert 2 HD Yuri Cameos E ${releaseTag}`,
    CFBundleExecutable: executable, CFBundleShortVersionString: '0.2.5', CFBundleVersion: '25' }))
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, path.join(app, 'Contents/Info.plist')]);

const resources = path.join(folder, 'RA2-HD-Yuri-Cameos-Resources');
const packRelative = `ui-packs/${receipt.selection.revision}`;
await fs.mkdir(path.join(resources, packRelative), { recursive: true });
const manifestBytes = await fs.readFile(path.join(root, receipt.manifest));
assert.equal(sha(manifestBytes), receipt.manifestSha256);
const manifest = JSON.parse(manifestBytes), sourcePack = path.dirname(path.join(root, receipt.manifest));
const files = new Set(['manifest.json', ...manifest.assets.map(item => item.file),
    ...Object.values(manifest.menuVideo ?? {}).map(item => item.file)]);
const copied = [];
for (const name of files) {
    const source = path.join(sourcePack, name), destination = path.join(resources, packRelative, name);
    assert.equal(await fs.realpath(source), source);
    await fs.copyFile(source, destination);
    const bytes = await fs.readFile(source); assert.equal(sha(await fs.readFile(destination)), sha(bytes));
    copied.push({ file: path.join(packRelative, name), sha256: sha(bytes), bytes: bytes.length });
}
await fs.writeFile(path.join(resources, 'ui-selection.json'), JSON.stringify(receipt.selection, null, 2) + '\n');
const registered = await registerUiResources(resources, { review: true });
assert.equal(registered.selections.get('/local-ui/selection.json').assets.length, manifest.assets.length);
assert([...registered.routes.values()].every(file => file.startsWith(resources + path.sep)));
await fs.copyFile(path.join(production, 'Yuri-Cameos-Complete-Review.html'), path.join(folder, 'Yuri-Cameos-Complete-Review.html'));
await fs.copyFile(path.join(production, 'pack-delta.json'), path.join(folder, 'PACK-DELTA.json'));
const currentArtStatus = receipt.priorCanonicalVisualAcceptance
    ? 'All 31 cameos and 12 rank aliases remain accepted. The new full Yuri loading background awaits visual review.'
    : 'Other representative choices and final batch visual acceptance remain pending.';
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Task E ${releaseTag} — Yuri HD Cameos — macOS arm64 local review

Open Yuri-Cameos-Complete-Review.html for embedded Original/HD and representative comparisons.
Open Red Alert 2 HD Yuri Cameos E ${releaseTag}.app for the game review. Keep its UI resources beside it.
At first launch, choose an existing imported native profile containing ra2-core-manifest.json,
yr-core-manifest.json, assets and upstream-support. The existing ra2-hd/.local import is suitable.
Native game archives and accepted world resources are reused read-only, not copied into this delivery.
The UI pack and profile are independent. Existing apps, resources and profiles are preserved.
Choose Yuri's Revenge, then start a Yuri skirmish. UI density stays fixed at 4x.
The page compares all 31 pictures and retains the four original approvals for comparison.
Genetic Mutation uses its restored approved version; Lasher Tank has a longer cannon barrel.
The four requested object/material/activation corrections are included in the current selection.
${currentArtStatus} Windows is not tested.
PACK-DELTA.json describes additive integration; do not replace the evolving main catalog wholesale.
`);
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
const result = { schemaVersion: 1, taskId: 'E', build, app, executable, resources, folder,
    sourceHead: identity.head, uiRevision: receipt.selection.revision, uiManifestSha256: receipt.manifestSha256,
    copiedUiFiles: copied, nativeArchivesCopied: false, nativeProfile: 'Existing imported profile, read-only',
    review: path.join(folder, 'Yuri-Cameos-Complete-Review.html'), userAccepted: false,
    priorCanonicalVisualAcceptance: !!receipt.priorCanonicalVisualAcceptance, integration_status: 'NOT_MERGED' };
await fs.writeFile(path.join(production, 'delivery-receipt.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ app, resources, copiedUiFiles: copied.length, nativeArchivesCopied: false }));
