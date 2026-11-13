import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';

const [theater, receiptName, ...names] = process.argv.slice(2).filter(value => value !== '--admit');
assert(['TEMPERATE', 'SNOW', 'URBAN', 'DESERT', 'NEWURBAN'].includes(theater) && names.length);
assert(/^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..'), suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const file = path.join(root, `desktop/environment${suffix}-hd-contract.json`), before = readFileSync(file);
const contract = JSON.parse(before.toString()), selected = selectedPack('environment', theater), records = [];
for (const name of names) {
    const id = contract.identities.yr[name], family = contract.families[id], binding = selected.manifest.families[id];
    assert(family && binding && binding.familyHash === family.familyHash && !family.sourceScope, name);
    assert(!contract.identities.ra2[name] || contract.identities.ra2[name] === id, name);
    const members = [];
    for (const member of family.members) {
        const source = family.sourceOverrides?.[member] ?? contract.sources[member];
        const native = retailMember('ra2', member, source.sha256), image = new ShpFile(native.file);
        assert.deepEqual([image.width, image.height, image.numImages], [...source.canvas, source.totalFrames]);
        for (const palette of [source.palette, ...Object.values(source.framePalettes ?? {})] as any[]) {
            retailMember('ra2', palette.member, palette.sha256);
        }
        const selectedMember = binding.members.find((entry: any) => entry.member === member); assert(selectedMember);
        const filename = path.join(selected.directory, selectedMember.path), bytes = readFileSync(filename);
        assert.equal(sha256(bytes), selectedMember.sha256);
        const manifest = JSON.parse(bytes.toString()); assert.equal(manifest.source.sha256, source.sha256);
        assert.deepEqual(manifest.variants.map((variant: any) => variant.density).sort(), [2, 4]);
        for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const bytes = readFileSync(path.join(path.dirname(filename), String(variant.density), page.id, role + '.png'));
            assert.equal(sha256(bytes), page[role + 'Sha256']); assert.equal(bytes.length, page[role + 'Bytes']);
        }
        members.push({ member, sourceSha256: source.sha256, selectedManifestSha256: selectedMember.sha256,
            canvas: source.canvas, totalFrames: source.totalFrames, palette: source.palette, framePalettes: source.framePalettes ?? {} });
    }
    if (!family.editions.includes('ra2')) family.editions = [...family.editions, 'ra2'].sort();
    contract.identities.ra2[name] = id;
    records.push({ name, family: id, familyHash: family.familyHash, members,
        operation: 'ADMIT_SOURCE_PALETTE_GEOMETRY_IDENTICAL_COMPLETE_EXISTING_FAMILY' });
}
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n');
const admit = process.argv.includes('--admit');
if (admit) writeFileSync(file, after);
writeFileSync(path.resolve(root, '../project-history/ra2-campaign-completion-20261026', receiptName), JSON.stringify({
    status: admit ? 'PASS_COMPLETE_FAMILY_IDENTITY_AND_RA2_ADMISSION' : 'PASS_COMPLETE_FAMILY_IDENTITY_DRY_RUN', theater,
    contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after), selectedPack: contract.selectedPack,
    addedPayloadFiles: 0, replacedPayloadFiles: 0, records,
    qualification: 'Source and payload identity permit reuse. Actual native bindings, relevant states and user visual acceptance are measured separately.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ theater, names, admitted: admit, newArt: 0, overwrittenPayloads: 0 }));
