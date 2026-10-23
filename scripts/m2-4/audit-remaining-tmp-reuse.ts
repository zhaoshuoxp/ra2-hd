// Compare every remaining source against selected accepted theater counterparts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const [output] = process.argv.slice(2);
assert(output, 'Usage: audit-remaining-tmp-reuse.ts <new-receipt.json>');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map((['ra2', 'yr'] as const).map(edition => [edition, editionRetailTree(top, edition)]));
const contracts = read('desktop/terrain-theater-hd-contracts.json');
const donors = [
    { theater: 'URBAN', extension: '.urb', palette: 'isourb.pal', pointer: contracts.URBAN },
    { theater: 'TEMPERATE', extension: '.tem', palette: 'isotem.pal', pointer: read('.local/terrain-selection.json') },
    { theater: 'SNOW', extension: '.sno', palette: 'isosno.pal', pointer: contracts.SNOW },
].map(donor => {
    const file = join('.local/terrain-packs', donor.pointer.revision, 'manifest.json');
    assert.equal(sha(readFileSync(file)), donor.pointer.sha256);
    const pack = read(file);
    assert.equal(pack.theater, donor.theater);
    return { ...donor, members: new Map<string, any>(pack.groups.flatMap((group: any) =>
        group.members.map((member: any) => [member.member, { ...member, group: group.id }]))) };
});
const rows: any[] = [], inventories: any[] = [];
for (const [theater, batch] of [['NEWURBAN', 74], ['DESERT', 75]] as const) {
    const name = theater.toLowerCase();
    const file = `.artifacts/m2-4/inventory-${name}-after-batch${batch}-v1/inventory.json`;
    const inventory = read(file), nativeRoot = `.artifacts/m2-4/${name}-native-v1`;
    const guideFile = join(nativeRoot, 'source.json'), guide = read(guideFile);
    const missing = inventory.resourceGroups.filter((row: any) => row.kind === 'tmp'
        && row.decisions.includes('MISSING_AUTHORED_FAMILY'));
    inventories.push({ theater, file, sha256: sha(readFileSync(file)), sourceFile: guideFile,
        sourceSha256: sha(readFileSync(guideFile)), remainingMembers: missing.length });
    for (const missingSource of missing) {
        const matches = guide.sources.filter((source: any) => source.member === missingSource.member
            && source.sha256 === missingSource.sha256);
        assert.equal(matches.length, 1, 'Current inventory must match one original exported source');
        const [source] = matches, bytes = readFileSync(join(nativeRoot, 'native', source.nativeFile));
        assert.equal(sha(bytes), source.sha256);
        const target = new TmpFile(VirtualFile.fromBytes(bytes, source.member));
        for (const image of source.images)
            assert.equal(sha(readFileSync(join(nativeRoot, 'native', image.file))), image.rgbaSha256);
        const comparisons: any[] = [];
        for (const donor of donors) {
            const counterpart = source.member.replace(/\.(ubn|des)$/, donor.extension);
            const selected = donor.members.get(counterpart);
            if (!selected) {
                comparisons.push({ theater: donor.theater, member: counterpart, status: 'NO_SELECTED_COUNTERPART' });
                continue;
            }
            const editions = [];
            for (const edition of ['ra2', 'yr'] as const) {
                const expected = selected.sourceHashes[edition];
                if (!expected) continue;
                const tree = trees.get(edition)!;
                if (!tree.some(container => container.mix.containsFile(counterpart))) {
                    editions.push({ edition, sourceSha256: expected, rawEqual: false,
                        differences: [{ reason: 'DECLARED_DONOR_EDITION_HAS_NO_IMPORTED_SOURCE' }] });
                    continue;
                }
                const original = resolveMember(tree, counterpart);
                assert.equal(sha(original.file.getBytes()), expected, 'Selected donor source drift');
                const tmp = new TmpFile(original.file), palSource = resolveMember(tree, donor.palette);
                const palette = new Palette(palSource.file), differences: any[] = [];
                if (JSON.stringify(tmp.emptySlots) !== JSON.stringify(target.emptySlots)
                    || tmp.images.length !== target.images.length) differences.push({ reason: 'INDEXED_SLOT_LAYOUT_DIFFERS' });
                for (let slot = 0; slot < Math.max(tmp.images.length, target.images.length); slot++) {
                    const old = tmp.images[slot], current = target.images[slot];
                    if (!old || !current) {
                        if (!!old !== !!current) differences.push({ slot, reason: 'EMPTY_OR_MISSING_SLOT_DIFFERS' });
                        continue;
                    }
                    const { member: _old, ...metadata } = nativeTerrainMetadata(tmp, slot);
                    const { member: _current, ...native } = nativeTerrainMetadata(target, slot);
                    if (JSON.stringify(metadata) !== JSON.stringify(native))
                        differences.push({ slot, reason: 'NATIVE_METADATA_DIFFERS' });
                    if ((old.zData ? sha(old.zData) : null) !== (current.zData ? sha(current.zData) : null))
                        differences.push({ slot, reason: 'NATIVE_Z_DATA_DIFFERS' });
                    const bitmap = new TmpDrawable().draw(old as any, tmp.blockWidth, tmp.blockHeight);
                    const rgba = new Uint8Array(bitmap.data.length*4);
                    bitmap.data.forEach((index, pixel) => {
                        const color = palette.colors[index];
                        rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel*4);
                    });
                    const frame = source.images.find((image: any) => image.subTile === slot);
                    if (!frame || sha(rgba) !== frame.rgbaSha256)
                        differences.push({ slot, reason: 'DECODED_ORIGINAL_RGBA_DIFFERS' });
                }
                editions.push({ edition, sourceSha256: expected, rawEqual: expected === source.sha256,
                    paletteSha256: sha(palSource.file.getBytes()), differences });
            }
            assert(editions.length > 0);
            comparisons.push({ theater: donor.theater, member: counterpart, group: selected.group,
                status: editions.every(result => !result.differences.length)
                    ? 'EXACT_ORIGINAL_EQUIVALENCE_ONLY' : 'ORIGINAL_DIFFERS', editions });
        }
        rows.push({ theater, member: source.member, sourceSha256: source.sha256,
            set: source.setIndex, maps: missingSource.maps, comparisons });
    }
}
const qualified = rows.filter(row => row.comparisons.some((item: any) => item.status === 'EXACT_ORIGINAL_EQUIVALENCE_ONLY'));
const receipt = { schema: 'm2-4-remaining-tmp-three-donor-audit-v1',
    status: 'AUDIT_ONLY_NO_RESOURCE_OR_ACCEPTANCE_CHANGE', inventories,
    donors: donors.map(donor => ({ theater: donor.theater, selectedPack: donor.pointer })),
    rows, qualifiedMembers: qualified.map(row => ({ theater: row.theater, member: row.member })),
    policy: 'All indexed slots, metadata, Z bytes and decoded RGBA must match selected donor originals. '
        + 'This proves source equivalence only; complete-family export, accepted-art provenance and native '
        + 'theater verification remain necessary. Missing sources remain in the coverage ledger.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ comparedMembers: rows.length, qualifiedMembers: receipt.qualifiedMembers }));
