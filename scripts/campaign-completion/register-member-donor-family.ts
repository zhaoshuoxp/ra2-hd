import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, requiredBytes, sha256 } from '../test-support/resources';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

// Combine complete native members from already registered, validated families.
// Geometry and every2X/4X page remain byte-identical; publication is all-or-none.
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), root = path.resolve(import.meta.dir, '../..');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const suffix = (theater: string) => theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const route = (theater: string) => `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
assert(/^(all|sov)\d{2}[tsu]\.map$/.test(plan.mission) && ['TEMPERATE', 'SNOW', 'URBAN'].includes(plan.theater));
assert(/^[a-z0-9-]+$/.test(plan.family) && /^[a-z0-9-]+\.json$/.test(plan.receipt));
assert(plan.members.length && new Set(plan.members.map((member: any) => member.member)).size === plan.members.length);
const archive = plan.mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix';
const archiveBytes = requiredBytes('assets/ra2/' + archive), imported = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString());
const importedArchive = imported.files.find((file: any) => file.virtualName === archive);
assert(importedArchive && importedArchive.sha256 === sha256(archiveBytes) && importedArchive.bytes === archiveBytes.length);
const map = parseMix(archiveBytes).openFile(plan.mission);
assert.equal(sha256(map.getBytes()), plan.sourceSha256);
assert.equal(new IniFile(map.readAsString()).getSection('Map')!.getString('Theater').toUpperCase(), plan.theater);
const environment = await registerEnvironmentResources(path.join(root, '.local'));
const campaign = await validateCampaignResources(path.join(root, '.local/campaign'));
const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
    selections: new Map([...environment.selections, ...campaign.selections]) };
await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
const file = path.join(root, `desktop/environment${suffix(plan.theater)}-hd-contract.json`), before = fs.readFileSync(file);
const contract = JSON.parse(before.toString()), aliasFile = path.join(root, 'desktop/campaign-environment-aliases.json');
const aliases = read(aliasFile), folder = path.join(root, '.local/campaign/ra2', plan.mission.slice(0, -4));
const missionFile = path.join(folder, 'manifest.json'), mission = read(missionFile);
const receipt = path.join(root, '../project-history/ra2-campaign-completion-20261026', plan.receipt);
assert(!contract.families[plan.family] && !fs.existsSync(receipt));
const previousIdentity = contract.identities.ra2[plan.identity];
const previous = previousIdentity && contract.families[previousIdentity];
const ownerCorrection = plan.renderingPolicy === 'native-building-house-palette-v1';
if (previousIdentity) {
    assert.equal(plan.replacesFamily, previousIdentity, 'An existing root requires its exact previous family identity');
    assert.deepEqual(previous.editions, ['ra2']);
    assert(previous.sourceScope?.campaignSources?.length, 'Preserve unrestricted accepted admissions');
    for (const member of previous.members) assert(plan.members.some((spec: any) => spec.member === member
        && (ownerCorrection || spec.sourceTheater === plan.theater && spec.sourceFamily === previousIdentity && spec.sourceMember === member)),
        'A complete dependency extension must retain every existing member and its canonical donor');
    if (ownerCorrection) assert.equal(plan.members.length, previous.members.length);
} else assert(!plan.replacesFamily);
assert(!ownerCorrection || previousIdentity);
assert(!aliases.records.some((alias: any) => alias.identity === plan.family));
const declarations: any[] = [], descriptors: Record<string, any> = {}, outputs: { name: string; bytes: Buffer }[] = [], evidence: any[] = [];
for (const spec of plan.members) {
    assert(['TEMPERATE', 'SNOW', 'URBAN'].includes(spec.sourceTheater));
    const sourceContract = read(path.join(root, `desktop/environment${suffix(spec.sourceTheater)}-hd-contract.json`));
    const family = sourceContract.families[spec.sourceFamily]; assert(family?.members.includes(spec.sourceMember));
    const native = family.sourceOverrides?.[spec.sourceMember] ?? sourceContract.sources[spec.sourceMember];
    assert(!Object.keys(native.framePalettes ?? {}).length, 'Mixed native palettes require explicit state-specific qualification');
    const source = retailMember('ra2', spec.sourceMember, native.sha256), target = retailMember('ra2', spec.member, native.sha256);
    assert(Buffer.from(source.file.getBytes()).equals(Buffer.from(target.file.getBytes())), 'Entire native member identity');
    const image = new ShpFile(target.file);
    assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
    const palette = retailMember('ra2', plan.theater === 'SNOW' ? 'unitsno.pal' : 'unittem.pal');
    const from = retailMember('ra2', native.palette.member, native.palette.sha256).file.getBytes(), to = palette.file.getBytes();
    let pixels = 0;
    for (const frame of image.images.slice(0, native.bodyFrames)) for (const index of frame.imageData) {
        if (!index) continue;
        for (const channel of [0, 1, 2]) assert.equal(from[index * 3 + channel], to[index * 3 + channel], 'Every used palette color');
        pixels++;
    }
    const selected = profile.selections.get(route(spec.sourceTheater))?.families[spec.sourceFamily];
    assert(selected && selected.familyHash === family.familyHash && selected.members.length === family.members.length);
    const member = selected.members.find((member: any) => member.member === spec.sourceMember); assert(member);
    const metadataFile = profile.routes.get(member.manifest); assert(metadataFile);
    const originalBytes = fs.readFileSync(metadataFile); assert.equal(sha256(originalBytes), member.sha256);
    const metadata = JSON.parse(originalBytes.toString()); assert.equal(metadata.source.sha256, target.sha256);
    assert.deepEqual(metadata.variants.map((variant: any) => variant.density).sort(), [2, 4]);
    for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
        const payload = profile.routes.get(member.files[page[role]]); assert(payload);
        const bytes = fs.readFileSync(payload);
        assert.equal(bytes.length, page[role + 'Bytes']); assert.equal(sha256(bytes), page[role + 'Sha256']);
    }
    const descriptor = { ...native, palette: { member: palette.file.filename, archive: palette.source, sha256: palette.sha256, bytes: 768 } };
    if (ownerCorrection) {
        const prior = previous.sourceOverrides?.[spec.member] ?? contract.sources[spec.member]; assert(prior);
        assert.deepEqual(descriptor, { ...prior, remapable: descriptor.remapable });
        assert(descriptor.remapable === prior.remapable || prior.remapable === false && descriptor.remapable === true);
    } else if (contract.sources[spec.member]) assert.deepEqual(contract.sources[spec.member], descriptor);
    descriptors[spec.member] = descriptor;
    const name = `${plan.family}-${spec.member.replace(/\./g, '-')}.json`;
    assert(!fs.existsSync(path.join(folder, name)) && !mission.files.some((file: any) => file.name === name));
    const next = { ...metadata, source: { ...metadata.source, member: spec.member, theater: plan.theater },
        packId: 'campaign-source-reuse', packRevision: plan.revision,
        reuse: { mode: 'EXACT_COMPLETE_SOURCE_WITH_MEMBER_DONORS', sourceFamily: spec.sourceFamily,
            sourceMember: spec.sourceMember, sourceTheater: spec.sourceTheater, sourceManifestSha256: member.sha256 } };
    const bytes = encode(next); outputs.push({ name, bytes });
    declarations.push({ ...spec, sourceSha256: target.sha256, sourceManifestSha256: member.sha256,
        manifest: `/local-campaign/ra2/${plan.mission.slice(0, -4)}/${name}`, sha256: sha256(bytes) });
    evidence.push({ ...spec, sourceSha256: target.sha256, totalFrames: image.numImages,
        bodyFrames: native.bodyFrames, comparedBodyPixels: pixels, sourceManifestSha256: member.sha256 });
}
const familyHash = sha256(encode({ descriptors, declarations, theater: plan.theater }));
const sourceOverrides: Record<string, any> = {};
for (const [member, descriptor] of Object.entries(descriptors)) {
    if (ownerCorrection && contract.sources[member] && JSON.stringify(contract.sources[member]) !== JSON.stringify(descriptor)) {
        sourceOverrides[member] = descriptor;
    } else contract.sources[member] = descriptor;
}
const sourceScope = structuredClone(previous?.sourceScope ?? { campaignSources: [] });
if (!sourceScope.campaignSources.some((pair: any) => pair.mission === plan.mission && pair.sha256 === plan.sourceSha256)) {
    sourceScope.campaignSources.push({ mission: plan.mission, sha256: plan.sourceSha256 });
}
contract.families[plan.family] = { members: plan.members.map((member: any) => member.member).sort(),
    identities: [plan.identity], editions: ['ra2'], kinds: ['building'], familyHash,
    sourceScope, ...(Object.keys(sourceOverrides).length ? { sourceOverrides } : {}) };
contract.identities.ra2[plan.identity] = plan.family;
aliases.records.push({ theater: plan.theater, identity: plan.family, familyHash, mode: 'EXACT_COMPLETE_SOURCE_WITH_MEMBER_DONORS',
    sourcePolicy: 'complete-native-member-donors-v1', sourceTheater: plan.members[0].sourceTheater,
    sourceFamily: plan.members[0].sourceFamily, members: declarations });
for (const output of outputs) mission.files.push({ name: output.name, bytes: output.bytes.length,
    sha256: sha256(output.bytes), route: `/local-campaign/ra2/${plan.mission.slice(0, -4)}/${output.name}` });
for (const output of outputs) fs.writeFileSync(path.join(folder, output.name), output.bytes, { flag: 'wx' });
fs.writeFileSync(missionFile, encode(mission)); fs.writeFileSync(file, encode(contract)); fs.writeFileSync(aliasFile, encode(aliases));
fs.writeFileSync(receipt, encode({ status: 'PASS_COMPLETE_NATIVE_MEMBER_PALETTE_AND_ACCEPTED_PAYLOAD_REUSE_NATIVE_PENDING',
    mission: plan.mission, sourceSha256: plan.sourceSha256, family: plan.family, familyHash, evidence,
    previousFamilyRetained: previousIdentity, preservedSourceScope: previous?.sourceScope,
    addedPngFiles: 0, replacedAcceptedPayloads: 0, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(encode(contract)),
    qualification: 'Complete family remains atomic; every native member and independent2X/4X page is source-qualified. No texture copy or new visual direction. Native bindings and user visual acceptance remain separate.' }), { flag: 'wx' });
console.log(JSON.stringify({ family: plan.family, members: declarations.map(member => member.member), addedPngFiles: 0 }));
