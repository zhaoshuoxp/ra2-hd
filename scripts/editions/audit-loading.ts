// Independent retail decoding reference for native loading-screen validation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GAME_EDITIONS, type GameEdition } from '../../src/editions/GameEdition';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { loadingArtwork, getLoadingArtwork } from '../../src/gui/screen/game/loadingScreen/loadingArtwork';

const out = process.argv[2];
mkdirSync(out, { recursive: false });
const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const rows = [];
for (const edition of ['ra2', 'yr'] as GameEdition[]) {
    const tree = editionRetailTree(new Map(GAME_EDITIONS[edition].archives.map(name => [name,
        readFileSync(`.local/assets/${(GAME_EDITIONS.ra2.archives as readonly string[]).includes(name) ? 'ra2' : 'yr'}/${name}`)])), edition);
    for (const country of Object.keys(loadingArtwork)) {
        const artwork = getLoadingArtwork(country, edition);
        if (!artwork) continue;
        const source = resolveMember(tree, artwork.image + '.shp'), pal = resolveMember(tree, artwork.palette);
        const shp = new ShpFile(source.file), palette = new Palette(pal.file), frame = shp.getImage(0);
        if (shp.numImages !== 1 || shp.width !== 800 || shp.height !== 600) throw new Error('Unexpected retail loading dimensions');
        const rgba = new Uint8Array(800 * 600 * 4);
        let white = 0;
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const index = frame.imageData[y * frame.width + x], color = palette.colors[index];
            const offset = ((frame.y + y) * 800 + frame.x + x) * 4;
            // Canvas readback zeros the RGB values of fully transparent pixels.
            if (index) rgba.set([color.r, color.g, color.b, 255], offset);
            if (color.r >= 240 && color.g >= 240 && color.b >= 240) white++;
        }
        const row = { edition, country, ...artwork, imageSource: source.source, paletteSource: pal.source,
            sourceSha256: hash(source.file.getBytes()), paletteSha256: hash(pal.file.getBytes()),
            rgbaSha256: hash(rgba), whiteFraction: white / (800 * 600) };
        if ((edition === 'ra2' && country !== 'Observer') || country === 'YuriCountry') {
            const [x, y, width, height] = country === 'YuriCountry' ? [100, 250, 250, 304] : [487, 400, 242, 121];
            const flag = new Uint8Array(width * height * 4);
            for (let line = 0; line < height; line++) flag.set(rgba.subarray(((y + line) * 800 + x) * 4,
                ((y + line) * 800 + x + width) * 4), line * width * 4);
            Object.assign(row, { flag: { width, height, rgbaSha256: hash(flag) } });
        }
        rows.push(row);
    }
}
writeFileSync(`${out}/references.json`, JSON.stringify(rows, null, 2));
console.log(`Validated ${rows.length} retail image/palette pairs`);
