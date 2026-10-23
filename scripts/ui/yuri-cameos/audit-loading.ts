// Decode only the native Yuri loading image and its matching expansion palette.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';

const root = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
mkdirSync(output, { recursive: false });
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name, readFileSync(path.join(root,
    'assets', GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr', name))]));
const tree = editionRetailTree(top, 'yr');
const source = resolveMember(tree, 'ls800yuri.shp'), pal = resolveMember(tree, 'mpyls.pal');
const shp = new ShpFile(source.file), palette = new Palette(pal.file), frame = shp.getImage(0);
if (shp.numImages !== 1 || shp.width !== 800 || shp.height !== 600) throw Error('Unexpected native loading image');
const rgba = new Uint8Array(800 * 600 * 4);
for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const index = frame.imageData[y * frame.width + x], c = palette.colors[index];
    rgba.set([c.r, c.g, c.b, index ? 255 : 0], ((frame.y + y) * 800 + frame.x + x) * 4);
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
writeFileSync(path.join(output, 'ls800yuri.rgba'), rgba);
writeFileSync(path.join(output, 'native-source.json'), JSON.stringify({ edition: 'yr', country: 'YuriCountry',
    image: 'ls800yuri.shp', palette: 'mpyls.pal', imageSource: source.source, paletteSource: pal.source,
    imageSha256: sha(source.file.getBytes()), paletteSha256: sha(pal.file.getBytes()),
    dimensions: [800, 600], rgbaSha256: sha(rgba), coreRoot: root, readOnly: true }, null, 2) + '\n');
console.log(JSON.stringify({ imageSource: source.source, paletteSource: pal.source, dimensions: [800, 600] }));
