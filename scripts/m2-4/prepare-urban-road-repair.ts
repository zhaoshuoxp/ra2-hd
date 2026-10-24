import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const output = process.argv[2];
assert(output, 'Usage: prepare-urban-road-repair.ts <new-output-directory>');
mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const packs = ['urban', 'newurban', 'temperate'].map(theater => {
    const selector = `.local/terrain-${theater === 'temperate' ? '' : theater + '-'}selection.json`;
    const pointer = read(selector), root = `.local/terrain-packs/${pointer.revision}`;
    assert.equal(sha(readFileSync(`${root}/manifest.json`)), pointer.sha256);
    return { theater, pointer, root, manifest: read(`${root}/manifest.json`) };
});
const [urban, newurban, temperate] = packs;
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = { ra2: editionRetailTree(top, 'ra2'), yr: editionRetailTree(top, 'yr') };
const palette = new Palette(resolveMember(trees.yr, 'isotem.pal').file);
const geometryKeys = ['subTile', 'grid', 'block', 'origin', 'height', 'rampType', 'hasZData'];
const compatible = (a: any, b: any) => a.images.length === b.images.length && a.images.every((image: any, index: number) =>
    geometryKeys.every(key => JSON.stringify(image[key]) === JSON.stringify(b.images[index][key])));
const records = [];
for (const group of urban.manifest.groups) for (const member of group.members) {
    if (!/^(proad|p_end|prslpe)/.test(member.member)) continue;
    const source = new TmpFile(resolveMember(trees.yr, member.member).file);
    for (const edition of ['ra2', 'yr'] as const)
        assert.equal(sha(resolveMember(trees[edition], member.member).file.getBytes()), member.sourceHashes[edition]);
    assert.equal(JSON.stringify(source.images.map((_, index) => nativeTerrainMetadata(source, index))), JSON.stringify(member.images));
    const options = [newurban, temperate].flatMap(pack => {
        const name = member.member.replace('.urb', pack === newurban ? '.ubn' : '.tem');
        return pack.manifest.groups.flatMap((g: any) => g.members.filter((m: any) => m.member === name && compatible(member, m))
            .map((definition: any) => ({ pack, definition, group: g.id })));
    });
    assert(options.length, `No compatible accepted road source for ${member.member}`);
    const depthHash = (data?: Uint8Array) => data ? sha(data) : null;
    const candidates = options.map(option => ({ ...option,
        original: new TmpFile(resolveMember(trees.yr, option.definition.member).file) }));
    const exactDepth = (option: typeof candidates[number]) => source.images.every((image, index) =>
        depthHash(image.zData) === depthHash(option.original.images[index].zData));
    const donor = candidates.find(exactDepth) ?? candidates[0];
    const original = donor.original;
    assert.equal(sha(original.sourceBytes!), donor.definition.sourceHashes.yr);
    const frames = source.images.map((image, index) => {
        const metadata = nativeTerrainMetadata(source, index), other = original.images[index];
        const native = new TmpDrawable().draw(image as any, source.blockWidth, source.blockHeight);
        const rgba = new Uint8Array(native.data.length * 4);
        native.data.forEach((value, pixel) => {
            const color = palette.getColor(value);
            rgba.set([color.r, color.g, color.b, value ? 255 : 0], pixel * 4);
        });
        const file = `${member.member}-${index}.rgba`;
        writeFileSync(path.join(output, file), rgba, { flag: 'wx' });
        return { metadata, file, sha256: sha(rgba), empty: source.emptySlots.includes(index),
            zSha256: depthHash(image.zData), donorZSha256: depthHash(other.zData) };
    });
    records.push({ member: member.member, group: group.id, sourceHashes: member.sourceHashes, exactDepth: exactDepth(donor),
        donor: { pointer: donor.pack.pointer, member: donor.definition.member, group: donor.group,
            sourceHashes: donor.definition.sourceHashes, images: donor.definition.images }, frames });
}
assert.equal(records.length, 47);
writeFileSync(path.join(output, 'source.json'), JSON.stringify({ schema: 'urban-road-repair-source-v1',
    baseline: urban.pointer, donors: [newurban.pointer, temperate.pointer], records,
    policy: 'Reuse complete accepted road artwork where native geometry and depth match. Other sources retain their Urban road form with accepted asphalt material only. Preserve Urban source identities, coverage, depth, rules and both densities.' }, null, 2), { flag: 'wx' });
console.log(`Verified ${records.length} complete Urban road sources and their accepted donors`);
