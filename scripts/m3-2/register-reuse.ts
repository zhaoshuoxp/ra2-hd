// Extend edition admission only after complete native source/palette verification.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
const root = path.resolve(import.meta.dir, '../..'), file = path.join(root, 'desktop/environment-hd-contract.json');
const before = readFileSync(file), contract = JSON.parse(before.toString()), selected = selectedPack('environment');
const names = ['CIVBFM', 'CIVBF', 'CIVBTM', 'GASAND', 'CAMIAM06', 'CAMIAM05', 'CAMIAM07', 'CAHSE06', 'CAUSFGL', 'CAHSE04'];
const records = [];
for (const name of names) {
    const id = contract.identities.yr[name], family = contract.families[id], binding = selected.manifest.families[id];
    assert(family && binding && binding.familyHash === family.familyHash && !family.sourceScope);
    assert(!contract.identities.ra2[name] || contract.identities.ra2[name] === id);
    const members = [];
    for (const member of family.members) {
        const source = family.sourceOverrides?.[member] ?? contract.sources[member], native = retailMember('ra2', member, source.sha256);
        const image = new ShpFile(native.file);
        assert.deepEqual([image.width, image.height, image.numImages], [...source.canvas, source.totalFrames]);
        for (const palette of [source.palette, ...Object.values(source.framePalettes ?? {})] as any[]) retailMember('ra2', palette.member, palette.sha256);
        const selectedMember = binding.members.find((entry: any) => entry.member === member); assert(selectedMember);
        const filename = path.join(selected.directory, selectedMember.path), bytes = readFileSync(filename);
        assert.equal(sha256(bytes), selectedMember.sha256);
        const manifest = JSON.parse(bytes.toString()); assert.equal(manifest.source.sha256, source.sha256);
        assert.deepEqual(manifest.variants.map((variant: any) => variant.density).sort(), [2, 4]);
        for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const bytes = readFileSync(path.join(path.dirname(filename), String(variant.density), page.id, role + '.png'));
            assert.equal(sha256(bytes), page[role + 'Sha256']); assert.equal(bytes.length, page[role + 'Bytes']);
        }
        members.push({ member, sourceSha256: source.sha256, selectedManifestSha256: selectedMember.sha256 });
    }
    if (!family.editions.includes('ra2')) family.editions = [...family.editions, 'ra2'].sort();
    contract.identities.ra2[name] = id; records.push({ name, family: id, members, operation: 'ADMIT_SOURCE_PALETTE_GEOMETRY_IDENTICAL_EXISTING_ART' });
}
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n'); writeFileSync(file, after);
writeFileSync(path.resolve(root, '../project-history/m3-2-first-batch-20261025/reused-resources.json'), JSON.stringify({
    status: 'PASS_COMPLETE_FAMILY_SOURCE_AND_PAYLOAD_IDENTITY', contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after),
    selectedPack: contract.selectedPack, addedPayloadFiles: 0, replacedPayloadFiles: 0, records,
}, null, 2) + '\n');
console.log(JSON.stringify({ admitted: names, newArt: 0, overwrittenPayloads: 0 }));
