import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { VxlFile } from '../../src/data/VxlFile';
import { VplFile } from '../../src/data/VplFile';
import { Palette } from '../../src/data/Palette';

const output = process.argv[2];
assert(output, 'Usage: bun audit-urban-actor-colors-batch62.ts <new-receipt>');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tree = editionRetailTree(new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)])), 'yr');
const sourceFile = '.artifacts/m2-4/urban-actors-native-batch62-v1/source.json';
const sourceBytes = readFileSync(sourceFile), source = JSON.parse(sourceBytes.toString());
const rows = ['unittem.pal', 'uniturb.pal'].map(member => {
    const resolved = resolveMember(tree, member), palette = Palette.fromVirtualFile(resolved.file);
    return { member, sha256: sha(resolved.file.getBytes()),
        colors: Array.from({ length: 256 }, (_, index) => palette.getColorAsHex(index)) };
});
assert.deepEqual(rows[0].colors, rows[1].colors);
const vplSource = resolveMember(tree, 'voxels.vpl'), vplBytes = vplSource.file.getBytes();
assert.equal(sha(vplBytes), '2d75fff8a6872ffe98308c7009858a9e904696e1529bc649181a44993979081c');
const vpl = new VplFile(vplSource.file);
const records = source.sources.filter((entry: any) => entry.format === 'vxl').map((entry: any) => {
    const original = resolveMember(tree, entry.member);
    assert.equal(sha(original.file.getBytes()), entry.sha256);
    assert.equal(sha(resolveMember(tree, entry.hva.member).file.getBytes()), entry.hva.sha256);
    assert.equal(entry.palette.sha256, rows[1].sha256);
    const colors = new Set<number>(new VxlFile(original.file).sections.flatMap(section =>
        section.getAllVoxels().voxels.map(voxel => voxel.colorIndex)));
    const resolved = new Set<number>();
    for (const color of colors) for (let row = 0; row < 32; row++) resolved.add(vpl.tables[row * 256 + color]);
    return { member: entry.member, sourceSha256: entry.sha256, hvaSha256: entry.hva.sha256,
        paletteSha256: entry.palette.sha256, originalColors: [...colors].sort((a, b) => a - b),
        allVplRowsColors: [...resolved].sort((a, b) => a - b),
        fixedColors: [...resolved].map(index => ({ index, color: rows[1].colors[index] })) };
});
assert.equal(records.length, 6);
const receipt = { status: 'PASS_NATIVE_ACTOR_PALETTE_AND_ALL_32_VPL_ROWS', sourceFile,
    sourceSha256: sha(sourceBytes), vplSha256: sha(vplBytes), rows, records,
    boundary: 'Source color proof only; authored fixed colors, native binding and user visual acceptance are separate.' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, voxelFamilies: records.length, equalPaletteColors: 256 }));
