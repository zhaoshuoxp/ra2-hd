// Compare accepted cross-theater families without changing target-owned TMP data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = '.artifacts/m2-4/newurban-remaining-terrain-reuse-batch95-20261021';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => { const b = readFileSync(file); return { file, sha256: sha(b), bytes: b.length }; };
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const prior = '.artifacts/m2-4/newurban-secondary-terrain-reuse-batch94-20261021/inventory-reconciliation-v1.json';
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json';
const guide = read(guideFile);
const missing = read(prior).remainingGaps.filter((gap: any) => gap.kind === 'tmp');
assert.equal(missing.length, 57);
const cross = read('.artifacts/m2-4/structures-batches76-77-v1/temperate-cross-name-reuse-audit-v1.json');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map((['ra2', 'yr'] as const).map(edition => [edition, editionRetailTree(top, edition)]));
const pointers = new Map(['TEMPERATE', 'URBAN', 'NEWURBAN', 'DESERT'].map(theater => [theater,
    read(theater === 'TEMPERATE' ? '.local/terrain-selection.json' : `.local/terrain-${theater.toLowerCase()}-selection.json`)]));
const output = join(root, 'accepted-native-donors-v1');
mkdirSync(output, { recursive: false });
const sources: any[] = [], rows: any[] = [];
for (const [theater, pointer] of pointers) {
    const manifestFile = `.local/terrain-packs/${pointer.revision}/manifest.json`;
    assert.equal(pin(manifestFile).sha256, pointer.sha256);
    const manifest = read(manifestFile);
    const paletteName = { TEMPERATE: 'isotem.pal', URBAN: 'isourb.pal', NEWURBAN: 'isoubn.pal', DESERT: 'isodes.pal' }[theater]!;
    for (const group of manifest.groups) for (const member of group.members) {
        const stem = member.member.replace(/\.[^.]+$/, '');
        const relevant = missing.some((gap: any) => {
            const targetStem = gap.member.replace(/\.ubn$/, '');
            const crossRow = cross.rows.find((r: any) => r.theater === 'NEWURBAN' && r.member === gap.member);
            return targetStem === stem || targetStem.replace('cliffx', 'cliff').replace('wclifx', 'wcliff') === stem
                || (theater === 'TEMPERATE' && crossRow?.geometryOnlyCandidates.some((d: any) => d.member === member.member))
                || (targetStem.startsWith('rough') && stem.startsWith('rough'));
        });
        if (!relevant) continue;
        const edition = member.sourceHashes.yr ? 'yr' : 'ra2';
        const tree = trees.get(edition)!;
        const file = resolveMember(tree, member.member).file;
        assert.equal(sha(file.getBytes()), member.sourceHashes[edition]);
        const paletteFile = resolveMember(tree, paletteName).file;
        const palette = new Palette(paletteFile);
        const tmp = new TmpFile(file);
        const folder = join(output, `${theater.toLowerCase()}-${member.member}`);
        mkdirSync(folder);
        writeFileSync(join(folder, member.member), file.getBytes(), { flag: 'wx' });
        const table = new DataView(tmp.sourceBytes!.buffer, tmp.sourceBytes!.byteOffset, tmp.sourceBytes!.byteLength);
        const images = tmp.images.map((image, subTile) => {
            const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
            const rgba = new Uint8Array(bitmap.data.length * 4);
            bitmap.data.forEach((index, pixel) => {
                const color = palette.colors[index];
                rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
            });
            const rgbaFile = join(folder, `${subTile}.rgba`);
            writeFileSync(rgbaFile, rgba, { flag: 'wx' });
            return { ...nativeTerrainMetadata(tmp, subTile), nativeOffset: table.getInt32(16 + subTile * 4, true),
                size: [bitmap.width, bitmap.height], file: rgbaFile, rgbaSha256: sha(rgba),
                depthSha256: image.zData ? sha(image.zData) : null,
                indexSha256: sha(bitmap.data) };
        });
        sources.push({ theater, member: member.member, edition, group: group.id, pointer,
            original: pin(join(folder, member.member)), palette: { member: paletteName, sha256: sha(paletteFile.getBytes()) }, images });
    }
}
for (const gap of missing) {
    const target = guide.sources.find((s: any) => s.member === gap.member && s.sha256 === gap.sha256);
    assert(target);
    const stem = gap.member.replace(/\.ubn$/, '');
    const geometric = cross.rows.find((r: any) => r.theater === 'NEWURBAN' && r.member === gap.member)?.geometryOnlyCandidates ?? [];
    const candidates = sources.filter(d => d.member.replace(/\.[^.]+$/, '') === stem
        || d.member.replace(/\.[^.]+$/, '') === stem.replace('cliffx', 'cliff').replace('wclifx', 'wcliff')
        || (d.theater === 'TEMPERATE' && geometric.some((g: any) => g.member === d.member))
        || (stem.startsWith('rough') && d.member.startsWith('rough'))).map(d => ({ theater: d.theater, member: d.member }));
    rows.push({ member: gap.member, sourceSha256: gap.sha256, set: target.setIndex, maps: gap.maps, candidates });
}
write(join(output, 'source.json'), { sources });
write(join(root, 'candidate-screen-v1.json'), { status: 'AUDIT_ONLY_NO_SELECTION_CHANGE', inventory: pin(prior),
    guide: pin(guideFile), acceptedOriginals: pin(join(output, 'source.json')), pointers: Object.fromEntries(pointers), rows,
    policy: 'Source names nominate candidates only. Target original rules, geometry, coverage, depth and source hashes remain authoritative. Native RGB is evidence, never enlarged into new HD detail.', windows: 'NOT_RUN', m24Complete: false });
console.log(JSON.stringify({ targets: rows.length, acceptedSourceCandidates: sources.length, sourceGuide: join(output, 'source.json') }));
