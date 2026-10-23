// Compare rendered native members across all accepted Temperate names, including aliases.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const [output] = process.argv.slice(2);
assert(output, 'Expected a new audit receipt');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const pointer = read('.local/terrain-selection.json');
const donorFile = join('.local/terrain-packs', pointer.revision, 'manifest.json');
assert.equal(sha(readFileSync(donorFile)), pointer.sha256);
const donor = read(donorFile);
assert.equal(donor.theater, 'TEMPERATE');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map((['ra2', 'yr'] as const).map(edition => [edition, editionRetailTree(top, edition)]));
const palettes = new Map((['ra2', 'yr'] as const).map(edition => [edition,
    new Palette(resolveMember(trees.get(edition)!, 'isotem.pal').file)]));
function geometry(metadata: any) {
    // Radar colors and terrain/ramp rules remain target-owned. Only visible geometry is reused.
    return [metadata.subTile, metadata.grid, metadata.block, metadata.logical, metadata.offset,
        metadata.origin, metadata.height, metadata.hasExtraData,
        metadata.hasExtraData ? metadata.extra : null, metadata.hasZData];
}
const donors: any[] = [];
for (const group of donor.groups) for (const member of group.members) {
    const seen = new Set<string>();
    for (const edition of ['yr', 'ra2'] as const) {
        const pin = member.sourceHashes[edition];
        if (!pin || seen.has(pin)) continue;
        seen.add(pin);
        const tree = trees.get(edition)!;
        if (!tree.some(owner => owner.mix.containsFile(member.member))) continue;
        const file = resolveMember(tree, member.member).file;
        const bytes = file.getBytes();
        assert.equal(sha(bytes), pin);
        const tmp = new TmpFile(file), offsets = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const frames = tmp.images.flatMap((image, slot) => {
            if (!image || offsets.getInt32(16 + slot * 4, true) <= 0) return [];
            const metadata = nativeTerrainMetadata(tmp, slot);
            const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
            const rgba = new Uint8Array(bitmap.data.length * 4);
            bitmap.data.forEach((index, pixel) => {
                const color = palettes.get(edition)!.colors[index];
                rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
            });
            return [{ geometry: geometry(metadata), rgba: sha(rgba), z: image.zData ? sha(image.zData) : null }];
        });
        donors.push({ member: member.member, group: group.id, edition, sourceSha256: pin,
            geometry: sha(JSON.stringify(frames.map(row => row.geometry))),
            rendered: sha(JSON.stringify(frames.map(row => [row.geometry, row.rgba]))),
            depth: sha(JSON.stringify(frames.map(row => row.z))) });
    }
}
const rows: any[] = [], sources: any[] = [];
for (const [theater, batch] of [['NEWURBAN', 74], ['DESERT', 75]] as const) {
    const name = theater.toLowerCase();
    const inventoryFile = `.artifacts/m2-4/inventory-${name}-after-batch${batch}-v1/inventory.json`;
    const inventory = read(inventoryFile), root = `.artifacts/m2-4/${name}-native-v1`;
    const guideFile = join(root, 'source.json'), guide = read(guideFile);
    const selected = read(`.local/terrain-${name}-selection.json`);
    const selectedMembers = new Set(read(join('.local/terrain-packs', selected.revision, 'manifest.json'))
        .groups.flatMap((group: any) => group.members.map((row: any) => row.member)));
    sources.push({ theater, inventoryFile, inventorySha256: sha(readFileSync(inventoryFile)),
        guideFile, guideSha256: sha(readFileSync(guideFile)), selected });
    for (const missing of inventory.resourceGroups.filter((row: any) => row.kind === 'tmp'
        && row.decisions.includes('MISSING_AUTHORED_FAMILY') && !selectedMembers.has(row.member))) {
        const source = guide.sources.find((row: any) => row.member === missing.member && row.sha256 === missing.sha256);
        assert(source);
        const bytes = readFileSync(join(root, 'native', source.nativeFile));
        assert.equal(sha(bytes), source.sha256);
        const tmp = new TmpFile(resolveMember(trees.get('yr')!, source.member).file);
        assert.equal(sha(tmp.sourceBytes!), source.sha256);
        const frames = source.images.filter((image: any) => image.nativeOffset > 0).map((image: any) => {
            assert.equal(sha(readFileSync(join(root, 'native', image.file))), image.rgbaSha256);
            return { geometry: geometry(image), rgba: image.rgbaSha256,
                z: tmp.images[image.subTile].zData ? sha(tmp.images[image.subTile].zData!) : null };
        });
        const rendered = sha(JSON.stringify(frames.map((row: any) => [row.geometry, row.rgba])));
        const shape = sha(JSON.stringify(frames.map((row: any) => row.geometry)));
        const depth = sha(JSON.stringify(frames.map((row: any) => row.z)));
        rows.push({ theater, member: source.member, set: source.setIndex, sourceSha256: source.sha256,
            exactVisibleAndDepthMatches: donors.filter(donor => donor.rendered === rendered && donor.depth === depth),
            geometryOnlyCandidates: donors.filter(donor => donor.geometry === shape && donor.rendered !== rendered),
            targetRulesRemainNative: true });
    }
}
const reusable = rows.filter(row => row.exactVisibleAndDepthMatches.length);
writeFileSync(output, JSON.stringify({ schema: 'm2-4-cross-name-temperate-visible-tmp-audit-v1',
    status: 'AUDIT_ONLY_NO_SELECTION_CHANGE', donor: pointer, donorSourceCount: donors.length, sources, rows,
    reusableMembers: reusable.map(({ theater, member, exactVisibleAndDepthMatches }) =>
        ({ theater, member, matches: exactVisibleAndDepthMatches })),
    policy: 'All selected Temperate names are compared. Exact visible native geometry, pixels and depth '
        + 'permit accepted art reuse with target source metadata retained. Geometry-only matches are style '
        + 'references; palette and material differences require authored adaptation and visual review.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ compared: rows.length, donorSources: donors.length,
    reusable: reusable.map(row => `${row.theater}:${row.member}`),
    geometryOnlyCandidates: rows.filter(row => row.geometryOnlyCandidates.length).length }));
