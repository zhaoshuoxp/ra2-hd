import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { requiredBytes, retailMember, selectedPack, sha256 } from '../test-support/resources';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

const [mission, theater, nativeReport, receiptName, ...names] = process.argv.slice(2);
assert(/^(sov|all)\d{2}[tsu]\.map$/.test(mission) && names.length);
assert(['TEMPERATE', 'SNOW', 'URBAN'].includes(theater) && /^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..');
const receipt = path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName);
assert(!fs.existsSync(receipt), 'Reuse receipts are immutable');
const archive = mission.startsWith('sov') ? 'maps02.mix' : 'maps01.mix', archiveBytes = requiredBytes('assets/ra2/' + archive);
const imported = JSON.parse(requiredBytes('ra2-campaign-manifest.json').toString()).files
    .find((entry: any) => entry.virtualName === archive);
assert(imported && imported.sha256 === sha256(archiveBytes) && imported.bytes === archiveBytes.length);
const map = parseMix(archiveBytes, archive).openFile(mission), sourceSha256 = sha256(map.getBytes());
assert.equal(new IniFile(map.readAsString()).getSection('Map')!.getString('Theater').toUpperCase(), theater);
const native = JSON.parse(fs.readFileSync(nativeReport, 'utf8'));
assert.equal(native.status, 'PASS_NATIVE_ORIGINAL_SOURCE_RESOURCE_INVENTORY_NOT_COVERAGE_ACCEPTANCE');
assert.equal(native.world.missionSourceSha256, sourceSha256);
const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
const file = path.join(root, `desktop/environment${suffix}-hd-contract.json`), before = fs.readFileSync(file);
const contract = JSON.parse(before.toString()), selected = selectedPack('environment', theater), records = [];
const aliasFile = path.join(root, 'desktop/campaign-environment-aliases.json');
const aliasData = JSON.parse(fs.readFileSync(aliasFile, 'utf8')), aliases = aliasData.records;
let registered: any;
async function registeredFamily(identity: string) {
    if (!registered) {
        const environment = await registerEnvironmentResources(path.join(root, '.local'));
        const campaign = await validateCampaignResources(path.join(root, '.local/campaign'));
        registered = { ...environment, routes: new Map([...environment.routes, ...campaign.routes]) };
        await registerCampaignEnvironmentResources(registered);
        await registerCampaignEnvironmentAliases(registered);
    }
    const entry = registered.selections.get(`/local-environment${suffix ? '/' + theater.toLowerCase() : ''}/selection.json`)
        ?.families[identity];
    assert(entry, 'The canonical registrar must validate the complete existing donor');
    return { familyHash: entry.familyHash, members: entry.members.map((member: any) => {
        const file = registered.routes.get(member.manifest); assert(file);
        const payloads = Object.fromEntries(Object.entries(member.files).map(([name, route]) => {
            const filename = registered.routes.get(route); assert(filename); return [name, filename];
        }));
        return { member: member.member, sha256: member.sha256, path: file, payloads };
    }) };
}
for (const name of names) {
    const donorId = contract.identities.ra2[name] ?? contract.identities.yr[name], donor = contract.families[donorId];
    assert(donor && donor.members.length && (donor.editions.includes('yr')
        || donor.sourceScope?.campaignSources?.length || donor.sourceScope?.campaignSourceSha256s?.length), name);
    assert(!contract.identities.ra2[name] || donor.sourceScope, 'Do not narrow an accepted unrestricted admission');
    const fork = !contract.identities.ra2[name], id = fork ? `campaign-${mission.slice(0, 5)}-${name.toLowerCase()}` : donorId;
    assert(!fork || !contract.families[id], 'Use a new bounded alias identity');
    const family = fork ? { ...structuredClone(donor), editions: ['ra2'], identities: [name], sourceScope: { campaignSources: [] } } : donor;
    assert(family.members.includes(native.rows.find((row: any) => row.name === name)?.member));
    let entry = selected.manifest.families[donorId];
    if (!entry) entry = await registeredFamily(donorId);
    assert.equal(entry?.familyHash, family.familyHash); assert.equal(entry.members.length, family.members.length);
    const members = [];
    for (const member of family.members) {
        const source = family.sourceOverrides?.[member] ?? contract.sources[member];
        const original = retailMember('ra2', member, source.sha256), image = new ShpFile(original.file);
        assert.deepEqual([image.width, image.height, image.numImages], [...source.canvas, source.totalFrames]);
        for (const palette of [source.palette, ...Object.values(source.framePalettes ?? {})] as any[]) {
            retailMember('ra2', palette.member, palette.sha256);
        }
        const binding = entry.members.find((item: any) => item.member === member); assert(binding);
        const filename = path.isAbsolute(binding.path) ? binding.path : path.join(selected.directory, binding.path);
        const bytes = fs.readFileSync(filename);
        assert.equal(sha256(bytes), binding.sha256);
        const metadata = JSON.parse(bytes.toString()); assert.equal(metadata.source.sha256, source.sha256);
        assert.equal(metadata.source.theater, theater); assert.equal(metadata.logical.frames.length, source.bodyFrames);
        assert.deepEqual(metadata.variants.map((variant: any) => variant.density).sort(), [2, 4]);
        for (const variant of metadata.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
            const flat = path.join(path.dirname(filename), page[role]);
            const payload = fs.readFileSync(binding.payloads?.[page[role]] ?? (fs.existsSync(flat) ? flat
                : path.join(path.dirname(filename), String(variant.density), page.id, role + '.png')));
            assert.equal(payload.length, page[role + 'Bytes']); assert.equal(sha256(payload), page[role + 'Sha256']);
        }
        members.push({ member, sourceSha256: source.sha256, palette: source.palette,
            framePalettes: source.framePalettes ?? {}, totalFrames: source.totalFrames, manifestSha256: binding.sha256 });
    }
    if (fork) {
        const bindings = members.map(member => ({ member: member.member, sourceSha256: member.sourceSha256,
            sourceManifestSha256: member.manifestSha256, sha256: member.manifestSha256 }));
        aliases.push({ theater, identity: id, familyHash: family.familyHash, sourceTheater: theater, sourceFamily: donorId,
            ...(bindings.length === 1 ? bindings[0] : { members: bindings }),
            mode: 'EXACT_NATIVE_SOURCE_PALETTE_AND_COMPLETE_CONTEXT', sourceSamplingDifferences: [] });
        contract.families[id] = family;
    }
    if (family.sourceScope?.campaignSourceSha256s) {
        const original = parseMix(requiredBytes('assets/ra2/maps02.mix')).openFile('sov01t.map');
        const originalHash = sha256(original.getBytes());
        assert(family.sourceScope.campaignSourceSha256s.every((hash: string) => hash === originalHash));
        family.sourceScope = { campaignSources: [{ mission: 'sov01t.map', sha256: originalHash }] };
    }
    const scope = family.sourceScope ??= { campaignSources: [] };
    assert(Array.isArray(scope.campaignSources), 'Legacy scopes require explicit migration before extension');
    if (!scope.campaignSources.some((pair: any) => pair.mission === mission && pair.sha256 === sourceSha256)) {
        scope.campaignSources.push({ mission, sha256: sourceSha256 });
    }
    if (!family.editions.includes('ra2')) family.editions = [...family.editions, 'ra2'].sort();
    contract.identities.ra2[name] = id;
    records.push({ identity: name, family: id, donor: donorId, familyHash: family.familyHash, members });
}
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n'); fs.writeFileSync(file, after);
fs.writeFileSync(aliasFile, JSON.stringify(aliasData, null, 2) + '\n');
fs.writeFileSync(receipt, JSON.stringify({ status: 'PASS_COMPLETE_SOURCE_QUALIFIED_CAMPAIGN_ADMISSION_NATIVE_BINDINGS_PENDING',
    mission, sourceSha256, theater, nativeReport, records, contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after),
    addedPngFiles: 0, replacedPayloadFiles: 0,
    qualification: 'Every member, palette, state and independent density page is verified. Only exact mission/hash pairs gain admission; all donor pixels, YR scope, geometry, timing, whole-group fallback and budgets remain unchanged.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ mission, identities: names, addedPngFiles: 0, replacedPayloadFiles: 0 }));
