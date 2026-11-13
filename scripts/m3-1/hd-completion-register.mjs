import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const resources = path.join(base, 'resources'), contractFile = path.join(root, 'desktop/environment-urban-hd-contract.json');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async file => hash(await fs.readFile(file));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
assert.equal(await fs.realpath(resources), resources);
const pointerFile = path.join(resources, 'environment-urban-selection.json'), previous = await read(pointerFile);
const reuse = await read(path.join(base, 'reuse-receipt.json'));
assert.deepEqual(previous, reuse.selectedPack);
const old = path.join(resources, 'environment-packs', previous.revision);
assert.equal(await sha(path.join(old, 'manifest.json')), previous.sha256);
const contract = await read(contractFile), priorContractHash = await sha(contractFile);
const revision = 'urban-campaign-sov01-hd-r7-clean-r2', output = path.join(resources, 'environment-packs', revision);
await fs.access(output).then(() => assert.fail('Immutable output already exists'), error => assert.equal(error.code, 'ENOENT'));
execFileSync('/bin/cp', ['-cR', old, output]);
const pack = await read(path.join(output, 'manifest.json')); pack.revision = revision;
const newRoot = path.join(resources, 'environment-packs/urban-campaign-sov01-new-art-r7-clean-r2');
const newPack = await read(path.join(newRoot, 'manifest.json')), newContract = await read(path.join(base, 'new-shp-contract.json'));
const records = [];
for (const [identity, family] of Object.entries(newContract.families)) {
    assert(!contract.families[identity] && !pack.families[identity]);
    assert.equal(family.familyHash, newPack.families[identity].familyHash);
    for (const binding of newPack.families[identity].members) {
        const source = path.join(newRoot, binding.path), destination = path.join(output, binding.path);
        assert.equal(await sha(source), binding.sha256);
        await fs.access(path.dirname(destination)).then(() => assert.fail('Member collision'), error => assert.equal(error.code, 'ENOENT'));
        execFileSync('/bin/cp', ['-cR', path.dirname(source), path.dirname(destination)]);
    }
    contract.families[identity] = family; pack.families[identity] = newPack.families[identity];
    for (const name of family.identities) {
        assert(!contract.identities.ra2[name]); contract.identities.ra2[name] = identity;
    }
    for (const member of family.members) {
        assert(!contract.sources[member]); contract.sources[member] = newContract.sources[member];
    }
    records.push({ family: identity, identities: family.identities, operation: 'NEW_COMPLETE_NATIVE_SHP_FAMILY' });
}
const exports = await read(path.join(base, 'vxl-final/exports.json'));
assert.equal(exports.status, 'PASS_COMPLETE_INDEPENDENT_2X_4X_EXPORTS_NATIVE_PENDING');
for (const identity of ['CRUISE', 'TUG', 'PDPLANE']) {
    assert(!contract.vxl[identity]);
    const variants = [];
    for (const row of exports.records.filter(row => row.identity === identity)) {
        assert.equal(await sha(row.manifest), row.sha256);
        const manifest = await read(row.manifest);
        assert.equal(manifest.identity, identity); assert.equal(manifest.theater, 'URBAN');
        assert.equal(manifest.density, row.density);
        variants.push({ hash: row.sha256, density: row.density, path: path.relative(resources, row.manifest) });
    }
    assert.deepEqual(variants.map(v => v.density), [2, 4]);
    contract.vxl[identity] = { hash: variants[1].hash, path: variants[1].path,
        members: [identity.toLowerCase() + '.vxl'], authoringTheater: 'URBAN', theaters: ['URBAN'], variants };
    records.push({ identity, operation: 'NEW_NATIVE_VXL_COMPLETE_EIGHT_HEADINGS_BOTH_DENSITIES', variants });
}
await save(path.join(output, 'manifest.json'), pack);
const selected = { schemaVersion: 1, revision, sha256: await sha(path.join(output, 'manifest.json')) };
contract.selectedPack = selected;
await save(contractFile, contract); await save(pointerFile, selected);
await save(path.join(base, 'registration-receipt.json'), { status: 'PASS_29_IDENTITIES_REGISTERED_NATIVE_REVIEW_PENDING',
    resources, reusedIdentities: reuse.records.length, newShpFamilies: 3, newVxlFamilies: 3, records,
    previousPack: previous, selectedPack: selected, previousContractSha256: priorContractHash,
    contractSha256: await sha(contractFile), sharedSelectorsChanged: false,
    retainedArtwork: ['TUG', 'PDPLANE'], nativeValidation: 'PENDING', userVisualAcceptance: 'PENDING' });
console.log(JSON.stringify({ registeredIdentities: reuse.records.length + 6, selected }));
