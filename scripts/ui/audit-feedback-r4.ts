import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const work = path.resolve(process.argv[2]);
const load = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = (file: string) => digest(fs.readFileSync(file));
const protectedInputs = load(path.join(work, 'protected-resources.json'));
for (const row of protectedInputs.files.concat(protectedInputs.protectedFiles)) assert.equal(sha(row.file), row.sha256, row.file);
const sourceFiles = ['src/gui/NativeUiImage.ts', 'src/engine/renderable/entity/PipOverlay.ts',
    'src/engine/renderable/entity/HdHealthArt.ts', 'src/gui/UiObjectSprite.ts',
    'src/gui/screen/mainMenu/component/MainMenu.ts', 'desktop/buildup-art-final.json'];
for (const file of sourceFiles) assert.equal(sha(file), digest(execFileSync('git', ['show', '95d6f9e9:' + file])), file);
const before = load(path.join(work, 'base-allied-unit-contracts.json'));
const current = load('desktop/allied-unit-contracts.json');
for (const category of Object.keys(before)) {
    if (category !== 'shp') assert.deepEqual(current[category], before[category]);
    else for (const identity of Object.keys(before.shp)) if (identity !== 'E1') assert.deepEqual(current.shp[identity], before.shp[identity]);
}
const oldFamilyFile = path.join('.local', before.shp.E1.familyPath);
assert.equal(sha(oldFamilyFile), before.shp.E1.familyHash);
const familyFile = path.join('.local', current.shp.E1.familyPath), family = load(familyFile);
assert.equal(sha(familyFile), current.shp.E1.familyHash);
const oldRoot = '.local/hd-packs/allied-gi-authored/animation-r9';
const newRoot = path.join('.local/hd-packs', family.members[0].packId, family.members[0].revision);
const oldManifest = load(path.join(oldRoot, 'manifest.json')), newManifest = load(path.join(newRoot, 'manifest.json'));
assert.equal(sha(path.join(oldRoot, 'manifest.json')), before.shp.E1.members[0].manifestHash);
assert.equal(sha(path.join(newRoot, 'manifest.json')), family.members[0].sha256);
assert.deepEqual(newManifest.source, oldManifest.source); assert.deepEqual(newManifest.logical, oldManifest.logical);
for (const variant of newManifest.variants) {
    const previous = oldManifest.variants.find((v: any) => v.density === variant.density);
    assert.deepEqual(variant.frames, previous.frames);
    for (const page of variant.pages) for (const role of ['base', 'data']) assert.equal(sha(path.join(newRoot, page[role])), page[role + 'Sha256']);
}
const oldPrepared = load(path.join(work, 'base-prepared-contract.json')), prepared = load('desktop/prepared-hd-contract.json');
const oldIndex = load(path.join('.local', oldPrepared.indexPath)), index = load(path.join('.local', prepared.indexPath));
assert.equal(sha(path.join('.local', oldPrepared.indexPath)), oldPrepared.sha256);
assert.equal(sha(path.join('.local', prepared.indexPath)), prepared.sha256);
for (const [key, value] of Object.entries(oldIndex.members)) assert.deepEqual(index.members[key], value);
const additions = Object.keys(index.members).filter(key => !oldIndex.members[key]);
assert.deepEqual(additions, [family.members[0].sha256]);
for (const density of ['2', '4']) for (const [id, value] of Object.entries(index.members[additions[0]][density]) as [string, any][]) {
    assert.equal(sha(path.join('.local/prepared-hd', additions[0], density, id + '.bin')), value.sha256);
}
const report = { status: 'PASS_PROTECTED_INPUTS_AND_BOUNDED_R4_RESOURCE_DELTA',
    protectedResourceReferences: protectedInputs.files.length, protectedSourceFiles: sourceFiles,
    acceptedConstructionRecords: 108, preservedNonE1Units: true, oldE1FamilyPreserved: true,
    nativeGiSourceAndLogicalFrames: 'UNCHANGED', giDeathFrames: load(path.join(work, 'gi-death-registration.json')).corrections,
    preparedIndex: prepared, preparedIndexAdditions: additions, priorPreparedEntriesPreserved: Object.keys(oldIndex.members).length,
    sourceMovieSha256: sha('.local/ui-packs/yuri-emblem-ui-v1/menu-original.webm'),
    foregroundMaskSha256: sha('public/res/presentation/menu-retail-foreground-r4.png'),
    selectedGiFamily: current.shp.E1 };
fs.writeFileSync(path.join(work, 'resource-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, protected: report.protectedResourceReferences, preparedAdditions: additions.length }));
