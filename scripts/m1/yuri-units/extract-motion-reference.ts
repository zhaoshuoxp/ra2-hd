// Extract only the original effect frames needed for the R11 motion comparison.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolveMember } from '../../../src/offline/retail';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { GAME_EDITIONS } from '../../../src/editions/GameEdition';
import { ShpFile } from '../../../src/data/ShpFile';
import { Palette } from '../../../src/data/Palette';

const out = process.argv[2];
if (!out) throw Error('An exclusive output directory is required');
mkdirSync(out, { recursive: false });
const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
    readFileSync(`.local/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const get = (name: string) => resolveMember(tree, name);
const palette = new Palette(get('anim.pal').file).colors.map(c => [c.r, c.g, c.b]);
for (const name of ['cdgas.shp', 'txgasr.shp']) {
    const resolved = get(name), shp = new ShpFile(resolved.file);
    const data = { member: name, archive: resolved.source,
        sha256: createHash('sha256').update(resolved.file.getBytes()).digest('hex'),
        canvas: [shp.width, shp.height], palette,
        frames: shp.images.map((frame, index) => ({ frame: index, x: frame.x, y: frame.y,
            width: frame.width, height: frame.height, pixels: Array.from(frame.imageData) })) };
    writeFileSync(`${out}/${name}.json`, JSON.stringify(data));
    console.log(name, data.canvas, data.frames.length, data.sha256);
}
