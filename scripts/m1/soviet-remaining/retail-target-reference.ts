// Decode the already imported retail cursor without executing retail programs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`.local/assets/ra2/${n}`)])));
const member = resolveMember(tree, 'mouse.shp'), pal = resolveMember(tree, 'mousepal.pal');
const shp = new ShpFile(member.file), palette = new Palette(pal.file);
const frames = [319, 320, 323, 346, 347, 348, 349, 350, 357, 279].map(index => {
    const f = shp.images[index];
    return { index, x: f.x, y: f.y, width: f.width, height: f.height, pixels: Array.from(f.imageData) };
});
writeFileSync('.artifacts/soviet-remaining/feedback-r4/retail-cursors.json', JSON.stringify({
    source: member.source, sha256: createHash('sha256').update(member.file.getBytes()).digest('hex'),
    paletteSource: pal.source, canvas: [shp.width, shp.height], palette: palette.colors.map(c => [c.r,c.g,c.b]), frames }));
