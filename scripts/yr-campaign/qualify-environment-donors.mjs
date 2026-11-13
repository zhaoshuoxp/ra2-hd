import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const inventoryFile = path.resolve(process.argv[3] ?? '.artifacts/yr-campaign/art-inventory-r7/inventory.json');
const inventory = await read(inventoryFile);
const profile = await registerEnvironmentResources('.local'), campaign = await validateCampaignResources('.local/campaign');
for (const [route, file] of campaign.routes) profile.routes.set(route, file);
for (const [route, value] of campaign.selections) profile.selections.set(route, value);
const registrations = [];
await registerCampaignEnvironmentResources(profile, row => registrations.push(row));
await registerCampaignEnvironmentAliases(profile, row => registrations.push(row));
const donors = [], contracts = new Map();
for (const [route, selection] of profile.selections) {
    if (!route.startsWith('/local-environment') || !route.endsWith('/selection.json')) continue;
    const theater = route === '/local-environment/selection.json' ? 'TEMPERATE' : route.split('/')[2].toUpperCase();
    const contract = await read(`desktop/environment${theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase()}-hd-contract.json`);
    contracts.set(theater, contract);
    for (const [family, descriptor] of Object.entries(selection.families)) for (const member of descriptor.members) {
        const declared = contract.families[family];
        assert.equal(descriptor.familyHash, declared.familyHash);
        const native = declared.sourceOverrides?.[member.member] ?? contract.sources[member.member];
        const file = profile.routes.get(member.manifest), bytes = await fs.readFile(file);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), member.sha256);
        const manifest = JSON.parse(bytes);
        assert.equal(manifest.source.sha256, native.sha256);
        assert.deepEqual(manifest.variants.map(variant => variant.density).sort(), [2, 4]);
        donors.push({ theater, family, member: member.member, native, manifest: member.manifest,
            sha256: member.sha256, file, files: member.files, logical: manifest.logical });
    }
}
const primary = new Map();
for (const donor of donors) {
    const values = primary.get(donor.native.sha256) ?? [];
    values.push(donor); primary.set(donor.native.sha256, values);
}
const qualified = [], unresolved = [];
for (const row of inventory.rows) {
    if (row.kind === 'tmp' || row.decision === 'INTENTIONAL_NATIVE_EXCEPTION') continue;
    const members = [{ source: row.source, palette: row.palette, hasShadow: row.hasShadow, remapable: row.remapable },
        ...row.dependencies.map(item => ({ ...item, remapable: item.remapable ?? row.remapable }))];
    if (members.some(item => !item.source?.sha256 || !item.source?.member || !item.palette?.sha256)) continue;
    const choices = members.map(item => {
        const matches = (primary.get(item.source.sha256) ?? []).filter(donor =>
            donor.native.palette?.sha256 === item.palette.sha256
            && donor.native.hasShadow === item.hasShadow && donor.native.remapable === item.remapable
            && JSON.stringify(donor.native.canvas) === JSON.stringify(item.source.canvas)
            && donor.native.totalFrames === item.source.totalFrames);
        const exact = matches.find(donor => donor.theater === row.theater && donor.member === item.source.member);
        return { source: item.source, palette: item.palette, donor: exact ?? matches[0] };
    });
    const result = { key: row.key, theater: row.theater, kind: row.kind, id: row.id,
        missions: Object.keys(row.usage), members: choices };
    if (choices.every(item => item.donor)) qualified.push(result);
    else unresolved.push({ ...result, members: choices.filter(item => !item.donor) });
}
const report = { schema: 'yr-formal-environment-donor-qualification-v1',
    status: 'EXACT_SOURCE_PALETTE_GEOMETRY_AND_STATE_CANDIDATES; RUBBLE_PALETTES_BINDING_AND_NATIVE_REVIEW_REQUIRED',
    policy: 'Only complete families published by current formal registrations are inspected. Candidates require exact source hash, palette hash, native canvas, total frames, shadow and remap policy for every member. No payload is copied or replaced.',
    inventory: inventoryFile, donors: donors.length, qualified, unresolved, registrations,
    remaining: 'Building rubble palette, original frame identity and complete actor binding require qualification before aliases are published.' };
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ donors: donors.length, completeCandidates: qualified.length,
    missingRowsWithCandidate: qualified.filter(row => inventory.rows.find(item => item.key === row.key).decision === 'MISSING_AUTHORED_FAMILY').length,
    unresolved: unresolved.length, out }));
