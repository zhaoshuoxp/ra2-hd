// Preserve exact original facility variants before proposing any source-scoped artwork repair.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { ImageFinder } from '../../src/engine/ImageFinder';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const output = process.argv[2];
assert(output);
mkdirSync(output);
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const rows = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    for (const identity of ['CALIT01E', 'CAPOL01S']) {
        const images = new Map();
        for (const letter of ['a', 'g', 't', 's', 'u', 'n', 'd']) {
            const member = identity[0].toLowerCase() + letter + identity.slice(2).toLowerCase() + '.shp';
            if (!tree.some(({ mix }) => mix.containsFile(member))) continue;
            const original = resolveMember(tree, member);
            images.set(member, original.file);
        }
        const finder = new ImageFinder(images, { settings: { extension: '.urb', newTheaterChar: 'U' } });
        const actual = finder.getFilename(identity, false);
        for (const [member, file] of images) {
            const original = resolveMember(tree, member);
            const theaterChar = member[1];
            const paletteName = { s: 'unitsno.pal', d: 'unitdes.pal', n: 'unitubn.pal', u: 'uniturb.pal' }[theaterChar] ?? 'unittem.pal';
            const paletteSource = resolveMember(tree, paletteName);
            const palette = Palette.fromVirtualFile(paletteSource.file);
            const shp = new ShpFile(file), first = shp.images[0];
            const stem = `${edition}-${member}`;
            writeFileSync(path.join(output, stem), file.getBytes(), { flag: 'wx' });
            const rgba = Buffer.alloc(first.width * first.height * 4);
            first.imageData.forEach((index, pixel) => {
                const color = palette.getColor(index);
                rgba.set([color.r, color.g, color.b, index && index !== 12 ? 255 : 0], pixel * 4);
            });
            writeFileSync(path.join(output, stem + '.rgba'), rgba, { flag: 'wx' });
            rows.push({ edition, identity, member, archive: original.source, sourceSha256: sha(file.getBytes()),
                palette: { member: paletteName, sha256: sha(paletteSource.file.getBytes()) },
                canvas: [shp.width, shp.height], frameCount: shp.numImages,
                firstFrame: { origin: [first.x, first.y], size: [first.width, first.height], rgbaSha256: sha(rgba), file: stem + '.rgba' },
                activeUrbanLookup: member === actual, actualUrbanMember: actual });
        }
    }
}
writeFileSync(path.join(output, 'report.json'), JSON.stringify({ status: 'READ_ONLY_SOURCE_VARIANTS_NOT_REPAIR_OR_COVERAGE', rows,
    sourceArchivesChanged: false, selectedResourcesChanged: false, resolution: 'Exact runtime and visual comparison pending; no facility invented or placeholder removed.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ rows: rows.length, activeUrbanRows: rows.filter(row => row.activeUrbanLookup).length }));
