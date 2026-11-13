import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: false });
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const guideRoot = '.local/source-art/yr-campaign-v1/terrain-remaining-r1';
const report: any = { schema: 'yr-terrain-exact-rgba-material-reuse-audit-v1', status: 'READ_ONLY_QUALIFICATION',
    policy: 'Exact complete native image RGBA, dimensions, offsets, block and ramp shape qualify only accepted pixel reuse. Every new target retains its original file identity, full native metadata, depth bytes and placements. No existing manifest or source payload is modified. Native target admission and visual context remain separately required.',
    complete: [], partial: [], unresolved: [], runtimeSelectionsChanged: 0 };
for (const theater of ['TEMPERATE', 'URBAN', 'NEWURBAN', 'SNOW']) {
    const name = theater.toLowerCase(), suffix = theater === 'TEMPERATE' ? '' : '-' + name;
    const pointer = read(`.local/terrain${suffix}-selection.json`), root = `.local/terrain-packs/${pointer.revision}`;
    const manifestBytes = fs.readFileSync(`${root}/manifest.json`), manifest = JSON.parse(manifestBytes.toString());
    assert.equal(sha256(manifestBytes), pointer.sha256);
    const paletteName = ({ TEMPERATE: 'isotem', URBAN: 'isourb', NEWURBAN: 'isoubn', SNOW: 'isosno' } as any)[theater] + '.pal';
    const palettes = new Map<string, Palette>(), images = new Map<string, any[]>();
    const format = (metadata: any) => JSON.stringify(['logical', 'block', 'offset', 'rampType', 'hasExtraData']
        .map(key => metadata[key]));
    for (const group of manifest.groups) {
        if (group.id.startsWith('yr-temperate-dirtroads') || group.id.startsWith('yr-urban-paving-fixes'))
            throw Error('Unqualified terrain candidate cannot become an accepted donor');
        for (const member of group.members) {
            const edition = member.sourceHashes.yr ? 'yr' : 'ra2';
            const native = new TmpFile(retailMember(edition, member.member, member.sourceHashes[edition]).file);
            if (!palettes.has(edition)) palettes.set(edition, new Palette(retailMember(edition, paletteName).file));
            const palette = palettes.get(edition)!;
            for (const [index, image] of native.images.entries()) {
                const bitmap = new TmpDrawable().draw(image as any, native.blockWidth, native.blockHeight);
                const rgba = new Uint8Array(bitmap.data.length * 4);
                bitmap.data.forEach((color, pixel) => { const c = palette.colors[color];
                    rgba.set([c.r, c.g, c.b, color ? 255 : 0], pixel * 4); });
                const metadata = nativeTerrainMetadata(native, index), key = sha256(rgba) + ':' + format(metadata);
                const donor = { theater, selection: pointer, group: group.id, member: member.member, subTile: index,
                    sourceSha256: member.sourceHashes[edition], edition, paletteSha256: retailMember(edition, paletteName).sha256,
                    nativeRgbaSha256: sha256(rgba), metadata };
                images.set(key, [...(images.get(key) ?? []), donor]);
            }
        }
    }
    const sourceFile = `${guideRoot}/${name}/original-r1/source.json`, source = read(sourceFile);
    for (const target of source.sources) {
        const frames = target.images.map((image: any) => {
            const matches = images.get(image.rgbaSha256 + ':' + format(image)) ?? [];
            const score = (donor: any) => Object.keys(donor.metadata).filter(key => key !== 'member'
                && JSON.stringify(donor.metadata[key]) !== JSON.stringify(image[key])).length;
            matches.sort((a, b) => score(a) - score(b) || a.member.localeCompare(b.member));
            return { subTile: image.subTile, nativeRgbaSha256: image.rgbaSha256,
                compatibleDonors: matches.length, donor: matches[0],
                differingTargetMetadata: matches[0] ? Object.keys(matches[0].metadata).filter(key => key !== 'member'
                    && JSON.stringify(matches[0].metadata[key]) !== JSON.stringify(image[key])) : [] };
        });
        const row = { theater, member: target.member, sourceSha256: target.sha256, sourceFile,
            sourceJsonSha256: sha256(fs.readFileSync(sourceFile)), covered: frames.filter((f: any) => f.compatibleDonors).length,
            required: frames.length, frames };
        report[row.covered === row.required ? 'complete' : row.covered ? 'partial' : 'unresolved'].push(row);
    }
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ complete: report.complete.length, partial: report.partial.length,
    unresolved: report.unresolved.length, output }));
