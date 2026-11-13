import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember, sha256 } from '../test-support/resources';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

const out = path.resolve(process.argv[2]), apply = process.argv.includes('--apply');
fs.mkdirSync(out, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const suffix = (theater: string) => theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const route = (theater: string) => `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`;
const qualificationFile = process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3] : '.artifacts/yr-campaign/formal-donor-qualification-r2/report.json';
const qualification = read(qualificationFile);
const inventory = read(qualification.inventory ?? '.artifacts/yr-campaign/art-inventory-r3/inventory.json');
const rows = new Map(inventory.rows.map((row: any) => [row.key, row]));
const environment = await registerEnvironmentResources('.local'), campaign = await validateCampaignResources('.local/campaign');
const profile = { routes: new Map([...environment.routes, ...campaign.routes]),
    selections: new Map([...environment.selections, ...campaign.selections]) };
await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
const contracts = new Map<string, any>(), changes = new Map<string, any>(), groups = new Map<string, any>();
const aliases = read('desktop/campaign-environment-aliases.json'), candidates: any[] = [], pending: any[] = [], existing: any[] = [];
const outputs: any[] = [];
const iso: Record<string, string> = { TEMPERATE: 'isotem.pal', SNOW: 'isosno.pal', URBAN: 'isourb.pal',
    NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal' };
const palette = (member: string, hash?: string) => {
    const value = retailMember('yr', member, hash);
    return { member, sha256: value.sha256, archive: value.source, bytes: 768 };
};
for (const candidate of qualification.qualified) {
    const row: any = rows.get(candidate.key);
    if (row.decision !== 'MISSING_AUTHORED_FAMILY' || row.theater === 'LUNAR'
        || !['building', 'terrain', 'overlay', 'infantry'].includes(row.kind)) continue;
    const key = row.theater + '/' + row.id, prior = groups.get(key);
    if (prior) {
        assert.deepEqual(prior.members.map((member: any) => member.source.sha256), candidate.members.map((member: any) => member.source.sha256));
        prior.missions = [...new Set([...prior.missions, ...candidate.missions])];
    } else groups.set(key, structuredClone(candidate));
}
for (const group of groups.values()) {
    const file = `desktop/environment${suffix(group.theater)}-hd-contract.json`;
    if (!contracts.has(file)) contracts.set(file, read(file));
    const contract = contracts.get(file), previous = contract.identities.yr?.[group.id];
    if (previous) { existing.push({ theater: group.theater, id: group.id, family: previous }); continue; }
    const family = `yr-reuse-${group.theater.toLowerCase()}-${group.id.toLowerCase().replace(/_/g, '-')}-v1`;
    assert(!contract.families[family] && !aliases.records.some((record: any) => record.identity === family));
    const members = [...new Map(group.members.map((member: any) => [member.source.member, member])).values()] as any[];
    const descriptors: Record<string, any> = {}, proofs: any[] = [], metadata: any[] = [], declarations: any[] = [];
    let mismatch: any;
    for (const member of members) {
        const donor = member.donor, native = donor.native;
        const selected = profile.selections.get(route(donor.theater))?.families[donor.family];
        const registered = selected?.members.find((entry: any) => entry.member === donor.member);
        assert.equal(registered?.sha256, donor.sha256);
        const originalFile = profile.routes.get(registered.manifest), originalBytes = fs.readFileSync(originalFile);
        assert.equal(sha256(originalBytes), donor.sha256);
        const original = JSON.parse(originalBytes.toString());
        const target = retailMember('yr', member.source.member, member.source.sha256), image = new ShpFile(target.file);
        const donorSource = retailMember('yr', donor.member, native.sha256), donorImage = new ShpFile(donorSource.file);
        assert.deepEqual([image.width, image.height, image.numImages], [...native.canvas, native.totalFrames]);
        assert.deepEqual([donorImage.width, donorImage.height, donorImage.numImages], [...native.canvas, native.totalFrames]);
        for (let frame = 0; frame < native.bodyFrames; frame++) {
            const a = image.images[frame], b = donorImage.images[frame];
            assert.deepEqual([a.x, a.y, a.width, a.height], [b.x, b.y, b.width, b.height]);
            assert.deepEqual(a.imageData, b.imageData, 'Complete original body indices must match the registered donor');
        }
        const targetPalette = palette(member.palette.member, member.palette.sha256);
        const framePalettes: Record<string, any> = {}, states: any[] = [];
        for (let frame = 0; frame < native.bodyFrames; frame++) {
            const from = native.framePalettes?.[frame] ?? native.palette;
            const rubble = group.kind === 'building' && member === members[0] && frame === 3 && native.bodyFrames === 4;
            const to = rubble ? { ...palette(iso[group.theater]), remapable: false, role: 'rubble', runtimeUsed: true }
                : { ...targetPalette, ...(native.framePalettes?.[frame] ?? {}) };
            if (rubble || native.framePalettes?.[frame]) framePalettes[frame] = to;
            const originalPalette = retailMember('yr', from.member, from.sha256).file.getBytes();
            const requestedPalette = retailMember('yr', to.member, to.sha256).file.getBytes();
            let compared = 0;
            for (const index of image.images[frame].imageData) {
                if (!index) continue;
                for (let channel = 0; channel < 3; channel++) if (originalPalette[index * 3 + channel] !== requestedPalette[index * 3 + channel]) {
                    mismatch = { member: member.source.member, frame, index, channel,
                        sourcePalette: from.member, targetPalette: to.member };
                }
                compared++;
            }
            states.push({ frame, originalPalette: from, targetPalette: to, comparedPixels: compared });
        }
        descriptors[member.source.member] = { ...native, sha256: target.sha256, palette: targetPalette,
            remapable: member.remapable ?? native.remapable,
            ...(Object.keys(framePalettes).length ? { framePalettes } : {}) };
        const name = family + '-' + member.source.member.replace(/\./g, '-') + '.json';
        const mission = group.missions.slice().sort()[0], prefix = `/local-campaign/yr/${mission.slice(0, -4)}/`;
        const next = { ...original, source: { ...original.source, member: member.source.member, theater: group.theater,
            sha256: target.sha256 },
            packId: 'yr-campaign-source-reuse', packRevision: 'yr-original-campaign-reuse-v1',
            reuse: { sourceFamily: donor.family, sourceMember: donor.member, sourceTheater: donor.theater,
                sourceManifestSha256: donor.sha256, policy: 'EXACT_ALL_NATIVE_STATE_COLORS_AND_COMPLETE_REGISTERED_PAGES' } };
        const bytes = encode(next);
        metadata.push({ mission, name, bytes });
        declarations.push({ member: member.source.member, sourceMember: donor.member, sourceTheater: donor.theater,
            sourceFamily: donor.family, sourceSha256: target.sha256, sourceManifestSha256: donor.sha256,
            manifest: prefix + name, sha256: sha256(bytes) });
        proofs.push({ member: member.source.member, sourceSha256: target.sha256, nativeFrames: image.numImages,
            bodyFrames: native.bodyFrames, sourceManifestSha256: donor.sha256, states });
        for (const variant of original.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const bytes = fs.readFileSync(profile.routes.get(registered.files[page[role]]));
            assert.equal(bytes.length, page[role + 'Bytes']); assert.equal(sha256(bytes), page[role + 'Sha256']);
        }
    }
    if (mismatch) { pending.push({ family, id: group.id, theater: group.theater, mismatch }); continue; }
    const campaignSources = group.missions.slice().sort().map((mission: string) => ({ edition: 'yr', mission,
        sha256: inventory.maps.find((map: any) => map.mission === mission).sourceSha256 }));
    for (const source of campaignSources) assert.equal(sha256(fs.readFileSync(
        profile.routes.get(`/local-campaign/yr/${source.mission.slice(0, -4)}/${source.mission}`))), source.sha256);
    const familyHash = sha256(encode({ theater: group.theater, identity: group.id, sources: descriptors }));
    contract.families[family] = { members: Object.keys(descriptors).sort(), identities: [group.id], editions: ['yr'],
        kinds: [group.kind], familyHash, sourceScope: { campaignSources }, sourceOverrides: descriptors };
    for (const [member, descriptor] of Object.entries(descriptors))
        if (!contract.sources[member]) contract.sources[member] = descriptor;
    contract.identities.yr[group.id] = family;
    aliases.records.push({ theater: group.theater, identity: family, familyHash,
        mode: 'EXACT_ALL_NATIVE_STATE_COLORS_AND_COMPLETE_REGISTERED_PAGES', sourcePolicy: 'complete-native-member-donors-v1',
        sourceTheater: declarations[0].sourceTheater, sourceFamily: declarations[0].sourceFamily, members: declarations });
    changes.set(file, contract);
    candidates.push({ family, id: group.id, theater: group.theater, familyHash, campaignSources, proofs });
    outputs.push(...metadata);
}
if (apply) {
    const manifests = new Map<string, any>();
    for (const value of outputs) {
        const folder = path.join('.local/campaign/yr', value.mission.slice(0, -4)), file = path.join(folder, 'manifest.json');
        const manifest = manifests.get(file) ?? read(file);
        assert(!fs.existsSync(path.join(folder, value.name)) && !manifest.files.some((entry: any) => entry.name === value.name));
        assert(manifest.files.length < 256);
        manifest.files.push({ name: value.name, bytes: value.bytes.length, sha256: sha256(value.bytes),
            route: `/local-campaign/yr/${value.mission.slice(0, -4)}/${value.name}` });
        manifests.set(file, manifest);
    }
    for (const value of outputs) fs.writeFileSync(path.join('.local/campaign/yr', value.mission.slice(0, -4), value.name), value.bytes, { flag: 'wx' });
    for (const [file, manifest] of manifests) fs.writeFileSync(file, encode(manifest));
    for (const [file, contract] of changes) fs.writeFileSync(file, encode(contract));
    fs.writeFileSync('desktop/campaign-environment-aliases.json', encode(aliases));
}
const report = { status: apply ? 'PASS_SOURCE_QUALIFIED_ALIASES_ADDED_NATIVE_BINDING_PENDING' : 'PASS_EXACT_COMPLETE_DONOR_PLAN',
    applied: apply, families: candidates, pending, existing,
    copiedPngFiles: 0, replacedAcceptedPayloads: 0,
    qualification: 'Every native body state, including the destination rubble palette, matches original used colors. New YR-only campaign-scoped identities reuse complete registered 2X/4X payloads. Existing identities are retained.' };
fs.writeFileSync(path.join(out, 'report.json'), encode(report));
console.log(JSON.stringify({ status: report.status, families: candidates.length, pending: pending.length,
    existing: existing.length, copiedPngFiles: 0, out }));
