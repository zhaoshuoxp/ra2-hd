// Qualify complete Original TMP equivalence before considering accepted art reuse.
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

const [inventoryFile, nativeRoot, output] = process.argv.slice(2);
assert(inventoryFile && nativeRoot && output, 'Usage: audit <inventory.json> <native-root> <new-receipt.json>');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const pointerFile = '.local/terrain-selection.json', pointer = read(pointerFile);
const donorFile = join('.local/terrain-packs', pointer.revision, 'manifest.json');
assert.equal(sha(readFileSync(donorFile)), pointer.sha256);
const donor = read(donorFile), inventory = read(inventoryFile);
assert.equal(donor.theater, 'TEMPERATE');
const guideFile = join(nativeRoot, 'source.json'), guide = read(guideFile);
assert.equal(guide.theater, 'URBAN');
const missing = new Set(inventory.resourceGroups.filter((row: any) => row.theater === 'URBAN'
    && row.kind === 'tmp' && row.decisions.includes('MISSING_AUTHORED_FAMILY')).map((row: any) => row.member));
const donorMembers = new Map<string, any>(donor.groups.flatMap((group: any) => group.members.map(
    (member: any) => [member.member, { ...member, group: group.id }])));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map((['ra2', 'yr'] as const).map(edition => [edition, editionRetailTree(top, edition)]));
const rows: any[] = [], unmatched: string[] = [];
for (const source of guide.sources.filter((row: any) => missing.has(row.member))) {
    const counterpart = source.member.replace(/\.urb$/, '.tem'), accepted = donorMembers.get(counterpart);
    if (!accepted) { unmatched.push(source.member); continue; }
    const urbanBytes = readFileSync(join(nativeRoot, 'native', source.nativeFile));
    assert.equal(sha(urbanBytes), source.sha256);
    const urban = new TmpFile(VirtualFile.fromBytes(urbanBytes, source.member));
    const cases = [];
    for (const edition of ['ra2', 'yr'] as const) {
        const tree = trees.get(edition)!, original = resolveMember(tree, counterpart);
        assert.equal(sha(original.file.getBytes()), accepted.sourceHashes[edition], 'Accepted source drift');
        const tmp = new TmpFile(original.file), paletteSource = resolveMember(tree, 'isotem.pal');
        const palette = new Palette(paletteSource.file), differences: any[] = [];
        if (JSON.stringify(tmp.emptySlots) !== JSON.stringify(urban.emptySlots)
            || tmp.images.length !== urban.images.length) differences.push({ reason: 'INDEXED_SLOT_LAYOUT_DIFFERS' });
        for (let slot = 0; slot < tmp.images.length; slot++) {
            const image = tmp.images[slot], target = urban.images[slot];
            if (!image || !target) {
                if (!!image !== !!target) differences.push({ slot, reason: 'EMPTY_SLOT_DIFFERS' });
                continue;
            }
            const { member: _old, ...metadata } = nativeTerrainMetadata(tmp, slot);
            const { member: _new, ...expected } = nativeTerrainMetadata(urban, slot);
            if (JSON.stringify(metadata) !== JSON.stringify(expected))
                differences.push({ slot, reason: 'NATIVE_METADATA_DIFFERS' });
            const oldZ = image.zData ? sha(image.zData) : null;
            const newZ = target.zData ? sha(target.zData) : null;
            if (oldZ !== newZ) differences.push({ slot, reason: 'NATIVE_Z_DATA_DIFFERS' });
            const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
            const rgba = new Uint8Array(bitmap.data.length * 4);
            bitmap.data.forEach((index, pixel) => {
                const color = palette.colors[index];
                rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
            });
            const native = source.images[slot];
            assert.equal(sha(readFileSync(join(nativeRoot, 'native', native.file))), native.rgbaSha256);
            if (sha(rgba) !== native.rgbaSha256) differences.push({ slot, reason: 'DECODED_ORIGINAL_RGBA_DIFFERS' });
        }
        cases.push({ edition, archive: original.source, sourceSha256: accepted.sourceHashes[edition],
            paletteSha256: sha(paletteSource.file.getBytes()), differences });
    }
    rows.push({ member: source.member, sourceSha256: source.sha256, donorMember: counterpart,
        donorGroup: accepted.group, slots: source.images.length, cases,
        qualified: cases.every(row => row.differences.length === 0) });
}
const receipt = { schema: 'm2-4-urban-tmp-complete-original-equivalence-audit-v1',
    status: 'AUDIT_ONLY_NO_RESOURCE_REGISTRATION_OR_ACCEPTANCE_CHANGE',
    inventoryFile, inventorySha256: sha(readFileSync(inventoryFile)), guideFile,
    guideSha256: sha(readFileSync(guideFile)), acceptedTemperate: pointer, rows, unmatched,
    qualifiedMembers: rows.filter(row => row.qualified).map(row => row.member),
    policy: 'All indexed subtiles, native metadata, Z bytes and actual decoded RGBA must match both accepted edition sources. A matching filename or shape alone is insufficient; complete HD group payload and native theater loading still require separate qualification.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ compared: rows.length, unmatched: unmatched.length,
    qualifiedMembers: receipt.qualifiedMembers.length }));
