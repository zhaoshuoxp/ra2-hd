// Copy the validated app unchanged and refresh only the isolated review sidecar.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerUiResources } from '../../../desktop/ui-profile.mjs';

const root = process.cwd(), previousFile = path.resolve(process.argv[2]);
const production = path.resolve(process.argv[3]), folder = path.resolve(process.argv[4]);
const previous = JSON.parse(await fs.readFile(previousFile, 'utf8'));
const exported = JSON.parse(await fs.readFile(path.join(production, 'export-receipt.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await fs.readFile(path.join(root, exported.manifest));
assert.equal(sha(manifestBytes), exported.manifestSha256);
const manifest = JSON.parse(manifestBytes);
const oldBytes = await fs.readFile(path.join(previous.resources, `ui-packs/${previous.uiRevision}/manifest.json`));
assert.equal(sha(oldBytes), previous.uiManifestSha256);
const old = JSON.parse(oldBytes);
assert.equal(manifest.assets.length, old.assets.length);
const changed = [];
for (const entry of manifest.assets) {
    const prior = old.assets.find(item => item.id === entry.id);
    assert(prior, `Unexpected new identity: ${entry.id}`);
    if (JSON.stringify(entry) !== JSON.stringify(prior)) changed.push(entry.id);
}
assert.deepEqual(changed, ['psyricon.shp']);
await fs.mkdir(folder, { recursive: false });
const app = path.join(folder, path.basename(previous.app));
execFileSync('/usr/bin/ditto', [previous.app, app]);
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const resources = path.join(folder, 'RA2-HD-Yuri-Cameos-Resources');
const packRelative = `ui-packs/${exported.selection.revision}`;
const source = path.dirname(path.join(root, exported.manifest));
await fs.mkdir(path.join(resources, packRelative), { recursive: true });
const copiedUiFiles = [];
const files = new Set(['manifest.json', ...manifest.assets.map(item => item.file),
    ...Object.values(manifest.menuVideo ?? {}).map(item => item.file)]);
for (const name of files) {
    const bytes = await fs.readFile(path.join(source, name));
    const destination = path.join(resources, packRelative, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
    assert.equal(sha(await fs.readFile(destination)), sha(bytes));
    copiedUiFiles.push({ file: path.join(packRelative, name), sha256: sha(bytes), bytes: bytes.length });
}
await fs.writeFile(path.join(resources, 'ui-selection.json'), JSON.stringify(exported.selection, null, 2) + '\n');
const registered = await registerUiResources(resources, { review: true });
assert.equal(registered.selections.get('/local-ui/selection.json').assets.length, 473);
assert([...registered.routes.values()].every(file => file.startsWith(resources + path.sep)));
for (const [sourceName, targetName] of [['Yuri-Cameos-Complete-Review.html', 'Yuri-Cameos-Complete-Review.html'],
    ['pack-delta.json', 'PACK-DELTA.json']]) await fs.copyFile(path.join(production, sourceName), path.join(folder, targetName));
await fs.writeFile(path.join(folder, 'START-HERE.txt'), `Task E R2 — Psychic Reveal black-fog correction

30 canonical images and their 12 rank aliases are user accepted. Psychic Reveal awaits review.
Open Yuri-Cameos-Complete-Review.html for native/HD comparisons.
The app is an unchanged signed copy of the validated R1 binary and retains its R1 display name.
Keep RA2-HD-Yuri-Cameos-Resources beside it; this R2 sidecar selects ${exported.selection.revision}.
Choose the existing imported native profile at first launch. No native archives were copied.
The profile is isolated. The R1 app, sidecar, review, approvals and main selection remain intact.
The full R1 runtime matrix is retained; this revision needs only the changed power binding check.
Windows and combined-build checks remain NOT_RUN; integration remains NOT_MERGED.
`);
const receipt = { ...previous, schemaVersion: 2, folder, app, resources,
    review: path.join(folder, 'Yuri-Cameos-Complete-Review.html'), copiedUiFiles,
    uiRevision: exported.selection.revision, uiManifestSha256: exported.manifestSha256,
    previousDeliveryReceipt: previousFile, binary: 'UNCHANGED_SIGNED_R1_COPY_NO_REBUILD',
    changedIdentities: changed, acceptedCanonicalCount: 30, pendingVisualIdentities: changed, userAccepted: false };
await fs.writeFile(path.join(production, 'delivery-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ app, resources, changedIdentities: changed, copiedUiFiles: copiedUiFiles.length }));
