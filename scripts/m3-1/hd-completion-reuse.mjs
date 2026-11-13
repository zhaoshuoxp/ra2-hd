import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const resources = path.join(base, 'resources'), file = path.join(root, 'desktop/environment-urban-hd-contract.json');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const audit = await read(path.join(root, '.artifacts/m3-1/hd-coverage-20261024/coverage.json'));
const contract = await read(file), originalBytes = await fs.readFile(file);
assert.equal(await fs.realpath(resources), resources);
const pointerFile = path.join(resources, 'environment-urban-selection.json'), pointer = await read(pointerFile);
assert(!(await fs.lstat(pointerFile)).isSymbolicLink());
const old = path.join(resources, 'environment-packs', pointer.revision), oldBytes = await fs.readFile(path.join(old, 'manifest.json'));
assert.equal(hash(oldBytes), pointer.sha256);
const revision = 'urban-campaign-sov01-hd-r7-v1', output = path.join(resources, 'environment-packs', revision);
assert.equal(await fs.realpath(path.dirname(output)), path.dirname(output));
execFileSync('/bin/cp', ['-cR', old, output]);
const pack = JSON.parse(oldBytes.toString()); pack.revision = revision;
const records = [];
for (const row of audit.rows.filter(row => audit.sourceMatchedReuseCandidates.includes(row.name))) {
    const [theater, id] = row.compatibleCandidate.split(':');
    if (theater === 'URBAN') {
        const family = contract.families[id]; assert(family && pack.families[id]);
        const beforeEditions = [...family.editions];
        if (!family.editions.includes('ra2')) family.editions = [...family.editions, 'ra2'].sort();
        assert(!contract.identities.ra2[row.name] || contract.identities.ra2[row.name] === id);
        contract.identities.ra2[row.name] = id;
        records.push({ identity: row.name, family: id, operation: row.name === 'CIVBBP' ? 'ALREADY_REGISTERED_REQUIRES_TASK_FORCE_DEMAND' : 'ADMIT_HASH_IDENTICAL_RA2_SOURCE', beforeEditions });
        continue;
    }
    assert(['CIV1', 'CIV3'].includes(row.name));
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    const donorContract = await read(path.join(root, `desktop/environment${suffix}-hd-contract.json`));
    const donorPointer = await read(path.join(resources, `environment${suffix}-selection.json`));
    const donorRoot = path.join(resources, 'environment-packs', donorPointer.revision);
    const donorBytes = await fs.readFile(path.join(donorRoot, 'manifest.json')); assert.equal(hash(donorBytes), donorPointer.sha256);
    const donor = JSON.parse(donorBytes.toString()).families[id], family = donorContract.families[id];
    assert.equal(donor.members.length, 1);
    const binding = donor.members[0], donorFile = path.join(donorRoot, binding.path), bytes = await fs.readFile(donorFile);
    assert.equal(hash(bytes), binding.sha256);
    const source = structuredClone(family.sourceOverrides?.[row.source.member] ?? donorContract.sources[row.source.member]);
    assert.equal(source.sha256, row.source.sha256);
    assert.equal(source.palette.sha256, contract.sources['civ2.shp'].palette.sha256);
    source.palette = structuredClone(contract.sources['civ2.shp'].palette);
    const identity = 'campaign-sov01-' + row.name.toLowerCase(), target = path.join(output, 'members', row.name.toLowerCase() + '-shp');
    execFileSync('/bin/cp', ['-cR', path.dirname(donorFile), target]);
    const manifest = JSON.parse(bytes.toString()); manifest.source.theater = 'URBAN'; manifest.packRevision = revision;
    manifest.color.crossTheaterReuse = { sourceTheater: theater, family: id, manifestSha256: binding.sha256,
        sourceSha256: source.sha256, paletteSha256: source.palette.sha256, policy: 'Exact accepted base/data pages and native frame geometry; identical source and unit-palette bytes.' };
    const manifestFile = path.join(target, 'manifest.json'); await save(manifestFile, manifest);
    contract.sources[row.source.member] = source;
    const basis = { theater: 'URBAN', members: { [row.source.member]: source }, identities: [row.name] };
    const familyHash = hash(JSON.stringify(stable(basis)));
    contract.families[identity] = { members: [row.source.member], identities: [row.name], editions: ['ra2'], kinds: ['infantry'], familyHash,
        sourceScope: { campaignSourceSha256s: [audit.originalMap.sha256] } };
    contract.identities.ra2[row.name] = identity;
    pack.families[identity] = { familyHash, members: [{ member: row.source.member, path: path.relative(output, manifestFile), sha256: hash(await fs.readFile(manifestFile)) }] };
    let pages = 0;
    for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const content = await fs.readFile(path.join(target, String(variant.density), page.id, role + '.png'));
        assert.equal(content.length, page[role + 'Bytes']); assert.equal(hash(content), page[role + 'Sha256']); pages++;
    }
    records.push({ identity: row.name, family: identity, operation: 'SOURCE_AND_PALETTE_IDENTICAL_OTHER_THEATER_REUSE', donorTheater: theater,
        donorFamily: id, donorManifestSha256: binding.sha256, verifiedUnchangedPages: pages });
}
await save(path.join(output, 'manifest.json'), pack);
const selected = { schemaVersion: 1, revision, sha256: hash(await fs.readFile(path.join(output, 'manifest.json'))) };
contract.selectedPack = selected;
await save(file, contract); await save(pointerFile, selected);
// Extract accepted texels for the authoring style reference; these are not new artwork.
for (const identity of ['CAWA2C', 'CAWA2D']) {
    const id = contract.identities.ra2[identity], binding = pack.families[id].members[0];
    const manifestFile = path.join(output, binding.path), manifest = await read(manifestFile), variant = manifest.variants.find(v => v.density === 4);
    const frame = variant.frames.find(f => f.nativeFrame === 0), page = variant.pages.find(p => p.id === frame.page);
    const atlas = PNG.sync.read(await fs.readFile(path.join(path.dirname(manifestFile), '4', page.id, 'base.png')));
    const [left, top, width, height] = frame.contentRect, crop = new PNG({ width, height });
    PNG.bitblt(atlas, crop, left, top, width, height, 0, 0);
    await fs.writeFile(path.join(base, identity.toLowerCase() + '-accepted-style.png'), PNG.sync.write(crop));
}
const receipt = { status: 'PASS_23_SOURCE_MATCHED_CANDIDATES_REGISTERED_WITH_UNCHANGED_ACCEPTED_TEXELS', previousContractSha256: hash(originalBytes),
    previousPack: pointer, selectedPack: selected, resources, canonicalSelectorsChanged: false, records,
    boundary: 'Registration and complete byte reuse only. Final native binding, state coverage and user visual acceptance remain required.' };
await save(path.join(base, 'reuse-receipt.json'), receipt);
console.log(JSON.stringify({ status: receipt.status, identities: records.length, selected }));
