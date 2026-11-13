import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const [output, inventoryFile] = process.argv.slice(2), out = path.resolve(output);
fs.mkdirSync(out, { recursive: false });
const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
const palettes: Record<string, string> = { TEMPERATE: 'isotem.pal', SNOW: 'isosno.pal', URBAN: 'isourb.pal',
    NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal', LUNAR: 'isolun.pal' };
const files = new Map<string, TmpFile>(), colors = new Map<string, Uint8Array>();
const file = (member: string, hash: string) => {
    const key = member + '/' + hash;
    if (!files.has(key)) {
        let found;
        for (const edition of ['yr', 'ra2'] as const) {
            try { found = retailMember(edition, member, hash); break; } catch { /* Inspect the other pinned edition. */ }
        }
        assert(found, 'A source-pinned original member is required: ' + key); files.set(key, new TmpFile(found.file));
    }
    return files.get(key)!;
};
const palette = (theater: string) => {
    if (!colors.has(theater)) colors.set(theater, retailMember('yr', palettes[theater]).file.getBytes());
    return colors.get(theater)!;
};
const describe = (source: TmpFile, index: number, theater: string) => {
    const image = source.images[index];
    if (!image) return undefined;
    const metadata = nativeTerrainMetadata(source, index), draw = new TmpDrawable().draw(image, source.blockWidth, source.blockHeight);
    assert.deepEqual([draw.width, draw.height], metadata.logical);
    const rgba = Buffer.alloc(draw.data.length * 4), pal = palette(theater);
    for (let i = 0; i < draw.data.length; i++) {
        const value = draw.data[i]; if (!value) continue;
        rgba[i * 4] = pal[value * 3]; rgba[i * 4 + 1] = pal[value * 3 + 1];
        rgba[i * 4 + 2] = pal[value * 3 + 2]; rgba[i * 4 + 3] = 255;
    }
    const renderGeometry = [metadata.block, metadata.logical, metadata.offset, metadata.height,
        metadata.hasExtraData, metadata.hasZData, ...(image.hasExtraData
            ? [[image.extraX - image.x, image.extraY - image.y], image.extraWidth, image.extraHeight] : [])];
    const digest = createHash('sha256').update(JSON.stringify(renderGeometry)).update(rgba)
        .update(image.zData ?? new Uint8Array()).digest('hex');
    return { signature: digest, metadata, renderedNativeRgbaSha256: sha256(rgba),
        nativeDepthSha256: image.zData ? sha256(image.zData) : null };
};
const donors = new Map<string, any[]>(), selections: any[] = [];
for (const theater of Object.keys(palettes)) {
    const selected = selectedPack('terrain', theater);
    selections.push({ theater, revision: selected.manifest.revision,
        sha256: sha256(fs.readFileSync(path.join(selected.directory, 'manifest.json'))) });
    for (const group of selected.manifest.groups) for (const member of group.members) {
        const hash = member.sourceHashes.yr ?? member.sourceHashes.ra2, original = file(member.member, hash);
        for (let index = 0; index < original.images.length; index++) {
            const frame = describe(original, index, theater); if (!frame) continue;
            assert.equal(JSON.stringify(frame.metadata), JSON.stringify(member.images[index]));
            const list = donors.get(frame.signature) ?? [];
            let offset = index;
            for (const previous of group.members) { if (previous === member) break; offset += previous.images.length; }
            list.push({ theater, revision: selected.manifest.revision, group: group.id, member: member.member,
                sourceSha256: hash, subTile: index, ...frame,
                ...(group.contourReconstruction ? { contourReconstruction: group.contourReconstruction } : {}),
                variants: group.variants.map((variant: any) => ({ density: variant.density, file: variant.file,
                    sha256: variant.sha256, size: variant.size, rect: variant.rects[offset] })) });
            donors.set(frame.signature, list);
        }
    }
}
const complete: any[] = [], partial: any[] = [], unresolved: any[] = [], empty: any[] = [];
for (const row of inventory.rows.filter((row: any) => row.kind === 'tmp' && row.decision === 'MISSING_AUTHORED_FAMILY')) {
    const original = file(row.source.member, row.source.sha256), frames: any[] = [];
    if (original.emptySlots.length === original.width * original.height && original.images.every(image => !image)) {
        empty.push({ key: row.key, theater: row.theater, member: row.source.member, sourceSha256: row.source.sha256,
            grid: [original.width, original.height], emptySlots: original.emptySlots, missions: Object.keys(row.usage) });
        continue;
    }
    for (let index = 0; index < original.images.length; index++) {
        const frame = describe(original, index, row.theater); assert(frame, 'Mixed empty source containers need separate qualification');
        const options = [...(donors.get(frame.signature) ?? [])];
        const rank = (donor: any) => Number(donor.theater !== row.theater) * 8
            + Number(donor.member.split('.')[0] !== row.source.member.split('.')[0]) * 4
            + Number(donor.subTile !== index) * 2 + Number(donor.sourceSha256 !== row.source.sha256);
        options.sort((a, b) => rank(a) - rank(b) || a.member.localeCompare(b.member) || a.subTile - b.subTile);
        frames.push({ subTile: index, ...frame, donor: options[0], compatibleDonors: options.length });
    }
    const found = frames.filter(frame => frame.donor).length;
    const record = { key: row.key, theater: row.theater, member: row.source.member, sourceSha256: row.source.sha256,
        set: row.set, setName: row.setName, missions: Object.keys(row.usage), frames, covered: found, required: frames.length };
    (found === frames.length ? complete : found ? partial : unresolved).push(record);
}
const report = { schema: 'yr-source-qualified-native-subtile-donors-v1',
    status: 'READ_ONLY_CANDIDATES_ALL_TARGET_SUBTILES_REQUIRED_BEFORE_PUBLICATION',
    inventory: { file: path.resolve(inventoryFile), sha256: sha256(fs.readFileSync(inventoryFile)) }, selections,
    policy: 'Every rendered original pixel, alpha sample, render footprint, used extra geometry, height and depth byte must match an accepted donor subtile. Original target grid, ordinals, headers, gameplay/radar fields and source hash remain independent. All target subtiles must qualify before a complete resource group can publish. Candidate discovery does not establish atlas, seam, runtime or visual acceptance.',
    complete, partial, unresolved, empty, runtimeSelectionsChanged: 0 };
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ complete: complete.length, partial: partial.length, unresolved: unresolved.length,
    originalEmptyContainers: empty.length, runtimeSelectionsChanged: 0, out }));
