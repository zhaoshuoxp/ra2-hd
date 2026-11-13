import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ShpFile } from '../../src/data/ShpFile';
import { TmpFile } from '../../src/data/TmpFile';
import { retailMember, selectedPack } from '../test-support/resources';
import { registerEnvironmentResources } from '../../desktop/environment-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';

const out = path.resolve(process.argv[2]);
const inventoryFile = path.resolve(process.argv[3] ?? '.artifacts/yr-campaign/art-inventory-r7/inventory.json');
fs.mkdirSync(out, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const inventory = read(inventoryFile);
const palettes = new Map<string, Uint8Array>(), signatures = new Map<string, string>();
const palette = (member: string, hash?: string) => {
    const key = member + '/' + hash;
    if (!palettes.has(key)) palettes.set(key, retailMember('yr', member, hash).file.getBytes());
    return palettes.get(key)!;
};
const iso: Record<string, string> = { TEMPERATE: 'isotem.pal', SNOW: 'isosno.pal', URBAN: 'isourb.pal',
    NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal', LUNAR: 'isolun.pal' };
const resolved = (member: string, hash?: string) => {
    for (const edition of ['yr', 'ra2'] as const) {
        try { return retailMember(edition, member, hash); } catch { /* Inspect the other pinned edition. */ }
    }
    throw Error('No pinned original source: ' + member + '/' + hash);
};
const colors = (data: Uint8Array, pal: Uint8Array, owner = false, shadow = false) => {
    const bytes = Buffer.alloc(data.length * 4);
    for (let i = 0; i < data.length; i++) {
        const index = data[i], offset = i * 4;
        if (!index) continue;
        if (shadow) { bytes[offset] = index; bytes[offset + 3] = 255; }
        else if (owner && index >= 16 && index <= 31) {
            bytes[offset] = index - 16; bytes[offset + 3] = 254;
        } else {
            bytes[offset] = pal[index * 3]; bytes[offset + 1] = pal[index * 3 + 1];
            bytes[offset + 2] = pal[index * 3 + 2]; bytes[offset + 3] = 255;
        }
    }
    return bytes;
};
const tmpSignature = (member: string, hash: string, theater: string) => {
    const key = 'tmp/' + hash + '/' + theater;
    if (signatures.has(key)) return signatures.get(key)!;
    const image = new TmpFile(resolved(member, hash).file), digest = createHash('sha256');
    digest.update(JSON.stringify([image.width, image.height, image.blockWidth, image.blockHeight, image.emptySlots]));
    for (const frame of image.images) {
        if (!frame) { digest.update('empty'); continue; }
        digest.update(JSON.stringify([frame.x, frame.y, ...(frame.hasExtraData ? [frame.extraX, frame.extraY, frame.extraWidth,
            frame.extraHeight] : []), frame.height, frame.hasZData, frame.hasExtraData]));
        digest.update(colors(frame.tileData, palette(iso[theater])));
        digest.update(frame.zData ?? new Uint8Array());
        digest.update(colors(frame.extraData ?? new Uint8Array(), palette(iso[theater])));
    }
    const value = digest.digest('hex'); signatures.set(key, value); return value;
};
const shpSignature = (source: any, theater: string, rubble: boolean) => {
    const key = JSON.stringify(['shp', source, theater, rubble]);
    if (signatures.has(key)) return signatures.get(key)!;
    const image = new ShpFile(resolved(source.member, source.sha256).file), digest = createHash('sha256');
    const body = source.bodyFrames ?? (source.hasShadow ? image.numImages / 2 : image.numImages);
    assert(Number.isInteger(body));
    digest.update(JSON.stringify([image.width, image.height, image.numImages, body, !!source.hasShadow]));
    for (const [index, frame] of image.images.entries()) {
        const pal = source.framePalettes?.[index]
            ?? (rubble && index === 3 && body === 4 ? { member: iso[theater], remapable: false } : source.palette);
        const shadow = index >= body;
        digest.update(JSON.stringify([frame.x, frame.y, frame.width, frame.height]));
        digest.update(colors(frame.imageData, palette(pal.member, pal.sha256),
            pal.remapable ?? source.remapable, shadow));
    }
    const value = digest.digest('hex'); signatures.set(key, value); return value;
};

const terrainDonors = new Map<string, any[]>();
for (const theater of Object.keys(iso)) {
    const { manifest } = selectedPack('terrain', theater);
    for (const group of manifest.groups) for (const member of group.members) {
        const sourceHash = member.sourceHashes.yr ?? member.sourceHashes.ra2;
        const signature = tmpSignature(member.member, sourceHash, theater);
        const rows = terrainDonors.get(signature) ?? [];
        rows.push({ theater, revision: manifest.revision, group: group.id, member: member.member,
            sourceHash, signature }); terrainDonors.set(signature, rows);
    }
}
const profile = await registerEnvironmentResources('.local');
const campaign = await validateCampaignResources('.local/campaign');
for (const [route, file] of campaign.routes) profile.routes.set(route, file);
for (const [route, selection] of campaign.selections) profile.selections.set(route, selection);
await registerCampaignEnvironmentResources(profile); await registerCampaignEnvironmentAliases(profile);
const shpDonors = new Map<string, any[]>();
for (const theater of Object.keys(iso)) {
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    const file = `desktop/environment${suffix}-hd-contract.json`;
    if (!fs.existsSync(file)) continue;
    const contract = read(file);
    const selection = profile.selections.get(`/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`);
    for (const [family, selected] of Object.entries<any>(selection?.families ?? {})) {
        const declared = contract.families[family];
        if (!declared || selected.familyHash !== declared.familyHash) continue;
        for (const member of selected.members) {
            const native = declared.sourceOverrides?.[member.member] ?? contract.sources[member.member];
            if (!native) continue;
            const kinds = declared.kinds ?? [];
            const rubble = kinds.includes('building') && native.bodyFrames >= 4 && !!native.framePalettes?.[3];
            const signature = shpSignature({ ...native, member: member.member }, theater, rubble);
            const rows = shpDonors.get(signature) ?? [];
            rows.push({ theater, family, member: member.member, native, manifest: member.manifest,
                sha256: member.sha256, signature }); shpDonors.set(signature, rows);
        }
    }
}
const qualified: any[] = [], unresolved: any[] = [];
for (const row of inventory.rows.filter((row: any) => row.decision === 'MISSING_AUTHORED_FAMILY')) {
    if (row.kind === 'tmp') {
        const signature = tmpSignature(row.source.member, row.source.sha256, row.theater);
        const choices = terrainDonors.get(signature) ?? [];
        const donor = choices.find((item: any) => item.theater === row.theater) ?? choices[0];
        (donor ? qualified : unresolved).push({ key: row.key, theater: row.theater, id: row.id,
            kind: row.kind, source: row.source, donor, signature, missions: Object.keys(row.usage) });
        continue;
    }
    const members = [{ source: row.source, palette: row.palette, hasShadow: row.hasShadow, remapable: row.remapable },
        ...row.dependencies.map((item: any) => ({ ...item, remapable: item.remapable ?? row.remapable }))];
    if (row.kind === 'vehicle' || members.some((item: any) => !item.source?.sha256 || !item.palette?.member)) {
        unresolved.push({ key: row.key, id: row.id, theater: row.theater, kind: row.kind, reason: 'Separate unit pipeline or absent native source' });
        continue;
    }
    const choices = members.map((item: any, index: number) => {
        const signature = shpSignature({ ...item.source, palette: item.palette,
            hasShadow: item.hasShadow, remapable: item.remapable }, row.theater, row.kind === 'building' && index === 0);
        const donors = shpDonors.get(signature) ?? [];
        return { source: item.source, palette: item.palette, hasShadow: item.hasShadow, remapable: item.remapable,
            signature, donor: donors.find((item: any) => item.theater === row.theater) ?? donors[0] };
    });
    (choices.every((item: any) => item.donor) ? qualified : unresolved).push({ key: row.key, theater: row.theater,
        id: row.id, kind: row.kind, members: choices, missions: Object.keys(row.usage) });
}
const report = { schema: 'yr-complete-decoded-source-reuse-v1', inventory: inventoryFile,
    status: 'READ_ONLY_EXACT_DECODED_APPEARANCE_GEOMETRY_STATE_AND_SHADOW_CANDIDATES',
    policy: 'All native slots, body colors, owner shade indices, shadow data and geometry must match. TMP depth and visible extra geometry must also match. Target gameplay fields, unused header values and radar colors remain source-owned. Owner flags compare their actual pixel semantics. Different source bytes remain independently pinned; no payload, source or selection is modified.',
    qualified, unresolved };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const frameCache = new Map<string, any[]>(), frameDonors = new Map<string, any[]>();
const bodySignatures = (native: any, theater: string, rubble: boolean) => {
    const key = JSON.stringify([native, theater, rubble]);
    if (frameCache.has(key)) return frameCache.get(key)!;
    const image = new ShpFile(resolved(native.member, native.sha256).file);
    const body = native.bodyFrames ?? (native.hasShadow ? image.numImages / 2 : image.numImages);
    const frames = image.images.slice(0, body).map((frame, index) => {
        const pal = native.framePalettes?.[index]
            ?? (rubble && index === 3 && body === 4 ? { member: iso[theater], remapable: false } : native.palette);
        const digest = createHash('sha256');
        digest.update(JSON.stringify([image.width, image.height, frame.x, frame.y, frame.width, frame.height]));
        digest.update(colors(frame.imageData, palette(pal.member, pal.sha256), pal.remapable ?? native.remapable));
        return { frame: index, signature: digest.digest('hex') };
    });
    frameCache.set(key, frames); return frames;
};
for (const donor of [...shpDonors.values()].flat()) {
    for (const frame of bodySignatures({ ...donor.native, member: donor.member }, donor.theater, false)) {
        const matches = frameDonors.get(frame.signature) ?? [];
        matches.push({ ...donor, sourceFrame: frame.frame }); frameDonors.set(frame.signature, matches);
    }
}
const completeFrames: any[] = [], partialFrames: any[] = [];
for (const row of inventory.rows.filter((row: any) => row.decision === 'MISSING_AUTHORED_FAMILY' && row.kind === 'building')) {
    const members = [{ source: row.source, palette: row.palette, hasShadow: row.hasShadow, remapable: row.remapable },
        ...row.dependencies.map((item: any) => ({ ...item, remapable: item.remapable ?? row.remapable }))];
    if (members.some((item: any) => !item.source?.sha256 || !item.palette?.member)) continue;
    const choices = members.map((item: any, index: number) => ({ member: item.source.member,
        sourceSha256: item.source.sha256, frames: bodySignatures({ ...item.source, palette: item.palette,
            hasShadow: item.hasShadow, remapable: item.remapable }, row.theater, index === 0).map(frame => {
            const donors = frameDonors.get(frame.signature) ?? [];
            const donor = donors.find((donor: any) => donor.theater === row.theater && donor.sourceFrame === frame.frame)
                ?? donors.find((donor: any) => donor.sourceFrame === frame.frame) ?? donors[0];
            return { ...frame, donor };
        }) }));
    const result = { key: row.key, theater: row.theater, id: row.id, members: choices, missions: Object.keys(row.usage) };
    if (choices.every((member: any) => member.frames.every((frame: any) => frame.donor))) completeFrames.push(result);
    else if (choices.some((member: any) => member.frames.some((frame: any) => frame.donor))) partialFrames.push(result);
}
fs.writeFileSync(path.join(out, 'frame-qualification.json'), JSON.stringify({
    schema: 'yr-exact-native-body-frame-donors-v1', status: 'READ_ONLY_CANDIDATES_NOT_PUBLISHED',
    policy: 'Each body state independently matches native canvas, trim, exact original RGB and owner-shade semantics. Target native shadows remain source-owned. Existing HD pages require a separate complete transaction and original target metadata before any publication.',
    inventory: inventoryFile, completeFrames, partialFrames }, null, 2) + '\n');
console.log(JSON.stringify({ qualified: qualified.length, unresolved: unresolved.length,
    completeFrameFamilies: completeFrames.length, partialFrameFamilies: partialFrames.length,
    kinds: Object.fromEntries([...new Set(qualified.map(row => row.kind))].map(kind =>
        [kind, qualified.filter(row => row.kind === kind).length])), out }));
