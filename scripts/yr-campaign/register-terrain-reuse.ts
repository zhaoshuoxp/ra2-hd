import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata, MAX_TERRAIN_HD_GROUPS } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, selectedPack, sha256 } from '../test-support/resources';

const [output, qualificationFile] = process.argv.slice(2);
const apply = process.argv.includes('--apply'), out = path.resolve(output);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const write = (file: string, bytes: Uint8Array) => fs.writeFileSync(file, bytes, { flag: 'wx' });
const qualification = read(qualificationFile);
const rows = qualification.qualified.filter((row: any) => row.kind === 'tmp' && row.theater === 'DESERT');
assert.deepEqual(rows.map((row: any) => row.id).sort(),
    ['pave08.des', 'pave09.des', 'pave10.des', 'proad03.des', 'shore23.des']);
fs.mkdirSync(out, { recursive: false });
const priorPointer = read('.local/terrain-desert-selection.json');
const priorRoot = path.join('.local/terrain-packs', priorPointer.revision);
const priorBytes = fs.readFileSync(path.join(priorRoot, 'manifest.json'));
assert.equal(sha256(priorBytes), priorPointer.sha256);
const contractFile = 'desktop/terrain-theater-hd-contracts.json', contractBefore = fs.readFileSync(contractFile);
const contracts = JSON.parse(contractBefore.toString()); assert.deepEqual(contracts.DESERT, priorPointer);
const donor = selectedPack('terrain', 'TEMPERATE');
const palette = new Palette(retailMember('yr', 'isodes.pal').file);
const donorPalette = new Palette(retailMember('yr', 'isotem.pal').file);
const pack = JSON.parse(priorBytes.toString()), proofs: any[] = [], additions: any[] = [];
const revision = process.argv.find(value => value.startsWith('--revision='))?.slice(11) ?? 'yr-desert-source-reuse-r1';
assert(/^yr-desert-source-reuse-r[1-9][0-9]*$/.test(revision));
const directory = path.join('.local/terrain-packs', revision);
assert(!fs.existsSync(directory)); fs.mkdirSync(directory);
pack.revision = revision;
const existingFiles = new Set<string>();
for (const group of pack.groups) for (const variant of group.variants) {
    const file = path.join(priorRoot, variant.file);
    assert(/^[a-z0-9-]+\.rgba$/.test(variant.file)); assert.equal(sha256(fs.readFileSync(file)), variant.sha256);
    if (!existingFiles.has(variant.file)) fs.linkSync(file, path.join(directory, variant.file));
    existingFiles.add(variant.file);
}
const categories = { shore: /^shore/, pavement: /^pave/, road: /^proad/ };
for (const [category, pattern] of Object.entries(categories)) {
    const group: any = { id: 'yr-desert-reuse-' + category, scope: 'COMPLETE_SOURCE_MEMBERS_EXACT_ACCEPTED_PIXEL_REUSE',
        members: [], variants: [] };
    const members = rows.filter((row: any) => pattern.test(row.id));
    const donorMembers = members.map((row: any) => {
        assert.equal(row.signature, row.donor.signature);
        assert.equal(row.donor.revision, donor.manifest.revision);
        assert(!pack.groups.some((group: any) => group.members.some((member: any) => member.member === row.id)));
        const target = new TmpFile(retailMember('yr', row.id, row.source.sha256).file);
        const accepted = new TmpFile(retailMember('yr', row.donor.member, row.donor.sourceHash).file);
        assert.equal(row.source.sha256, row.donor.sourceHash, 'This admission requires identical complete native bytes');
        const beforeGroup = donor.manifest.groups.find((group: any) => group.id === row.donor.group);
        const before = beforeGroup.members.find((member: any) => member.member === row.donor.member);
        const images = target.images.map((image, index) => {
            const metadata = nativeTerrainMetadata(target, index);
            assert.equal(JSON.stringify(metadata), JSON.stringify({ ...before.images[index], member: row.id }));
            const a = new TmpDrawable().draw(image, target.blockWidth, target.blockHeight);
            const b = new TmpDrawable().draw(accepted.images[index], accepted.blockWidth, accepted.blockHeight);
            assert.deepEqual(a.data, b.data);
            for (const color of a.data) if (color) assert.deepEqual(palette.getColor(color), donorPalette.getColor(color));
            return metadata;
        });
        group.members.push({ member: row.id, sourceHashes: { yr: row.source.sha256 }, images });
        const proof = { member: row.id, sourceSha256: row.source.sha256, donorMember: row.donor.member,
            donorGroup: row.donor.group, sourceMetadata: images, sourcePalette: retailMember('yr', 'isodes.pal').sha256,
            donorPalette: retailMember('yr', 'isotem.pal').sha256, densityFrames: [] as any[] };
        proofs.push(proof); return { row, beforeGroup, before, proof };
    });
    for (const density of [2, 4]) {
        const pieces: { bytes: Buffer; width: number; height: number }[] = [], rects: number[][] = [];
        for (const { beforeGroup, before, proof } of donorMembers) {
            const variant = beforeGroup.variants.find((value: any) => value.density === density);
            const bytes = fs.readFileSync(path.join(donor.directory, variant.file)); assert.equal(sha256(bytes), variant.sha256);
            let offset = 0;
            for (const member of beforeGroup.members) { if (member === before) break; offset += member.images.length; }
            for (let index = 0; index < before.images.length; index++) {
                const [x, y, width, height] = variant.rects[offset + index], crop = Buffer.alloc(width * height * 4);
                for (let row = 0; row < height; row++) bytes.copy(crop, row * width * 4,
                    ((y + row) * variant.size[0] + x) * 4, ((y + row) * variant.size[0] + x + width) * 4);
                assert.deepEqual([width, height], before.images[index].logical.map((size: number) => size * density));
                pieces.push({ bytes: crop, width, height });
                proof.densityFrames.push({ density, subTile: index, donorAtlasSha256: variant.sha256,
                    donorRect: [x, y, width, height], pixelsSha256: sha256(crop), pixelsUnchanged: true });
            }
        }
        const width = 1024; let x = 2, y = 2, rowHeight = 0;
        for (const piece of pieces) {
            assert(piece.width + 4 <= width);
            if (x + piece.width + 2 > width) { x = 2; y += rowHeight + 4; rowHeight = 0; }
            rects.push([x, y, piece.width, piece.height]); x += piece.width + 4; rowHeight = Math.max(rowHeight, piece.height);
        }
        const height = y + rowHeight + 2; assert(height <= 2048);
        const bytes = Buffer.alloc(width * height * 4);
        pieces.forEach((piece, index) => {
            const [x, y] = rects[index];
            for (let row = 0; row < piece.height; row++) piece.bytes.copy(bytes,
                ((y + row) * width + x) * 4, row * piece.width * 4, (row + 1) * piece.width * 4);
        });
        const file = `${group.id}-${density}x.rgba`; write(path.join(directory, file), bytes);
        group.variants.push({ density, file, size: [width, height], rects, sha256: sha256(bytes) });
    }
    pack.groups.push(group); additions.push(group.id);
}
assert(pack.groups.length <= MAX_TERRAIN_HD_GROUPS);
const bytes = Buffer.from(JSON.stringify(pack) + '\n');
assert(bytes.length <= 2 * 1024 * 1024, 'Preserve the existing desktop manifest bound');
write(path.join(directory, 'manifest.json'), bytes);
const selected = { schemaVersion: 1, revision, sha256: sha256(bytes) };
const report = { schema: 'yr-complete-native-terrain-donor-reuse-v1',
    status: apply ? 'PASS_EXACT_ACCEPTED_PIXELS_SELECTED_NATIVE_PENDING' : 'PASS_EXACT_ACCEPTED_PIXELS_UNSELECTED',
    qualification: { file: path.resolve(qualificationFile), sha256: sha256(fs.readFileSync(qualificationFile)) },
    priorSelection: priorPointer, selectedPack: selected, donorSelection: donor.manifest.revision,
    preservedPriorGroups: pack.groups.length - additions.length, hardLinkedPriorAtlases: existingFiles.size,
    addedGroups: additions, members: proofs, copiedPriorAtlasBytes: 0, newArtwork: 0,
    replacedAcceptedPayloads: 0, nativeValidation: 'PENDING', userVisualAcceptance: 'PENDING' };
write(path.join(out, 'report.json'), encode(report));
if (apply) {
    assert.deepEqual(read('.local/terrain-desert-selection.json'), priorPointer);
    assert.deepEqual(fs.readFileSync(contractFile), contractBefore);
    fs.writeFileSync('.local/terrain-desert-selection.json', encode(selected));
    fs.writeFileSync(contractFile, encode({ ...contracts, DESERT: selected }));
    write('docs/campaign-art/yr-v1/terrain-reused-families.json', encode(report));
}
console.log(JSON.stringify({ status: report.status, groups: additions.length, members: proofs.length, out }));
