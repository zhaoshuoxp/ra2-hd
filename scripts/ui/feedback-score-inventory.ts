import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
const rows: any[] = [];
for (const edition of ['ra2', 'yr'] as const) for (const [side, image, pal] of [
    ['allied', 'mpascrnl.shp', 'mpascrn.pal'], ['soviet', 'mpsscrnl.shp', 'mpsscrn.pal'], ['yuri', 'mpyscrnl.shp', 'mpyscrn.pal'],
]) {
    try {
        const source = retailMember(edition, image), paletteSource = retailMember(edition, pal);
        const shp = new ShpFile(source.file), palette = Palette.fromVirtualFile(paletteSource.file), frame = shp.getImage(0);
        const pixels = new Uint8Array(shp.width * shp.height * 4);
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const index = frame.imageData[y * frame.width + x], color = palette.getColor(index), at = ((y + frame.y) * shp.width + x + frame.x) * 4;
            pixels.set([color.r, color.g, color.b, index ? 255 : 0], at);
        }
        const key = `${edition}-${side}`;
        fs.writeFileSync(path.join(out, key + '.rgba'), pixels);
        rows.push({ key, edition, side, image, palette: pal, sourceSha256: source.sha256, paletteSha256: paletteSource.sha256,
            pixelSha256: createHash('sha256').update(pixels).digest('hex'), width: shp.width, height: shp.height, status: 'RESOLVED' });
    } catch (error) { rows.push({ edition, side, status: 'UNAVAILABLE', reason: String(error) }); }
}
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify(rows, null, 2) + '\n');
console.log(rows);
