// Verify combined registration and accepted resource pins without preparing new payloads.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHdResources, expectedHdAvailabilityKeys } from '../../desktop/hd-profile.mjs';
import { validateProfile } from '../../desktop/profile.mjs';
import catalog from '../../desktop/yuri-unit-contracts.json' with { type: 'json' };
import prepared from '../../desktop/prepared-hd-contract.json' with { type: 'json' };

const root = path.resolve(process.argv[2] ?? '.local');
const output = path.resolve(process.argv[3]);
const uiRoot = path.resolve(process.argv[4] ?? root);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => digest(await fs.readFile(file));
const closure = JSON.parse(await fs.readFile('docs/task-c-conversation-handoff-20261005.json'));
const revisionArg = process.argv.find(arg => arg.startsWith('--revisions='));
const revisions = revisionArg ? JSON.parse(await fs.readFile(revisionArg.slice('--revisions='.length))) : [];
const uiRevisionArg = process.argv.find(arg => arg.startsWith('--ui-revision='));
const uiRevision = uiRevisionArg ? JSON.parse(await fs.readFile(uiRevisionArg.slice('--ui-revision='.length))) : undefined;
const buildingCatalog = { ...JSON.parse(await fs.readFile('desktop/yuri-building-coverage.json')),
    ...JSON.parse(await fs.readFile('desktop/allied-building-coverage.json')) };
const transfer = JSON.parse(await fs.readFile('docs/yuri-units-main-merge-manifest.json'));
process.env.RA2_UI_RESOURCE_ROOT = uiRoot;
const events = [], hd = await registerHdResources(root, event => events.push(event));
const native = await validateProfile(root);
assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
for (const [name, value] of Object.entries(hd.availability)) {
    if (name === 'sovietUnits') continue;
    assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), name);
}
for (const entry of closure.yuriSelections) {
    assert.equal(await sha(path.join(root, entry.familyPath)), entry.familyHash);
    assert(hd.selections.has(`/local-hd/${entry.selection}-selection.json`));
}
for (const revision of revisions) {
    const selected = buildingCatalog[revision.selection];
    assert.equal(selected.familyPath, revision.selectedFamily);
    assert.equal(selected.familyHash, revision.selectedSha256);
    assert.equal(await sha(path.join(root, selected.familyPath)), selected.familyHash);
    assert(hd.selections.has(`/local-hd/${revision.selection}-selection.json`));
}
for (const entry of closure.yuriSelections) {
    if (!revisions.some(revision => revision.selection === entry.selection))
        assert.equal(buildingCatalog[entry.selection].familyHash, entry.familyHash);
}
for (const entry of transfer.resources) {
    const file = path.join(root, entry.path);
    assert.equal((await fs.stat(file)).size, entry.bytes);
    assert.equal(await sha(file), entry.sha256, entry.path);
}
for (const entry of Object.values(catalog.shp)) {
    const selection = hd.selections.get(`/local-hd/${entry.selection}-selection.json`);
    assert(selection && !selection.members.some(member => member.prepared), entry.identity);
}
for (const entry of Object.values(catalog.vxl)) for (const variant of entry.variants)
    assert(hd.routes.has(`/local-vxl/${variant.hash}/manifest.json`));
const ui = hd.selections.get('/local-ui/selection.json');
const uiSelection = uiRevision?.selection ?? closure.uiSelection;
if (uiRevision) {
    assert.equal(uiRevision.previousRevision, closure.uiSelection.revision);
    assert.equal(uiRevision.previousSha256, closure.uiSelection.sha256);
    assert.deepEqual(uiRevision.changedAssets, ['yuri-radar-base.png']);
    const previous = JSON.parse(await fs.readFile(path.join(uiRoot, 'ui-packs', uiRevision.previousRevision, 'manifest.json')));
    for (const asset of previous.assets) {
        const current = ui.assets.find(entry => entry.id === asset.id);
        assert(current);
        if (asset.id === 'yuri-radar-base') {
            assert.equal(current.sha256, uiRevision.radarSha256);
            assert.deepEqual({ ...current, sha256: asset.sha256 }, asset);
        } else assert.deepEqual(current, asset);
    }
}
assert.equal(ui.revision, uiSelection.revision);
assert.equal(ui.assets.length, 490);
assert.equal(await sha(path.join(uiRoot, 'ui-packs', ui.revision, 'manifest.json')), uiSelection.sha256);
if (!revisionArg) assert.deepEqual(prepared, closure.preparedContract);
assert.equal(await sha(path.join(root, prepared.indexPath)), prepared.sha256);
const proofPath = path.join(root, 'prepared-hd/proofs', `${prepared.sha256}.json`);
const proof = JSON.parse(await fs.readFile(proofPath));
assert.equal(proof.indexSha256, prepared.sha256);
const registration = events.find(event => event.type === 'prepared-hd-registered');
assert(registration && registration.members === 459 && registration.pages > 0);
if (!revisionArg) assert.equal(registration.pages, 1224);
// The merged resolver only adds unit classification. None of the prepared
// building member/hash contracts can match that new classification.
let buildingBindings = 0;
for (const [route, selection] of hd.selections) {
    if (!route.startsWith('/local-hd/') || selection.rulesIdentity) continue;
    for (const member of selection.members ?? (selection.sha256 ? [selection] : [])) {
        if (!member.prepared) continue;
        const manifest = JSON.parse(await fs.readFile(hd.routes.get(`/local-hd/${member.sha256}/manifest.json`)));
        assert(!Object.values(catalog.shp).some(family => family.members.some(unit =>
            unit.member === manifest.source.member && unit.sourceHash === manifest.source.sha256)));
        buildingBindings++;
    }
}
assert.equal(buildingBindings, 459);
const selected = new Map([...native.routes.values(), ...hd.routes.values()].map(file => [file, true]));
selected.set(path.join(root, prepared.indexPath), true);
selected.set(proofPath, true);
const files = [];
for (const file of [...selected.keys()].sort()) {
    const stat = await fs.stat(file);
    files.push({ file, bytes: stat.size, sha256: await sha(file) });
}
const report = { status: 'PASS_COMBINED_RESOURCE_AUTHORITY_AND_PREPARED_COMPATIBILITY', root, uiRoot,
    cEntries: closure.yuriSelections.length, dRuntimeFiles: transfer.selectedResourceCount,
    dRuntimeBytes: transfer.selectedResourceBytes, uiRevision: ui.revision, uiEntries: ui.assets.length,
    uiManifestSha256: uiSelection.sha256, uiRevision, preparedContract: prepared, preparedRegistration: registration,
    preparedInvalidation: revisionArg ? 'REGENERATED_FOR_SELECTED_VISUAL_FEEDBACK_REVISIONS'
        : 'NOT_REQUIRED_UNCHANGED_BUILDING_CLASSIFICATION_AND_PINNED_PAYLOADS',
    revisions,
    unitPreparation: 'EXCLUDED', availability: hd.availability, events, routes: hd.routes.size, files };
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, cEntries: report.cEntries, uiEntries: report.uiEntries,
    dRuntimeFiles: report.dRuntimeFiles, prepared: registration, routes: report.routes, files: files.length }));
