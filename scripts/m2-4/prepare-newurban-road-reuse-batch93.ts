// Retain whole road members and target geometry before composing accepted materials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-tmp-material-reuse-batch93-20261020';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const guideFile = '.artifacts/m2-4/newurban-native-v1/source.json', guide = read(guideFile);
const donorPointer = read('.local/terrain-selection.json');
const donorRoot = path.join('.local/terrain-packs', donorPointer.revision);
assert.equal(pin(path.join(donorRoot, 'manifest.json')).sha256, donorPointer.sha256);
const accepted = read(path.join(donorRoot, 'manifest.json'));
const targetPointer = read('.local/terrain-newurban-selection.json');
const targetRoot = path.join('.local/terrain-packs', targetPointer.revision);
assert.equal(pin(path.join(targetRoot, 'manifest.json')).sha256, targetPointer.sha256);
const baseline = read(path.join(targetRoot, 'manifest.json'));
const sources = guide.sources.filter((source: any) => source.format === 'tmp' && [20, 36, 40, 47].includes(source.setIndex));
assert.equal(sources.length, 38);
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const palette = new Palette(resolveMember(tree, 'isotem.pal').file);
mkdirSync(`${root}/temperate-native-v1`);
const records = sources.map((source: any) => {
    const member = source.member.replace(/\.ubn$/, '.tem');
    const group = accepted.groups.find((group: any) => group.members.some((m: any) => m.member === member));
    assert(group, `No accepted same-name material: ${member}`);
    const definition = group.members.find((m: any) => m.member === member);
    const file = resolveMember(tree, member).file;
    assert.equal(sha(file.getBytes()), definition.sourceHashes.yr);
    const tmp = new TmpFile(file), bytes = file.getBytes();
    const offsets = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const directory = `${root}/temperate-native-v1/${member.replace('.', '-')}`;
    mkdirSync(directory);
    const original = `${directory}/${member}`;
    writeFileSync(original, bytes, { flag: 'wx' });
    const images = tmp.images.map((image, slot) => {
        const metadata = nativeTerrainMetadata(tmp, slot);
        const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
        const rgba = new Uint8Array(bitmap.data.length * 4);
        bitmap.data.forEach((index, pixel) => {
            const color = palette.colors[index];
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
        });
        const rgbaFile = `${directory}/${slot}.rgba`;
        writeFileSync(rgbaFile, rgba, { flag: 'wx' });
        return { ...metadata, size: [bitmap.width, bitmap.height], rgba: pin(rgbaFile),
            nativeOffset: offsets.getInt32(16 + slot * 4, true), depth: image.zData ? sha(image.zData) : null };
    });
    const keys = ['subTile', 'grid', 'block', 'logical', 'offset', 'origin', 'height', 'hasExtraData', 'hasZData'];
    const geometryDifferences = source.images.flatMap((target: any, slot: number) => {
        const donor = images[slot];
        if (!donor) return [{ slot, reason: 'MISSING_DONOR_SLOT' }];
        return keys.filter(key => JSON.stringify(target[key]) !== JSON.stringify((donor as any)[key]))
            .map(key => ({ slot, key, target: target[key], donor: (donor as any)[key] }));
    });
    const alreadySelected = baseline.groups.some((group: any) => group.members.some((m: any) => m.member === source.member));
    return { targetMember: source.member, donorMember: member, donorGroup: group.id,
        targetSourceSha256: source.sha256, donorOriginal: pin(original), images, geometryDifferences,
        alreadySelected, targetSet: source.setIndex,
        mapIds: [...new Set(source.bindings.flatMap((binding: any) => binding.mapIds))] };
});
writeFileSync(`${root}/road-reuse-preparation-v1.json`, JSON.stringify({
    status: 'SOURCE_PINNED_38_USED_ROAD_MEMBERS_FOUR_COMPLETE_USED_SETS_NOT_COVERAGE',
    originalGuide: pin(guideFile), acceptedTemperate: donorPointer, baselineNewUrban: targetPointer,
    records, members: records.length, newMembers: records.filter((r: any) => !r.alreadySelected).length,
    policy: 'Retain target geometry, native slot order, depth, source originals and all four already accepted bridge-contact straight variants. Inspect the assembled native road structure before adapting accepted continuous materials. No maps, selection, budgets or prepared data change.',
    windows: 'NOT_RUN', m24Complete: false
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ members: records.length, newMembers: records.filter((r: any) => !r.alreadySelected).length,
    geometryDifferences: records.filter((r: any) => r.geometryDifferences.length).map((r: any) => ({
        member: r.targetMember, differences: r.geometryDifferences })) }));
