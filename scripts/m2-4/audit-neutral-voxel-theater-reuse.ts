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
assert(output, 'Usage: bun audit-neutral-voxel-theater-reuse.ts <new-receipt>');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tree = editionRetailTree(new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)])), 'yr');
const vplSource = resolveMember(tree, 'voxels.vpl');
const vpl = new VplFile(vplSource.file);
const snowPaletteSource = resolveMember(tree, 'unitsno.pal');
const snow = Palette.fromVirtualFile(snowPaletteSource.file);
const contract = JSON.parse(readFileSync('desktop/environment-snow-hd-contract.json', 'utf8'));
const records: any[] = [];
for (const [theater, folder] of [['URBAN', 'urban-native-v2'], ['NEWURBAN', 'newurban-native-v1']]) {
    const guidePath = `.artifacts/m2-4/${folder}/source.json`;
    const guideBytes = readFileSync(guidePath), guide = JSON.parse(guideBytes.toString('utf8'));
    assert.equal(guide.theater, theater);
    for (const identity of ['WINI', 'TRUCKB']) {
        const source = guide.sources.find((entry: any) => entry.member === identity.toLowerCase() + '.vxl');
        assert(source);
        const descriptor = contract.vxl[identity];
        const manifestFile = `.local/${descriptor.path}`, manifestBytes = readFileSync(manifestFile);
        assert.equal(sha(manifestBytes), descriptor.hash);
        const manifest = JSON.parse(manifestBytes.toString('utf8'));
        const original = resolveMember(tree, source.member);
        assert.equal(sha(original.file.getBytes()), source.sha256);
        assert.equal(manifest.sources[source.member], source.sha256);
        assert.equal(manifest.sources[source.hva.member], source.hva.sha256);
        assert.equal(sha(resolveMember(tree, source.hva.member).file.getBytes()), source.hva.sha256);
        const colors = new Set(new VxlFile(original.file).sections.flatMap(section =>
            section.getAllVoxels().voxels.map(voxel => voxel.colorIndex)));
        const resolved = new Set<number>();
        for (const color of colors) for (let row = 0; row < 32; row++)
            resolved.add(vpl.tables[row * 256 + color]);
        const targetPaletteSource = resolveMember(tree, source.palette.member);
        assert.equal(sha(targetPaletteSource.file.getBytes()), source.palette.sha256);
        const target = Palette.fromVirtualFile(targetPaletteSource.file);
        const differences = [...resolved].filter(index => snow.getColorAsHex(index) !== target.getColorAsHex(index));
        records.push({ identity, theater, sourceSha256: source.sha256, hvaSha256: source.hva.sha256,
            donorMetadataSha256: descriptor.hash, donorPaletteSha256: sha(snowPaletteSource.file.getBytes()),
            targetPaletteSha256: source.palette.sha256, guidePath, guideSha256: sha(guideBytes),
            originalVoxelColors: [...colors].sort((a, b) => a - b),
            allVplRowsResolvedColors: [...resolved].sort((a, b) => a - b),
            differingFixedColorIndices: differences, qualified: differences.length === 0,
            officialMapIds: [...new Set(source.bindings.flatMap((binding: any) => binding.mapIds))] });
    }
}
const receipt = { status: 'STATIC_COMPLETE_SOURCE_HVA_ALL_VPL_COLOR_ROWS_AUDIT_ONLY',
    vplSha256: sha(vplSource.file.getBytes()), records,
    policy: 'Compare every used voxel color through every native VPL row, including fixed red/remap entries; do not infer compatibility from whole-palette filenames or raw VXL equality alone.',
    runtimeStatus: 'NOT_RUN', scopeChanged: false, windowsStatus: 'NOT_RUN' };
writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(records.map(({ identity, theater, qualified, differingFixedColorIndices }) =>
    ({ identity, theater, qualified, differingColors: differingFixedColorIndices.length }))));
